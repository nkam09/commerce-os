/**
 * Google Calendar one-way sync service.
 *
 * Push tasks, orders (production-end + delivery), and experiments from our DB
 * into the user's primary Google Calendar as events. We use
 * `google_calendar_events` to remember which Google event ID corresponds to
 * each of our entities so re-syncs update (patch) rather than create duplicates.
 *
 * Failure mode: every Google call is try/caught individually so one bad event
 * doesn't block the rest. Missing/invalid credentials → no-op with a log.
 *
 * Called from:
 *   - worker-entry.ts (every worker cycle)
 *   - POST /api/auth/google/sync-now (manual trigger)
 */
import { prisma } from "@/lib/db/prisma";
import { google } from "googleapis";
import { getOAuthClient, isGoogleConfigured } from "@/lib/google/google-oauth-client";
import type { OAuth2Client } from "google-auth-library";

export type SyncResult = { created: number; updated: number; deleted: number; skipped?: string };

type EntityType = "task" | "order_prod" | "order_delivery" | "experiment";

function toDateYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns an authorized client, refreshing the access token if needed. */
async function getAuthorizedClient(userId: string): Promise<{
  client: OAuth2Client;
  connectionId: string;
  calendarId: string;
} | null> {
  if (!isGoogleConfigured()) return null;
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  if (!connection || !connection.syncEnabled) return null;

  const client = getOAuthClient();
  if (!client) return null;

  client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.expiresAt.getTime(),
  });

  // Refresh if expired (or within 60s of expiring)
  const bufferMs = 60_000;
  if (connection.expiresAt.getTime() - Date.now() < bufferMs) {
    try {
      const { credentials } = await client.refreshAccessToken();
      if (credentials.access_token && credentials.expiry_date) {
        await prisma.googleCalendarConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: credentials.access_token,
            expiresAt: new Date(credentials.expiry_date),
            // refreshToken stays the same unless Google rotates it
            ...(credentials.refresh_token
              ? { refreshToken: credentials.refresh_token }
              : {}),
          },
        });
        client.setCredentials(credentials);
      }
    } catch (err) {
      console.error("[google-calendar-sync] token refresh failed:", err);
      return null;
    }
  }

  return { client, connectionId: connection.id, calendarId: connection.calendarId };
}

type EventPayload = {
  entityType: EntityType;
  entityId: string;
  summary: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (exclusive for all-day events in Google — we pass +1 day)
};

