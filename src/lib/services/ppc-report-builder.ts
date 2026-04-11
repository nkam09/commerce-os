/**
 * PPC Report Builder
 *
 * Turns the PPCReportData shape produced by ppc-report-service into an
 * 8-tab ExcelJS workbook. Emphasis is on a consistent look-and-feel:
 *
 *   - Arial 10, header row bold on dark-blue fill with white text
 *   - Frozen top row in every data tab
 *   - Currency (USD), percentage, and integer number formats
 *   - Conditional red fill on rows where a flag column is TRUE
 *   - Each tab has a distinct tab color
 *   - A "Summary" intro sheet lists the report period, generation time,
 *     and any warnings emitted by the data service.
 *
 * The builder returns a Node Buffer which the route handler streams back
 * to the browser as an .xlsx download.
 */

import ExcelJS from "exceljs";
import type {
  PPCReportData,
  DailyTrendRow,
  CampaignRow,
  PlacementRow,
  SkuPnlRow,
  SearchTermRow,
  KeywordRow,
  CompetitiveRow,
  MonthlySummaryRow,
} from "@/lib/services/ppc-report-service";

// ─── Formatting constants ────────────────────────────────────────────────────

const FONT_NAME = "Arial";
const FONT_SIZE = 10;

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F2F4E" }, // dark navy
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: FONT_SIZE,
  bold: true,
  color: { argb: "FFFFFFFF" },
};
const FLAG_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFDE2E2" }, // light red
};
const BODY_FONT: Partial<ExcelJS.Font> = {
  name: FONT_NAME,
  size: FONT_SIZE,
};

const FMT_CURRENCY = '"$"#,##0.00;("$"#,##0.00);-';
const FMT_PERCENT = "0.0%;(0.0%);-";
const FMT_INT = "#,##0;(#,##0);-";
const FMT_DECIMAL = "#,##0.00;(#,##0.00);-";

// ─── Column definitions ─────────────────────────────────────────────────────

type ColDef<T> = {
  header: string;
  key: keyof T & string;
  width: number;
  format?: string;
};

function applyHeaderStyle(row: ExcelJS.Row): void {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.alignment = { horizontal: "center", vertical: "middle" };
  row.height = 20;
}

function applyBodyFont(ws: ExcelJS.Worksheet): void {
  ws.eachRow({ includeEmpty: false }, (row, rowIdx) => {
    if (rowIdx === 1) return;
    row.font = BODY_FONT;
  });
}

/**
 * Apply light-red fill to every row where any of the given flag columns is
 * truthy. Flag columns are also hidden from the rendered output by setting
 * their width to 0 (the boolean drives formatting only).
 */
function applyFlagFormatting<T>(
  ws: ExcelJS.Worksheet,
  cols: ColDef<T>[],
  flagKeys: (keyof T & string)[]
): void {
  const flagColNumbers = flagKeys.map((k) => {
    const idx = cols.findIndex((c) => c.key === k);
    return idx >= 0 ? idx + 1 : -1;
  }).filter((n) => n > 0);

  ws.eachRow({ includeEmpty: false }, (row, rowIdx) => {
    if (rowIdx === 1) return;
    const anyFlag = flagColNumbers.some((n) => row.getCell(n).value === true);
    if (anyFlag) {
      row.fill = FLAG_FILL;
    }
  });

  // Hide flag columns from view
  for (const n of flagColNumbers) {
    ws.getColumn(n).hidden = true;
  }
}

function buildSheet<T>(
  wb: ExcelJS.Workbook,
  name: string,
  tabColor: string,
  cols: ColDef<T>[],
  rows: T[],
  flagKeys: (keyof T & string)[] = []
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = cols.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
    style: c.format
      ? { numFmt: c.format, font: BODY_FONT }
      : { font: BODY_FONT },
  }));

  for (const r of rows) {
    ws.addRow(r);
  }

  applyHeaderStyle(ws.getRow(1));
  applyBodyFont(ws);
  if (flagKeys.length > 0) {
    applyFlagFormatting(ws, cols, flagKeys);
  }

  return ws;
}

// ─── Summary sheet ──────────────────────────────────────────────────────────

