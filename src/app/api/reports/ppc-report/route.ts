/**
 * GET /api/reports/ppc-report
 *
 * Generates the 8-tab PPC Maintenance Report as an .xlsx download.
 *
 * Query params:
 *   from  (YYYY-MM-DD, optional) — defaults to 30 days ago
 *   to    (YYYY-MM-DD, optional) — defaults to today
 *
 * Auth: Clerk. Pipeline: ppc-report-service → ppc-report-builder.
 *
 * The Ads report fetching is time-consuming (minutes), so the route
 * deliberately has no timeout-wrapping; Next.js route handlers should be
 * deployed on a runtime with sufficient execution time. If any upstream
 * source fails, the builder still produces a workbook with the tabs that
 * succeeded plus a Summary sheet listing warnings.
 */

import { requireUser } from "@/lib/auth/require-user";
import { apiError, apiUnauthorized, parseBrand } from "@/lib/utils/api";
import { generatePPCReportData } from "@/lib/services/ppc-report-service";
import { buildPPCReportWorkbook } from "@/lib/services/ppc-report-builder";

export const dynamic = "force-dynamic";
// Allow long execution time for cascaded Ads API report polling.
export const maxDuration = 300;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

export async function GET(req: Request) {
  try {
    const { userId } = await requireUser();

    const url = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const from = fromParam && isValidDate(fromParam) ? fromParam : formatDate(defaultFrom);
    const to = toParam && isValidDate(toParam) ? toParam : formatDate(now);

    if (new Date(from) > new Date(to)) {
      return apiError("`from` must be on or before `to`", 400);
    }

    const brand = parseBrand(url.searchParams);
    const data = await generatePPCReportData({
      userId,
      from,
      to,
      brand,
    });

    const buffer = await buildPPCReportWorkbook(data);

    const filename = `ppc-report-${from}-to-${to}.xlsx`;

    const headers: Record<string, string> = {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
      // Lets the Content-Disposition + our custom warnings header through CORS
      // and makes the custom header readable from fetch() in the browser.
      "Access-Control-Expose-Headers": "Content-Disposition, X-Report-Warnings",
    };
    if (data.warnings && data.warnings.length > 0) {
      // Base64-encode JSON so arbitrary Unicode in warning messages doesn't
      // violate HTTP header byte restrictions.
      headers["X-Report-Warnings"] = Buffer.from(
        JSON.stringify(data.warnings),
        "utf-8"
      ).toString("base64");
    }

    return new Response(new Uint8Array(buffer), { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiUnauthorized();
    }
    console.error("[api/reports/ppc-report] failed:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to generate PPC report",
      500
    );
  }
}
