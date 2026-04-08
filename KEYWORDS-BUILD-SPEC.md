# KEYWORDS-BUILD-SPEC.md — Read This Entire File Before Writing Any Code

> Claude Code: This is a PHASED build spec for the Keywords page.
> Follow the instructions LITERALLY. Do not skip steps.
> ALL changes go in the main repo only. No worktree.
> Build PHASE 1 first, verify it works, then move to PHASE 2, etc.

---

## ⛔ PROTECTED FILES — DO NOT MODIFY

These files have validated bug fixes. DO NOT change them:

1. **`src/lib/jobs/sync-orders-job.ts`** — Two-phase collect-then-transform. DO NOT move transform/normalize inside the pagination loop.
2. **`src/lib/amazon/order-payload-transformer.ts`** — Uses `America/Los_Angeles` timezone. DO NOT change to UTC or `America/New_York`.
3. **`src/lib/jobs/sync-ads-products-job.ts`** — DO NOT modify. It syncs `daily_ads` and is working correctly.

---

## Context

- Stack: Next.js 15.2.3, Prisma, PostgreSQL, Clerk auth, Tailwind CSS, Recharts, @tanstack/react-table
- Auth userId: `cmmku4pju00003ghoqyc6s408`
- Marketplace: `ATVPDKIKX0DER`, internal ID: `cmmksggip0002r6odesy03jsc`
- Products: 3 Kitchen Strong SKUs (B0B27GRHFR, B07XYBW774, B0D7NNL4BL)
- Page route: `/keywords` (already exists in nav)
- Amazon Ads API V3 Reporting: existing client at `src/lib/amazon/ads-api-client.ts`

## What We Need

The Keywords page requires **keyword-level** and **search-term-level** PPC data that does NOT exist in `daily_ads`. We need:

1. Two new Amazon Ads API report types:
   - `spTargeting` — keyword/target performance (keyword text, match type, per-keyword spend/sales)
   - `spSearchTerm` — search term report (what customers actually typed)

2. Two new Prisma models to store this data

3. A new sync job to pull and normalize keyword/search term reports

4. The Keywords page UI

---

## PHASE 1: Schema + New Report Methods

### Goal
Add Prisma models and extend the Ads API client to request keyword and search term reports.

### Step 1A: Add Prisma Models

**File: `prisma/schema.prisma`** — Add these two models:

```prisma
model DailyKeyword {
  id              String   @id @default(cuid())
  productId       String
  marketplaceId   String
  date            DateTime @db.Date
  campaignName    String?
  campaignId      String?
  adGroupName     String?
  adGroupId       String?
  keywordId       String?
  keywordText     String?
  matchType       String?  // EXACT, PHRASE, BROAD, TARGETING_EXPRESSION, TARGETING_EXPRESSION_PREDEFINED
  keywordType     String?  // KEYWORD or PRODUCT_TARGETING
  bid             Decimal? @db.Decimal(10, 4)
  spend           Decimal  @default(0) @db.Decimal(14, 4)
  attributedSales Decimal  @default(0) @db.Decimal(14, 4)
  clicks          Int      @default(0)
  impressions     Int      @default(0)
  orders          Int      @default(0)
  acos            Decimal? @db.Decimal(8, 4)
  roas            Decimal? @db.Decimal(8, 4)
  cpc             Decimal? @db.Decimal(10, 4)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  product     Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  marketplace Marketplace @relation(fields: [marketplaceId], references: [id], onDelete: Cascade)

  @@map("daily_keywords")
}

model DailySearchTerm {
  id              String   @id @default(cuid())
  productId       String
  marketplaceId   String
  date            DateTime @db.Date
  campaignName    String?
  campaignId      String?
  adGroupName     String?
  adGroupId       String?
  keywordId       String?
  keywordText     String?
  matchType       String?
  searchTerm      String?
  spend           Decimal  @default(0) @db.Decimal(14, 4)
  attributedSales Decimal  @default(0) @db.Decimal(14, 4)
  clicks          Int      @default(0)
  impressions     Int      @default(0)
  orders          Int      @default(0)
  acos            Decimal? @db.Decimal(8, 4)
  roas            Decimal? @db.Decimal(8, 4)
  cpc             Decimal? @db.Decimal(10, 4)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  product     Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  marketplace Marketplace @relation(fields: [marketplaceId], references: [id], onDelete: Cascade)

  @@map("daily_search_terms")
}
```

