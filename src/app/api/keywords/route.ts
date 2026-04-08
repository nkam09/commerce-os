import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import {
  getKeywordSummary,
  getKeywordRows,
  getSearchTermRows,
} from "@/lib/services/keyword-service";
import { apiSuccess, apiServerError, apiUnauthorized } from "@/lib/utils/api";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const sp = req.nextUrl.searchParams;

    const tab = sp.get("tab") ?? "keywords";
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const search = sp.get("search") ?? undefined;
    const matchType = sp.get("matchType") ?? undefined;
    const minSpend = sp.get("minSpend") ? Number(sp.get("minSpend")) : undefined;
    const maxAcos = sp.get("maxAcos") ? Number(sp.get("maxAcos")) : undefined;

    // Default dates: last 30 days
    const now = new Date();
    const dateTo = toParam ? new Date(toParam + "T23:59:59Z") : now;
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00Z")
      : new Date(now.getTime() - 30 * 86400000);

    console.log("[keywords-api] params:", { tab, from: dateFrom.toISOString().slice(0, 10), to: dateTo.toISOString().slice(0, 10), search, matchType, minSpend, maxAcos });

    const summary = await getKeywordSummary(userId, dateFrom, dateTo);

    const rows =
      tab === "searchterms"
        ? await getSearchTermRows(userId, dateFrom, dateTo, { search, minSpend })
        : await getKeywordRows(userId, dateFrom, dateTo, { search, matchType, minSpend, maxAcos });

    console.log("[keywords-api] result:", { summarySpend: summary.totalSpend, rowCount: rows.length });

    return apiSuccess({ summary, rows });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    return apiServerError(err);
  }
}
