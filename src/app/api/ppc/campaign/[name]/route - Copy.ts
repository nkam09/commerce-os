import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getCampaignDetail } from "@/lib/services/ppc-service";
import { apiSuccess, apiServerError, apiUnauthorized, parseBrand } from "@/lib/utils/api";

/**
 * GET /api/ppc/campaign/:name?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns full campaign detail for the slide-over panel.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { name } = await params;
    const campaignName = decodeURIComponent(name);
    const sp = req.nextUrl.searchParams;

    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const now = new Date();
    const dateTo = toParam
      ? new Date(toParam + "T23:59:59.999Z")
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const dateFrom = fromParam
      ? new Date(fromParam + "T00:00:00Z")
      : new Date(dateTo.getTime() - 30 * 86400000);

    console.log(`[ppc/campaign] detail for "${campaignName.slice(0, 40)}" | from=${dateFrom.toISOString().slice(0, 10)} to=${dateTo.toISOString().slice(0, 10)}`);

    const brand = parseBrand(sp);
    const detail = await getCampaignDetail(userId, campaignName, dateFrom, dateTo, brand);
    return apiSuccess(detail);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") return apiUnauthorized();
    console.error("[ppc/campaign] error:", err);
    return apiServerError(err);
  }
}