**IMPORTANT:** You must also add the reverse relations to the `Product` and `Marketplace` models. Add these fields:
- To `Product`: `dailyKeywords DailyKeyword[]` and `dailySearchTerms DailySearchTerm[]`
- To `Marketplace`: `dailyKeywords DailyKeyword[]` and `dailySearchTerms DailySearchTerm[]`

Then run:
```bash
npx prisma migrate dev --name add-keyword-search-term-models
```

### Step 1B: Add Report Request Methods to Ads API Client

**File: `src/lib/amazon/ads-api-client.ts`** — Add two new methods (do NOT modify existing methods):

```typescript
/**
 * Request a Sponsored Products targeting (keyword) report.
 * Report type: spTargeting
 */
async requestSPTargetingReport(params: {
  startDate: string;
  endDate: string;
}): Promise<string> {
  const body = {
    name: `SP Targeting Report ${params.startDate} to ${params.endDate}`,
    startDate: params.startDate,
    endDate: params.endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["targeting"],
      columns: [
        "date",
        "campaignName",
        "campaignId",
        "adGroupName",
        "adGroupId",
        "targetingId",
        "targetingExpression",
        "targetingText",
        "targetingType",
        "matchType",
        "impressions",
        "clicks",
        "cost",
        "purchases7d",
        "sales7d",
      ],
      reportTypeId: "spTargeting",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  };

  const res = await this.request<AdsReportResponse>("POST", "/reporting/reports", body);
  return res.reportId;
}

/**
 * Request a Sponsored Products search term report.
 * Report type: spSearchTerm
 */
async requestSPSearchTermReport(params: {
  startDate: string;
  endDate: string;
}): Promise<string> {
  const body = {
    name: `SP Search Term Report ${params.startDate} to ${params.endDate}`,
    startDate: params.startDate,
    endDate: params.endDate,
    configuration: {
      adProduct: "SPONSORED_PRODUCTS",
      groupBy: ["searchTerm"],
      columns: [
        "date",
        "campaignName",
        "campaignId",
        "adGroupName",
        "adGroupId",
        "searchTerm",
        "targeting",
        "impressions",
        "clicks",
        "cost",
        "purchases7d",
        "sales7d",
      ],
      reportTypeId: "spSearchTerm",
      timeUnit: "DAILY",
      format: "GZIP_JSON",
    },
  };

  const res = await this.request<AdsReportResponse>("POST", "/reporting/reports", body);
  return res.reportId;
}
```

### Step 1C: Extend AdsReportRow Type

**File: `src/lib/amazon/ads-api-client.ts`** — Add these optional fields to the existing `AdsReportRow` type:

```typescript
// Add to existing AdsReportRow type:
targetingId?: string;
targetingExpression?: string;
targetingText?: string;
targetingType?: string;
matchType?: string;
searchTerm?: string;
targeting?: string;  // keyword text in search term reports
```

### Phase 1 Verification

1. Run `npx prisma migrate dev --name add-keyword-search-term-models` — migration succeeds
2. Run `npx prisma generate` — client generates without errors
3. Run `npm run build` — no TypeScript errors
4. Check database: `daily_keywords` and `daily_search_terms` tables exist with correct columns
5. The two new methods exist on AdsApiClient but are NOT called yet

---

## PHASE 2: Keyword Sync Job

### Goal
Create a sync job that pulls SP targeting and search term reports from the Ads API and writes to the new tables.

### Step 2A: Create Keyword Report Parser

**File: `src/lib/amazon/keyword-report-parser.ts`**

Parses raw report rows into typed keyword rows. Similar to `ads-report-parser.ts` but outputs keyword-specific fields.

