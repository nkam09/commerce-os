/**
 * Recurring Task Service
 *
 * Creates PMTask instances from active RecurringTask templates when their
 * `nextRunDate` is due (<= today UTC). Idempotent per (template, nextRunDate):
 * after creating a task we advance `nextRunDate` by the template's frequency.
 *
 * Called from:
 *   - worker-entry.ts (every cycle, for the single-tenant resolveUserId)
 *   - /api/pm/recurring-tasks/run (manual trigger, for testing)
 */
import { prisma } from "@/lib/db/prisma";
import type { RecurringTask } from "@prisma/client";
import { computeNextRunDate } from "@/lib/types/recurring-task";

// Re-export for backwards compatibility with any existing imports from this service file.
export { computeNextRunDate };

/**
 * Run all due recurring task templates for a user. Creates PMTask rows in the
 * template's configured list (if any), then advances `nextRunDate`.
 * Returns a tally of how many tasks were created.
 */
export async function runRecurringTasks(userId: string): Promise<{ created: number; skipped: number }> {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  const due: RecurringTask[] = await prisma.recurringTask.findMany({
    where: { userId, active: true, nextRunDate: { lte: now } },
  });

  let created = 0;
  let skipped = 0;

  for (const rt of due) {
    try {
      // Catch up: if the template was paused / worker was down for a while,
      // we advance nextRunDate until it's after "now" and create ONE task per
      // missed period (capped to 30 to avoid runaway creation on misconfig).
      let cursor = new Date(rt.nextRunDate);
      cursor.setUTCHours(0, 0, 0, 0);
      let iterations = 0;

      while (cursor <= now && iterations < 30) {
        if (rt.listId) {
          // Resolve the list's default "open" status — just use the first one.
          const list = await prisma.pMList.findUnique({ where: { id: rt.listId } });
          const statuses = Array.isArray(list?.statuses) ? (list!.statuses as string[]) : ["To Do"];
          const defaultStatus = typeof statuses[0] === "string" ? statuses[0] : "To Do";

          await prisma.pMTask.create({
            data: {
              listId: rt.listId,
              title: rt.title,
              description: rt.description,
              status: defaultStatus,
              priority: "Medium",
              dueDate: new Date(cursor),
            },
          });
          created++;
        } else {
          // No list configured: count as skipped but still advance date
          skipped++;
        }
        cursor = computeNextRunDate(cursor, rt.frequency, rt.intervalDays);
        iterations++;
      }

      await prisma.recurringTask.update({
        where: { id: rt.id },
        data: {
          nextRunDate: cursor,
          lastRunDate: now,
        },
      });
    } catch (err) {
      console.error(`[recurring-tasks] failed for template ${rt.id}:`, err);
    }
  }

  if (due.length > 0) {
    console.log(`[recurring-tasks] userId=${userId} processed ${due.length} templates, created ${created} tasks`);
  }
  return { created, skipped };
}
