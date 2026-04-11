/**
 * Sellerboard Historical Import
 *
 * Reads Sellerboard P&L CSV exports (transposed: columns = dates, rows = metrics)
 * and upserts daily_sales, daily_fees, and daily_ads.
 *
 * Usage:
 *   npx --yes dotenv-cli -- npx tsx src/scripts/import-sellerboard-history.ts <ASIN> <folder_path>
 *
 * Example:
 *   npx --yes dotenv-cli -- npx tsx src/scripts/import-sellerboard-history.ts B07XYBW774 ./exports/B07XYBW774
 *
 * CSV format:
 *   Row 0:  Parameter/Date, 31 January 2026, 30 January 2026, ..., Total
 *   Row 1+: <metric label>, <value for date 1>, <value for date 2>, ..., <total>
 *
 *   Child rows are indented with 4 spaces (e.g. "    Organic", "    FBA per unit fulfilment fee").
 *   Values are plain numbers — no currency symbols; negatives have a leading minus.
 *
 * Safety:
 *   - Only imports dates strictly BEFORE 2026-02-01. February 2026+ is owned by
 *     the live pipeline (settlement reports + sync-orders). We don't overwrite it.
 *   - Skips a date only if ALL values for that date are zero. Dates with only
 *     fees (no sales) still get imported.
 *   - Marketplace is hard-coded to US (ATVPDKIKX0DER).
 */

import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";

// ─── Constants ──────────────────────────────────────────────────────────────

const MARKETPLACE_CODE = "ATVPDKIKX0DER";
const CUTOFF_DATE = new Date(Date.UTC(2026, 1, 1)); // 2026-02-01 (month is 0-indexed)

// ─── Types ──────────────────────────────────────────────────────────────────

type DailyPoint = {
  date: Date; // UTC midnight

  // daily_sales
  grossSales: number;
  unitsSold: number;
  refundCount: number;
  refundAmount: number;
  promoAmount: number;
  refundCommission: number;
  refundedReferralFee: number;

  // daily_fees
  referralFee: number;
  fbaFee: number;
  storageFee: number;
  awdStorageFee: number;
  otherFees: number;
  reimbursement: number;

  // daily_ads
  adSpend: number;
  attributedSales: number;
};

type Totals = {
  salesWritten: number;
  feesWritten: number;
  adsWritten: number;
  datesSkippedAllZero: number;
  datesSkippedCutoff: number;
  filesFailed: number;
  earliestDate: string | null;
  latestDate: string | null;
};

// ─── CSV parsing ────────────────────────────────────────────────────────────

/**
 * Splits a single CSV line into fields, handling double-quoted values.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

const MONTH_NAME_TO_IDX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parses a Sellerboard date header like "31 January 2026" to a UTC midnight Date.
 * Returns null for "Total", blanks, or unparseable strings.
 */
function parseSellerboardDate(raw: string): Date | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  if (!s || s.toLowerCase() === "total" || s.toLowerCase().startsWith("parameter")) {
    return null;
  }
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTH_NAME_TO_IDX[m[2].toLowerCase()];
  const year = parseInt(m[3], 10);
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  return new Date(Date.UTC(year, month, day));
}

/**
 * Parses a numeric cell. Accepts plain numbers, negatives, and blanks.
 * Removes thousands separators and stray currency symbols defensively.
 */