```typescript
export type ParsedKeywordRow = {
  date: Date;
  campaignName: string | null;
  campaignId: string | null;
  adGroupName: string | null;
  adGroupId: string | null;
  keywordId: string | null;
  keywordText: string | null;
  matchType: string | null;
  keywordType: string | null;  // "KEYWORD" or "PRODUCT_TARGETING"
  advertisedAsin: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  attributedSales: number;
  attributedOrders: number;
};

export type ParsedSearchTermRow = {
  date: Date;
  campaignName: string | null;
  campaignId: string | null;
  adGroupName: string | null;
  adGroupId: string | null;
  keywordId: string | null;
  keywordText: string | null;   // the keyword/target that matched
  matchType: string | null;
  searchTerm: string | null;    // what the customer typed
  advertisedAsin: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  attributedSales: number;
  attributedOrders: number;
};
```

**Implementation notes:**
- Reuse the same `safeNum`, `safeStr`, `parseReportDate` helpers from `ads-report-parser.ts` (extract to shared util or copy)
- For targeting reports: `keywordText` comes from `targetingText` or `targetingExpression`, `keywordId` from `targetingId`, `keywordType` from `targetingType`
- For search term reports: `keywordText` comes from `targeting`, `searchTerm` from `searchTerm`
- Skip rows with no parseable date
- Use 7d attribution window for sales/orders (same as product reports)

### Step 2B: Create Keyword Normalization Service

**File: `src/lib/sync/keyword-normalization-service.ts`**

Similar pattern to `ads-normalization-service.ts`: resolve ASIN → productId, delete existing rows for date range, insert fresh.

```typescript
export async function normalizeKeywordRows(
  rows: ParsedKeywordRow[],
  maps: LookupMaps,
  dateRange: { from: Date; to: Date }
): Promise<{ deleted: number; written: number; skippedUnknownAsin: number }>
```

- Delete all `dailyKeyword` rows for the date range + known products
- Insert resolved rows with computed ACOS/ROAS/CPC
- Same pattern for search terms:

```typescript
export async function normalizeSearchTermRows(
  rows: ParsedSearchTermRow[],
  maps: LookupMaps,
  dateRange: { from: Date; to: Date }
): Promise<{ deleted: number; written: number; skippedUnknownAsin: number }>
```

**IMPORTANT:** Search term reports do NOT include `advertisedAsin`. The search term rows are at the campaign+adGroup+searchTerm level. You'll need to handle this — either:
- Join through campaign→product mapping from `daily_ads`
- Or store search terms without a productId and query differently

Check what columns the search term report actually returns. If it has no ASIN, you may need a different normalization approach. Log the first row of each report type during development to see the exact fields.

### Step 2C: Create Sync Job

**File: `src/lib/jobs/sync-ads-keywords-job.ts`**

Follow the EXACT same pattern as `sync-ads-products-job.ts`:
- Cursor-based: reads from `SyncCursor(adsConnectionId, "sync-ads-keywords")`
- Chunks date range into 31-day windows
- Requests TWO reports per chunk: targeting + search term
- Polls, downloads, parses, normalizes each
- Updates cursor after each chunk

```typescript
const JOB_NAME = "sync-ads-keywords";

export async function syncAdsKeywordsJob(ctx: JobContext): Promise<JobResult> {
  // Same cursor/chunk logic as sync-ads-products-job
  // For each chunk:
  //   1. Request spTargeting report → parse → normalize into daily_keywords
  //   2. Request spSearchTerm report → parse → normalize into daily_search_terms
  // Update cursor
}
```

### Step 2D: Create Runner

**File: `src/lib/jobs/runners/run-sync-ads-keywords.ts`**

Same pattern as `run-sync-ads-products.ts`:
```typescript
import { resolveUserId, resolveJobContext } from "@/lib/jobs/job-connection-resolver";
import { syncAdsKeywordsJob } from "@/lib/jobs/sync-ads-keywords-job";
import { runRecompute } from "@/lib/services/recompute-orchestration-service";

async function main() {
  console.log("[run-sync-ads-keywords] starting");
  const userId = await resolveUserId();
  const ctx = await resolveJobContext(userId);
  const result = await syncAdsKeywordsJob(ctx);
  console.log("[run-sync-ads-keywords] done:", result);
  await runRecompute({ userId });
}

main().catch((err) => {
  console.error("[run-sync-ads-keywords] fatal:", err);
  process.exit(1);
});
```