export async function syncToGoogleCalendar(userId: string): Promise<SyncResult> {
  const auth = await getAuthorizedClient(userId);
  if (!auth) {
    return { created: 0, updated: 0, deleted: 0, skipped: "not-configured-or-disabled" };
  }
  const { client, connectionId, calendarId } = auth;
  const calendar = google.calendar({ version: "v3", auth: client });

  // Build the set of events we want in Google Calendar.
  const payloads: EventPayload[] = [];

  // Tasks with due dates, excluding done
  const tasks = await prisma.pMTask.findMany({
    where: {
      list: { space: { userId } },
      dueDate: { not: null },
      status: { notIn: ["Done", "Complete", "Completed"] },
    },
    select: { id: true, title: true, description: true, dueDate: true },
  });
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const start = toDateYmd(t.dueDate);
    payloads.push({
      entityType: "task",
      entityId: t.id,
      summary: `Task: ${t.title}`,
      description: t.description ?? "",
      startDate: start,
      endDate: start, // service will +1 for Google all-day end-exclusive
    });
  }

  // Orders: est/actual production end + delivery dates
  const orders = await prisma.supplierOrder.findMany({
    where: { space: { userId }, status: { not: "Cancelled" } },
    select: {
      id: true,
      orderNumber: true,
      supplier: true,
      orderDate: true,
      estProductionDays: true,
      estDeliveryDays: true,
      actProductionEnd: true,
      actDeliveryDate: true,
    },
  });
  for (const o of orders) {
    // Production end: prefer actual when set
    let prodEnd: Date | null = o.actProductionEnd;
    if (!prodEnd && o.estProductionDays && o.orderDate) {
      prodEnd = new Date(o.orderDate);
      prodEnd.setDate(prodEnd.getDate() + o.estProductionDays);
    }
    if (prodEnd) {
      const d = toDateYmd(prodEnd);
      payloads.push({
        entityType: "order_prod",
        entityId: o.id,
        summary: `Order ${o.orderNumber}: Production end`,
        description: `Supplier: ${o.supplier}`,
        startDate: d,
        endDate: d,
      });
    }

    // Delivery date
    let delivery: Date | null = o.actDeliveryDate;
    if (!delivery && o.estDeliveryDays && o.orderDate) {
      delivery = new Date(o.orderDate);
      delivery.setDate(delivery.getDate() + o.estDeliveryDays);
    }
    if (delivery) {
      const d = toDateYmd(delivery);
      payloads.push({
        entityType: "order_delivery",
        entityId: o.id,
        summary: `Order ${o.orderNumber}: Delivery`,
        description: `Supplier: ${o.supplier}`,
        startDate: d,
        endDate: d,
      });
    }
  }

  // Experiments: multi-day events
  const experiments = await prisma.experiment.findMany({
    where: { userId, status: { not: "Cancelled" } },
    select: {
      id: true,
      title: true,
      type: true,
      description: true,
      asin: true,
      startDate: true,
      endDate: true,
    },
  });
  for (const e of experiments) {
    const descLines: string[] = [];
    if (e.asin) descLines.push(`ASIN: ${e.asin}`);
    if (e.description) descLines.push(e.description);
    payloads.push({
      entityType: "experiment",
      entityId: e.id,
      summary: `${e.type}: ${e.title}`,
      description: descLines.join("\n"),
      startDate: toDateYmd(e.startDate),
      endDate: toDateYmd(e.endDate),
    });
  }

  // Upsert each event against Google Calendar using our tracking table.
  const existing = await prisma.googleCalendarEvent.findMany({
    where: { connectionId },
  });
  const existingMap = new Map<string, typeof existing[number]>();
  for (const e of existing) {
    existingMap.set(`${e.entityType}:${e.entityId}`, e);
  }
  const seen = new Set<string>();

  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const p of payloads) {
    const key = `${p.entityType}:${p.entityId}`;
    seen.add(key);
    // Google Calendar treats all-day `end.date` as exclusive, so +1
    const endDate = new Date(p.endDate + "T00:00:00");
    endDate.setDate(endDate.getDate() + 1);
    const endDateYmd = toDateYmd(endDate);

    const eventResource = {
      summary: p.summary,
      description: p.description || undefined,
      start: { date: p.startDate },
      end: { date: endDateYmd },
    };

    const tracked = existingMap.get(key);
    try {
      if (tracked) {
        await calendar.events.patch({
          calendarId,
          eventId: tracked.googleEventId,
          requestBody: eventResource,
        });
        await prisma.googleCalendarEvent.update({
          where: { id: tracked.id },
          data: { lastSyncedAt: new Date() },
        });
        updated++;
      } else {
        const res = await calendar.events.insert({
          calendarId,
          requestBody: eventResource,
        });
        const googleEventId = res.data.id;
        if (googleEventId) {
          await prisma.googleCalendarEvent.create({
            data: {
              connectionId,
              entityType: p.entityType,
              entityId: p.entityId,
              googleEventId,
            },
          });
          created++;
        }
      }
    } catch (err) {
      console.error(
        `[google-calendar-sync] upsert failed for ${key}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // Delete events whose entities have been removed from our DB
  for (const [key, tracked] of existingMap.entries()) {
    if (seen.has(key)) continue;
    try {
      await calendar.events.delete({ calendarId, eventId: tracked.googleEventId });
    } catch (err) {
      // 404 / 410 is fine — event was already gone on Google's side
      const message = err instanceof Error ? err.message : String(err);
      if (!/(410|404|Not Found|Gone)/i.test(message)) {
        console.error(`[google-calendar-sync] delete failed for ${key}:`, message);
      }
    }
    await prisma.googleCalendarEvent.delete({ where: { id: tracked.id } });
    deleted++;
  }

  await prisma.googleCalendarConnection.update({
    where: { id: connectionId },
    data: { lastSyncedAt: new Date() },
  });

  return { created, updated, deleted };
}