function parseNum(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim().replace(/^"|"$/g, "").replace(/[,$\s]/g, "");
  if (!s || s === "-") return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ─── Row label classifier ──────────────────────────────────────────────────

/**
 * Normalised label → field on DailyPoint.
 * Preserves leading spaces so we can distinguish parent vs child rows.
 */
function applyRow(
  rawLabel: string,
  values: number[],
  dates: (Date | null)[],
  dayMap: Map<string, DailyPoint>
): void {
  // Preserve leading whitespace for indent detection; only trim trailing.
  const label = rawLabel.replace(/\s+$/, "").replace(/^"|"$/g, "");

  // Top-level parents
  if (label === "Sales") {
    applyToDays(values, dates, dayMap, (pt, v) => { pt.grossSales = v; });
    return;
  }
  if (label === "Units") {
    applyToDays(values, dates, dayMap, (pt, v) => { pt.unitsSold = Math.round(v); });
    return;
  }
  if (label === "Refunds") {
    applyToDays(values, dates, dayMap, (pt, v) => { pt.refundCount = Math.round(v); });
    return;
  }
  if (label === "Promo") {
    applyToDays(values, dates, dayMap, (pt, v) => { pt.promoAmount = Math.abs(v); });
    return;
  }
  if (label === "Advertising cost" || label === "Advertising Cost") {
    applyToDays(values, dates, dayMap, (pt, v) => { pt.adSpend = Math.abs(v); });
    return;
  }

  // Child rows (indented). Use label exactly as specified.
  switch (label) {
    case "    Refunded amount":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.refundAmount = Math.abs(v); });
      return;
    case "    Refund commission":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.refundCommission = Math.abs(v); });
      return;
    case "    Refunded referral fee":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.refundedReferralFee = v; });
      return;

    case "    Sponsored Products (same day)":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.attributedSales = v; });
      return;

    case "    FBA per unit fulfilment fee":
    case "    FBA per unit fulfillment fee":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.fbaFee = Math.abs(v); });
      return;
    case "    Referral fee":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.referralFee = Math.abs(v); });
      return;
    case "    FBA storage fee":
    case "    FBA storage fees":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.storageFee = Math.abs(v); });
      return;
    case "    AWD storage fee":
    case "    Awd storage fees":
    case "    AWD storage fees":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.awdStorageFee = Math.abs(v); });
      return;

    // otherFees — ADD semantics (multiple rows roll into one column)
    case "    FBA disposal fee":
    case "    FBA disposal fees":
    case "    Subscription ":
    case "    Subscription":
    case "    Subscription fee":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.otherFees += Math.abs(v); });
      return;

    // reimbursement — ADD semantics
    case "    Reversal reimbursement":
    case "    Warehouse damage":
    case "    Warehouse lost":
    case "    Free replacement refund items":
      applyToDays(values, dates, dayMap, (pt, v) => { pt.reimbursement += Math.abs(v); });
      return;
  }

  // Unknown row: silently ignore
}

function applyToDays(
  values: number[],
  dates: (Date | null)[],
  dayMap: Map<string, DailyPoint>,
  setter: (pt: DailyPoint, v: number) => void
): void {
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    const pt = ensureDay(dayMap, key, d);
    setter(pt, values[i] ?? 0);
  }
}

function ensureDay(dayMap: Map<string, DailyPoint>, key: string, date: Date): DailyPoint {
  let pt = dayMap.get(key);
  if (!pt) {
    pt = {
      date,
      grossSales: 0, unitsSold: 0, refundCount: 0, refundAmount: 0,
      promoAmount: 0, refundCommission: 0, refundedReferralFee: 0,
      referralFee: 0, fbaFee: 0, storageFee: 0, awdStorageFee: 0,
      otherFees: 0, reimbursement: 0,
      adSpend: 0, attributedSales: 0,
    };
    dayMap.set(key, pt);
  }
  return pt;
}

// ─── CSV file parser ────────────────────────────────────────────────────────

function parseCsvFile(filePath: string): DailyPoint[] {
  const text = fs.readFileSync(filePath, "utf-8").replace(/\r/g, "");
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new Error(`file has too few rows: ${lines.length}`);
  }

  const header = parseCsvLine(lines[0]);
  // header[0] = "Parameter/Date"; header[1..] = date strings or "Total"
  const dates: (Date | null)[] = header.slice(1).map(parseSellerboardDate);

  const dayMap = new Map<string, DailyPoint>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const label = cols[0];
    const values = cols.slice(1).map(parseNum);
    applyRow(label, values, dates, dayMap);
  }

  return Array.from(dayMap.values());
}

// ─── Import ────────────────────────────────────────────────────────────────