function buildSummarySheet(wb: ExcelJS.Workbook, data: PPCReportData): void {
  const ws = wb.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FF1F2F4E" } },
  });

  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 80;

  const title = ws.getCell("A1");
  title.value = "PPC Maintenance Report";
  title.font = { name: FONT_NAME, size: 16, bold: true };
  ws.mergeCells("A1:B1");

  const rows: [string, string | number][] = [
    ["Period", `${data.period.from} → ${data.period.to}`],
    ["Generated", data.generatedAt],
    ["Daily trend rows", data.dailyTrend.length],
    ["Campaigns", data.campaigns.length],
    ["Placements", data.placements.length],
    ["SKU P&L rows", data.skuPnl.length],
    ["Search terms", data.searchTerms.length],
    ["Keywords", data.keywords.length],
    ["Competitive rows", data.competitive.length],
    ["Months", data.monthlySummary.length],
  ];

  ws.addRow([]);
  for (const [label, value] of rows) {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { ...BODY_FONT, bold: true };
    r.getCell(2).font = BODY_FONT;
  }

  if (data.warnings.length > 0) {
    ws.addRow([]);
    const h = ws.addRow(["Warnings", ""]);
    h.getCell(1).font = { ...BODY_FONT, bold: true, color: { argb: "FFB00020" } };
    for (const w of data.warnings) {
      const r = ws.addRow(["", w]);
      r.getCell(2).font = { ...BODY_FONT, color: { argb: "FFB00020" } };
      r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }
  }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function buildPPCReportWorkbook(
  data: PPCReportData
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Commerce OS";
  wb.created = new Date();

  buildSummarySheet(wb, data);

  // ── Tab 1: Daily Trend ──
  const dailyCols: ColDef<DailyTrendRow>[] = [
    { header: "Date", key: "date", width: 12 },
    { header: "Impressions", key: "impressions", width: 14, format: FMT_INT },
    { header: "Clicks", key: "clicks", width: 10, format: FMT_INT },
    { header: "Spend", key: "spend", width: 12, format: FMT_CURRENCY },
    { header: "Sales", key: "sales", width: 12, format: FMT_CURRENCY },
    { header: "Orders", key: "orders", width: 10, format: FMT_INT },
    { header: "ACoS", key: "acos", width: 10, format: FMT_PERCENT },
    { header: "RoAS", key: "roas", width: 10, format: FMT_DECIMAL },
    { header: "CTR", key: "ctr", width: 10, format: FMT_PERCENT },
    { header: "CPC", key: "cpc", width: 10, format: FMT_CURRENCY },
    { header: "CVR", key: "cvr", width: 10, format: FMT_PERCENT },
    { header: "ACoS High", key: "flagAcosHigh", width: 8 },
    { header: "RoAS Low", key: "flagRoasLow", width: 8 },
  ];
  buildSheet(wb, "Daily Trend", "FF2E75B6", dailyCols, data.dailyTrend, [
    "flagAcosHigh",
    "flagRoasLow",
  ]);

  // ── Tab 2: Campaigns ──
  const campaignCols: ColDef<CampaignRow>[] = [
    { header: "Campaign ID", key: "campaignId", width: 16 },
    { header: "Campaign", key: "campaignName", width: 40 },
    { header: "Status", key: "status", width: 12 },
    { header: "Budget", key: "budget", width: 12, format: FMT_CURRENCY },
    { header: "Budget Type", key: "budgetType", width: 14 },
    { header: "Impressions", key: "impressions", width: 14, format: FMT_INT },
    { header: "Clicks", key: "clicks", width: 10, format: FMT_INT },
    { header: "Spend", key: "spend", width: 12, format: FMT_CURRENCY },
    { header: "Sales", key: "sales", width: 12, format: FMT_CURRENCY },
    { header: "Orders", key: "orders", width: 10, format: FMT_INT },
    { header: "Units Sold", key: "unitsSold", width: 12, format: FMT_INT },
    { header: "ACoS", key: "acos", width: 10, format: FMT_PERCENT },
    { header: "RoAS", key: "roas", width: 10, format: FMT_DECIMAL },
    { header: "CTR", key: "ctr", width: 10, format: FMT_PERCENT },
    { header: "CPC", key: "cpc", width: 10, format: FMT_CURRENCY },
    { header: "CVR", key: "cvr", width: 10, format: FMT_PERCENT },
    { header: "High ACoS", key: "flagHighAcos", width: 8 },
    { header: "No Sales", key: "flagNoSales", width: 8 },
  ];
  buildSheet(wb, "Campaigns", "FF548235", campaignCols, data.campaigns, [
    "flagHighAcos",
    "flagNoSales",
  ]);

  // ── Tab 3: Placements ──
  const placementCols: ColDef<PlacementRow>[] = [
    { header: "Campaign ID", key: "campaignId", width: 16 },
    { header: "Campaign", key: "campaignName", width: 40 },
    { header: "Placement", key: "placement", width: 24 },
    { header: "Impressions", key: "impressions", width: 14, format: FMT_INT },
    { header: "Clicks", key: "clicks", width: 10, format: FMT_INT },
    { header: "Spend", key: "spend", width: 12, format: FMT_CURRENCY },
    { header: "Sales", key: "sales", width: 12, format: FMT_CURRENCY },
    { header: "ACoS", key: "acos", width: 10, format: FMT_PERCENT },
    { header: "RoAS", key: "roas", width: 10, format: FMT_DECIMAL },
  ];
  buildSheet(wb, "Placements", "FFBF8F00", placementCols, data.placements);

  // ── Tab 4: Per-SKU P&L ──
  const skuPnlCols: ColDef<SkuPnlRow>[] = [
    { header: "ASIN", key: "asin", width: 14 },
    { header: "SKU", key: "sku", width: 20 },
    { header: "Units Sold", key: "unitsSold", width: 12, format: FMT_INT },
    { header: "Gross Sales", key: "grossSales", width: 14, format: FMT_CURRENCY },
    { header: "Ad Spend", key: "adSpend", width: 12, format: FMT_CURRENCY },
    { header: "Ad Sales", key: "adSales", width: 12, format: FMT_CURRENCY },
    { header: "Organic Sales", key: "organicSales", width: 14, format: FMT_CURRENCY },
    { header: "COGS", key: "cogs", width: 12, format: FMT_CURRENCY },
    { header: "Referral Fees", key: "referralFees", width: 14, format: FMT_CURRENCY },
    { header: "FBA Fees", key: "fbaFees", width: 12, format: FMT_CURRENCY },
    { header: "Other Fees", key: "otherFees", width: 12, format: FMT_CURRENCY },
    { header: "Refunds", key: "refundAmount", width: 12, format: FMT_CURRENCY },
    { header: "Net Profit", key: "netProfit", width: 14, format: FMT_CURRENCY },
    { header: "Margin %", key: "marginPct", width: 10, format: FMT_PERCENT },
    { header: "TACoS", key: "tacos", width: 10, format: FMT_PERCENT },
    { header: "Neg Margin", key: "flagNegativeMargin", width: 8 },
    { header: "High TACoS", key: "flagHighTacos", width: 8 },
  ];
  buildSheet(wb, "SKU P&L", "FFC00000", skuPnlCols, data.skuPnl, [
    "flagNegativeMargin",
    "flagHighTacos",
  ]);

  // ── Tab 5: Search Terms ──
  const stCols: ColDef<SearchTermRow>[] = [
    { header: "Campaign ID", key: "campaignId", width: 16 },
    { header: "Campaign", key: "campaignName", width: 32 },
    { header: "Ad Group", key: "adGroupName", width: 24 },
    { header: "Search Term", key: "searchTerm", width: 36 },
    { header: "Targeting", key: "targeting", width: 24 },
    { header: "Impressions", key: "impressions", width: 14, format: FMT_INT },
    { header: "Clicks", key: "clicks", width: 10, format: FMT_INT },
    { header: "Spend", key: "spend", width: 12, format: FMT_CURRENCY },
    { header: "Sales", key: "sales", width: 12, format: FMT_CURRENCY },
    { header: "Orders", key: "orders", width: 10, format: FMT_INT },
    { header: "ACoS", key: "acos", width: 10, format: FMT_PERCENT },
    { header: "RoAS", key: "roas", width: 10, format: FMT_DECIMAL },
    { header: "CVR", key: "cvr", width: 10, format: FMT_PERCENT },
    { header: "Wasted", key: "flagWastedSpend", width: 8 },
    { header: "Top", key: "flagHighPerformer", width: 8 },
  ];
  buildSheet(wb, "Search Terms", "FF7030A0", stCols, data.searchTerms, [
    "flagWastedSpend",
  ]);

  // ── Tab 6: Keywords ──
  const kwCols: ColDef<KeywordRow>[] = [
    { header: "Campaign ID", key: "campaignId", width: 16 },
    { header: "Campaign", key: "campaignName", width: 32 },
    { header: "Ad Group", key: "adGroupName", width: 24 },
    { header: "Keyword ID", key: "keywordId", width: 14 },
    { header: "Keyword", key: "keyword", width: 32 },
    { header: "Match Type", key: "matchType", width: 12 },
    { header: "Bid", key: "bid", width: 10, format: FMT_CURRENCY },
    { header: "Impressions", key: "impressions", width: 14, format: FMT_INT },
    { header: "Clicks", key: "clicks", width: 10, format: FMT_INT },
    { header: "Spend", key: "spend", width: 12, format: FMT_CURRENCY },
    { header: "Sales", key: "sales", width: 12, format: FMT_CURRENCY },
    { header: "Orders", key: "orders", width: 10, format: FMT_INT },
    { header: "ACoS", key: "acos", width: 10, format: FMT_PERCENT },
    { header: "RoAS", key: "roas", width: 10, format: FMT_DECIMAL },
    { header: "Organic Rank", key: "organicRank", width: 12, format: FMT_INT },
    { header: "Sponsored Rank", key: "sponsoredRank", width: 14, format: FMT_INT },
    { header: "Search Volume", key: "searchVolume", width: 14, format: FMT_INT },
    { header: "Under", key: "flagUnderperforming", width: 8 },
    { header: "Bid High", key: "flagBidTooHigh", width: 8 },
  ];
  buildSheet(wb, "Keywords", "FF00B0F0", kwCols, data.keywords, [
    "flagUnderperforming",
    "flagBidTooHigh",
  ]);

  // ── Tab 7: Competitive ──
  const compCols: ColDef<CompetitiveRow>[] = [
    { header: "ASIN", key: "asin", width: 14 },
    { header: "Competitor ASIN", key: "competitorAsin", width: 16 },
    { header: "Title", key: "competitorTitle", width: 48 },
    { header: "Brand", key: "competitorBrand", width: 20 },
    { header: "Price", key: "competitorPrice", width: 12, format: FMT_CURRENCY },
    { header: "Rating", key: "competitorRating", width: 10, format: FMT_DECIMAL },
    { header: "Reviews", key: "competitorReviewCount", width: 12, format: FMT_INT },
  ];
  buildSheet(wb, "Competitive", "FFED7D31", compCols, data.competitive);

  // ── Tab 8: Monthly Summary ──
  const monthCols: ColDef<MonthlySummaryRow>[] = [
    { header: "Month", key: "month", width: 12 },
    { header: "Impressions", key: "impressions", width: 14, format: FMT_INT },
    { header: "Clicks", key: "clicks", width: 10, format: FMT_INT },
    { header: "Spend", key: "spend", width: 12, format: FMT_CURRENCY },
    { header: "Sales", key: "sales", width: 12, format: FMT_CURRENCY },
    { header: "Orders", key: "orders", width: 10, format: FMT_INT },
    { header: "ACoS", key: "acos", width: 10, format: FMT_PERCENT },
    { header: "RoAS", key: "roas", width: 10, format: FMT_DECIMAL },
    { header: "CTR", key: "ctr", width: 10, format: FMT_PERCENT },
    { header: "CPC", key: "cpc", width: 10, format: FMT_CURRENCY },
    { header: "CVR", key: "cvr", width: 10, format: FMT_PERCENT },
  ];
  buildSheet(wb, "Monthly Summary", "FF375623", monthCols, data.monthlySummary);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