### Step 2E: Add to Worker

**File: `src/lib/jobs/worker-entry.ts`** — Add the new job to the job loop:

```typescript
import { syncAdsKeywordsJob } from "@/lib/jobs/sync-ads-keywords-job";

// Add to the jobs array:
{ name: "sync-ads-keywords", fn: () => syncAdsKeywordsJob(ctx) },
```

Add it AFTER `sync-ads-products` in the array.

### Step 2F: Add package.json Script

Add to `package.json` scripts:
```json
"job:sync-ads-keywords": "tsx src/lib/jobs/runners/run-sync-ads-keywords.ts"
```

### Phase 2 Verification

1. Run `npm run build` — no errors
2. Set cursor for `sync-ads-keywords` to start from Feb 1, 2026:
   ```
   INSERT INTO "sync_cursors" ("id", "connectionId", "jobName", "cursor", "updatedAt")
   VALUES (gen_random_uuid(), '<adsConnectionId>', 'sync-ads-keywords', '2026-02-01T00:00:00Z', NOW())
   ON CONFLICT DO NOTHING;
   ```
   (Get the adsConnectionId from existing sync_cursors table)
3. Run `npm run job:sync-ads-keywords` — watch logs for:
   - Report request IDs
   - Polling status
   - Row counts per chunk
   - `[sync-ads-keywords] chunk 1 fetched X rows`
4. Check database:
   ```sql
   SELECT COUNT(*) FROM daily_keywords;
   SELECT COUNT(*) FROM daily_search_terms;
   SELECT DISTINCT date FROM daily_keywords ORDER BY date LIMIT 5;
   ```
5. February should have keyword + search term data

**CRITICAL:** Log the FIRST RAW ROW of each report type before parsing:
```typescript
console.log(`[sync-ads-keywords] targeting first row: ${JSON.stringify(rawRows[0])}`);
console.log(`[sync-ads-keywords] search term first row: ${JSON.stringify(rawRows[0])}`);
```
This validates the actual field names Amazon returns. The column names in the spec are based on documentation — they may differ in practice.

---

## PHASE 3: Validate Keyword Data

### Goal
Confirm keyword data matches Sellerboard's PPC → Keywords view for February 2026.

### Step 3A: Run Validation Queries

```sql
-- Total keyword spend for Feb 2026 (should match daily_ads total = $3,477.31)
SELECT SUM(spend) as total_spend, COUNT(*) as row_count
FROM daily_keywords
WHERE date >= '2026-02-01' AND date < '2026-03-01';

-- Top 10 keywords by spend
SELECT "keywordText", "matchType", SUM(spend) as spend, SUM("attributedSales") as sales,
       SUM(clicks) as clicks, SUM(impressions) as impressions
FROM daily_keywords
WHERE date >= '2026-02-01' AND date < '2026-03-01'
GROUP BY "keywordText", "matchType"
ORDER BY spend DESC
LIMIT 10;

-- Total search term rows
SELECT COUNT(*), COUNT(DISTINCT "searchTerm")
FROM daily_search_terms
WHERE date >= '2026-02-01' AND date < '2026-03-01';
```

### Step 3B: Cross-Reference with Sellerboard

The user will compare:
- Top keywords by spend against Sellerboard PPC → Keywords view
- Total keyword spend should approximately match campaign-level spend ($3,477.31)
  - Note: keyword-level totals may differ slightly from campaign-level due to different attribution

### Phase 3 Verification

1. `daily_keywords` has data for Feb 2026
2. Total spend is in the right ballpark (~$3,400-3,500)
3. Top keywords are recognizable (bowl cover, plastic bowl covers, etc.)
4. `daily_search_terms` has data
5. No obvious data quality issues

---

## PHASE 4: Keywords Page UI

### Goal
Build the `/keywords` page with keyword performance table, search term table, and filters.