function isAllZero(pt: DailyPoint): boolean {
  return (
    pt.grossSales === 0 && pt.unitsSold === 0 && pt.refundCount === 0 &&
    pt.refundAmount === 0 && pt.promoAmount === 0 &&
    pt.refundCommission === 0 && pt.refundedReferralFee === 0 &&
    pt.referralFee === 0 && pt.fbaFee === 0 && pt.storageFee === 0 &&
    pt.awdStorageFee === 0 && pt.otherFees === 0 && pt.reimbursement === 0 &&
    pt.adSpend === 0 && pt.attributedSales === 0
  );
}

async function importPoint(
  productId: string,
  marketplaceId: string,
  pt: DailyPoint,
  totals: Totals
): Promise<void> {
  // daily_sales — overwrite order-owned and settlement-owned since historical import
  await prisma.dailySale.upsert({
    where: {
      productId_marketplaceId_date: { productId, marketplaceId, date: pt.date },
    },
    create: {
      productId,
      marketplaceId,
      date: pt.date,
      grossSales: pt.grossSales,
      unitsSold: pt.unitsSold,
      orderCount: pt.unitsSold,
      refundCount: pt.refundCount,
      refundAmount: pt.refundAmount,
      promoAmount: pt.promoAmount,
      refundCommission: pt.refundCommission,
      refundedReferralFee: pt.refundedReferralFee,
    },
    update: {
      grossSales: pt.grossSales,
      unitsSold: pt.unitsSold,
      orderCount: pt.unitsSold,
      refundCount: pt.refundCount,
      refundAmount: pt.refundAmount,
      promoAmount: pt.promoAmount,
      refundCommission: pt.refundCommission,
      refundedReferralFee: pt.refundedReferralFee,
    },
  });
  totals.salesWritten++;

  // daily_fees
  await prisma.dailyFee.upsert({
    where: {
      productId_marketplaceId_date: { productId, marketplaceId, date: pt.date },
    },
    create: {
      productId,
      marketplaceId,
      date: pt.date,
      referralFee: pt.referralFee,
      fbaFee: pt.fbaFee,
      storageFee: pt.storageFee,
      awdStorageFee: pt.awdStorageFee,
      returnProcessingFee: 0,
      otherFees: pt.otherFees,
      reimbursement: pt.reimbursement,
    },
    update: {
      referralFee: pt.referralFee,
      fbaFee: pt.fbaFee,
      storageFee: pt.storageFee,
      awdStorageFee: pt.awdStorageFee,
      otherFees: pt.otherFees,
      reimbursement: pt.reimbursement,
    },
  });
  totals.feesWritten++;

  // daily_ads — no compound unique constraint, so findFirst + update/create.
  // Historical imports have no campaign granularity, so we collapse any
  // existing rows for this (product, marketplace, date) into a single row.
  if (pt.adSpend !== 0 || pt.attributedSales !== 0) {
    const existing = await prisma.dailyAd.findFirst({
      where: { productId, marketplaceId, date: pt.date },
      select: { id: true },
    });
    if (existing) {
      await prisma.dailyAd.update({
        where: { id: existing.id },
        data: {
          spend: pt.adSpend,
          attributedSales: pt.attributedSales,
        },
      });
    } else {
      await prisma.dailyAd.create({
        data: {
          productId,
          marketplaceId,
          date: pt.date,
          spend: pt.adSpend,
          attributedSales: pt.attributedSales,
          clicks: 0,
          impressions: 0,
          orders: 0,
        },
      });
    }
    totals.adsWritten++;
  }

  // Track date range
  const iso = pt.date.toISOString().slice(0, 10);
  if (!totals.earliestDate || iso < totals.earliestDate) totals.earliestDate = iso;
  if (!totals.latestDate || iso > totals.latestDate) totals.latestDate = iso;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , asin, folderPath] = process.argv;

  if (!asin || !folderPath) {
    console.error("Usage: npx tsx src/scripts/import-sellerboard-history.ts <ASIN> <folder_path>");
    process.exit(1);
  }

  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    console.error(`Folder not found or not a directory: ${folderPath}`);
    process.exit(1);
  }

  console.log(`[import] ASIN=${asin} folder=${folderPath}`);
  console.log(`[import] cutoff: only importing dates < ${CUTOFF_DATE.toISOString().slice(0, 10)}`);

  // Resolve ASIN → productId
  const product = await prisma.product.findFirst({
    where: { asin },
    select: { id: true, userId: true, asin: true, title: true },
  });
  if (!product) {
    console.error(`No product found for ASIN ${asin}`);
    process.exit(1);
  }
  console.log(`[import] productId=${product.id} title=${product.title ?? "(untitled)"}`);

  // Resolve marketplace
  const marketplace = await prisma.marketplace.findFirst({
    where: { userId: product.userId, code: MARKETPLACE_CODE },
    select: { id: true },
  });
  if (!marketplace) {
    console.error(`No marketplace ${MARKETPLACE_CODE} found for user ${product.userId}`);
    process.exit(1);
  }
  console.log(`[import] marketplaceId=${marketplace.id}`);

  // Enumerate CSV files
  const files = fs
    .readdirSync(folderPath)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(folderPath, f))
    .sort();

  if (files.length === 0) {
    console.error(`No .csv files found in ${folderPath}`);
    process.exit(1);
  }
  console.log(`[import] found ${files.length} CSV file(s)`);

  // Parse all files, merge into a single date map (later files override earlier)
  const merged = new Map<string, DailyPoint>();
  const totals: Totals = {
    salesWritten: 0,
    feesWritten: 0,
    adsWritten: 0,
    datesSkippedAllZero: 0,
    datesSkippedCutoff: 0,
    filesFailed: 0,
    earliestDate: null,
    latestDate: null,
  };

  for (const file of files) {
    try {
      console.log(`[import] parsing ${path.basename(file)}`);
      const points = parseCsvFile(file);
      for (const pt of points) {
        const key = pt.date.toISOString().slice(0, 10);
        merged.set(key, pt); // later wins
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[import] FAILED to parse ${file}: ${msg}`);
      totals.filesFailed++;
    }
  }

  // Sort points ascending for deterministic progress logging
  const allPoints = Array.from(merged.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  console.log(`[import] parsed ${allPoints.length} distinct dates across all files`);

  let processed = 0;
  for (const pt of allPoints) {
    // Cutoff: only import strictly before 2026-02-01
    if (pt.date.getTime() >= CUTOFF_DATE.getTime()) {
      totals.datesSkippedCutoff++;
      continue;
    }

    // Skip only if everything is zero
    if (isAllZero(pt)) {
      totals.datesSkippedAllZero++;
      continue;
    }

    await importPoint(product.id, marketplace.id, pt, totals);
    processed++;

    if (processed % 100 === 0) {
      console.log(`[import] progress: ${processed} dates written`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n─── Import Summary ─────────────────────────────────");
  console.log(`ASIN:               ${asin}`);
  console.log(`Files parsed:       ${files.length - totals.filesFailed}/${files.length}`);
  if (totals.filesFailed > 0) {
    console.log(`Files failed:       ${totals.filesFailed}`);
  }
  console.log(`Total dates:        ${allPoints.length}`);
  console.log(`Dates written:      ${processed}`);
  console.log(`Skipped (cutoff):   ${totals.datesSkippedCutoff} (>= 2026-02-01)`);
  console.log(`Skipped (all-zero): ${totals.datesSkippedAllZero}`);
  console.log(`Date range:         ${totals.earliestDate ?? "—"} → ${totals.latestDate ?? "—"}`);
  console.log(`daily_sales rows:   ${totals.salesWritten}`);
  console.log(`daily_fees rows:    ${totals.feesWritten}`);
  console.log(`daily_ads rows:     ${totals.adsWritten}`);
  console.log("────────────────────────────────────────────────────\n");
}

main()
  .catch((err) => {
    console.error("[import] FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