### Layout
```
┌─────────────────────────────────────────────────────┐
│ Keywords                           [Filters] [Date] │
├─────────────────────────────────────────────────────┤
│ [Keywords] [Search Terms] [Negative Keywords]       │
├─────────────────────────────────────────────────────┤
│ Summary Cards: Spend | Sales | ACOS | Clicks | ...  │
├─────────────────────────────────────────────────────┤
│ Table (sortable, filterable, exportable)             │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐  │
│ │ KW   │Match │Spend │Sales │ACOS  │Click │Impr  │  │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤  │
│ │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │ ...  │  │
│ └──────┴──────┴──────┴──────┴──────┴──────┴──────┘  │
└─────────────────────────────────────────────────────┘
```

### Tabs

1. **Keywords** (default) — grouped by keywordText + matchType
   - Columns: Keyword, Match Type, Campaign, Ad Group, Spend, Sales, ACOS, Clicks, Impressions, CPC, CTR, Orders, ROAS
   - Expandable: click row to see per-campaign breakdown for that keyword

2. **Search Terms** — grouped by searchTerm
   - Columns: Search Term, Keyword (matched), Match Type, Campaign, Spend, Sales, ACOS, Clicks, Impressions, Orders
   - Highlight: organic vs paid search terms (if available)

3. **Negative Keywords** — placeholder tab (data not available yet from API)
   - Show empty state: "Negative keyword management coming soon"

### API Routes

```
GET /api/keywords?tab=keywords&from=&to=&search=&matchType=&minSpend=&maxAcos=
GET /api/keywords?tab=searchterms&from=&to=&search=&minSpend=
GET /api/keywords/[keyword]?from=&to=  → keyword detail (per-campaign breakdown)
```

### Service Functions

**File: `src/lib/services/keyword-service.ts`**

```typescript
export async function getKeywordSummary(userId, marketplaceId, dateFrom, dateTo): Promise<KeywordSummaryMetrics>
export async function getKeywordRows(userId, marketplaceId, dateFrom, dateTo, filters): Promise<KeywordRow[]>
export async function getSearchTermRows(userId, marketplaceId, dateFrom, dateTo, filters): Promise<SearchTermRow[]>
export async function getKeywordDetail(userId, marketplaceId, keywordText, matchType, dateFrom, dateTo): Promise<KeywordDetail>
```

All queries use Prisma `dailyKeyword` and `dailySearchTerm` models. NO raw SQL.

### UI Components

- `src/components/pages/keywords/keywords-page.tsx` — main page with tabs
- `src/components/pages/keywords/keyword-table.tsx` — TanStack Table for keywords
- `src/components/pages/keywords/search-term-table.tsx` — TanStack Table for search terms
- `src/components/pages/keywords/keyword-filters.tsx` — filter panel
- `src/components/pages/keywords/keyword-detail-panel.tsx` — slide-over for keyword drill-down

### Phase 4 Verification

1. Navigate to `/keywords` logged in
2. Keywords tab shows real keywords with spend data
3. Search Terms tab shows real search terms
4. Date picker works, filters work
5. CSV export downloads real data
6. Keyword detail slide-over opens on click
7. All numbers formatted correctly, no NaN

---

## CRITICAL RULES FOR ALL PHASES

1. **Use Prisma models.** NO `$queryRawUnsafe`.
2. **DO NOT modify protected files** (see top of spec).
3. **DO NOT modify existing sync jobs** (`sync-ads-products`, `sync-orders`, etc.).
4. **Add console.log to every sync step** for debugging.
5. **Log the first raw row** of each new report type to validate field names.
6. **Test at localhost:3000 LOGGED IN.**
7. **TypeScript strict — no `any` types.**
8. **Dark mode is default.**
9. **Build PHASE 1 first**, verify migration works, then Phase 2, etc.
10. **Do NOT skip ahead.** Each phase must be verified working before starting the next.

---

## Build Order

1. **Phase 1** — Schema migration + API client methods
2. **Phase 2** — Sync job (targeting + search term reports)
3. **Phase 3** — Validate data against Sellerboard
4. **Phase 4** — Keywords page UI

Complete each phase, show terminal logs, then proceed.
