# PPC-BUILD-SPEC.md — Read This Entire File Before Writing Any Code

> Claude Code: This is a PHASED build spec for the PPC Dashboard page.
> Follow the instructions LITERALLY. Do not skip steps.
> Do not claim something is "already working" — test it yourself.
> ALL changes go in the main repo only. No worktree.
> Build PHASE 1 first, verify it works, then move to PHASE 2, etc.

---

## Context

- Stack: Next.js 15.2.3, Prisma, PostgreSQL, Clerk auth, Tailwind CSS, Recharts, @tanstack/react-table
- Auth userId: `cmmku4pju00003ghoqyc6s408`
- Marketplace: `ATVPDKIKX0DER`
- Existing PPC data tables (check Prisma schema for exact field names):
  - `ppc_performance_daily` — ~2,714 rows of daily campaign/ad group/keyword/search term performance
  - `ppc_managed_entities` — ~6,987 rows of campaign/ad group/keyword entity metadata
- Products: 3 Kitchen Strong SKUs (B0B27GRHFR, B07XYBW774, B0D7NNL4BL)
- Design system: dark mode default, colors from COMMERCE-OS-MASTER-SPEC.md Section 1
- Page route: `/ppc` (should already exist in nav)

## CRITICAL: Before writing ANY code

1. Run `npx prisma db execute --stdin <<< "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ppc_performance_daily' ORDER BY ordinal_position;"` and paste the output. You need the exact column names.
2. Run `npx prisma db execute --stdin <<< "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ppc_managed_entities' ORDER BY ordinal_position;"` and paste the output.
3. Run `npx prisma db execute --stdin <<< "SELECT DISTINCT \"entityType\" FROM ppc_managed_entities LIMIT 20;"` to see what entity types exist.
4. Run `npx prisma db execute --stdin <<< "SELECT COUNT(*), \"entityType\" FROM ppc_managed_entities GROUP BY \"entityType\";"` to see the distribution.
5. Run `npx prisma db execute --stdin <<< "SELECT * FROM ppc_performance_daily LIMIT 3;"` to see a sample row.
6. Run `npx prisma db execute --stdin <<< "SELECT * FROM ppc_managed_entities WHERE \"entityType\" = 'CAMPAIGN' LIMIT 3;"` to see a sample campaign entity.
7. Check the Prisma schema file for the PpcPerformanceDaily and PpcManagedEntity models — note the exact field names and relations.
8. Check if `src/app/(app)/ppc/page.tsx` already exists. If so, read it.
9. Check if `src/app/api/ppc/` already has any route files.

**Paste ALL of these outputs before writing any code. I need to see the data shape.**

---

## PHASE 1: PPC Service + API Route + Basic Page Shell

### Goal
Get a working `/ppc` page that shows real PPC data in a simple table. No tabs, no drill-down, no chart yet — just prove the data pipeline works.

### Step 1A: Create PPC Service

**File: `src/lib/services/ppc-service.ts`**

Create a service that queries PPC data. The exact queries depend on the schema you discovered above, but the service must export these functions:

```typescript
// Types
export interface PPCSummaryMetrics {
  ppcSales: number;
  adSpend: number;
  acos: number | null;         // adSpend / ppcSales * 100
  tacos: number | null;        // adSpend / totalRevenue * 100 (needs daily_sales)
  profit: number;              // ppcSales - adSpend - estimatedFees - estimatedCogs
  impressions: number;
  clicks: number;
  cpc: number | null;          // adSpend / clicks
  ctr: number | null;          // clicks / impressions * 100
  orders: number;
  conversionRate: number | null; // orders / clicks * 100
  roas: number | null;         // ppcSales / adSpend
}

export interface CampaignRow {
  entityId: string;            // from ppc_managed_entities
  campaignName: string;
  campaignType: string;        // SP, SB, SD, SBV
  status: string;              // ENABLED, PAUSED, ARCHIVED
  dailyBudget: number | null;
  adSpend: number;
  ppcSales: number;
  acos: number | null;
  profit: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  ctr: number | null;
  orders: number;
  conversionRate: number | null;
  roas: number | null;
}

export interface PPCChartDataPoint {
  date: string;                // YYYY-MM-DD
  adSpend: number;
  ppcSales: number;
  profit: number;
  acos: number | null;
  impressions: number;
  clicks: number;
  orders: number;
}

// Functions
export async function getPPCSummary(
  userId: string,
  marketplace: string,
  dateFrom: Date,
  dateTo: Date
): Promise<PPCSummaryMetrics>

export async function getCampaignRows(
  userId: string,
  marketplace: string,
  dateFrom: Date,
  dateTo: Date,
  filters?: { status?: string; campaignType?: string; search?: string }
): Promise<CampaignRow[]>

export async function getPPCChartData(
  userId: string,
  marketplace: string,
  dateFrom: Date,
  dateTo: Date,
  granularity: 'daily' | 'weekly' | 'monthly'
): Promise<PPCChartDataPoint[]>
```

**Implementation notes:**
- `getPPCSummary`: SUM all ppc_performance_daily rows for the date range, filtered by userId and marketplace. Join with ppc_managed_entities to get campaign metadata.
- `getCampaignRows`: GROUP BY campaign entity, SUM performance metrics per campaign for the date range. Join with entity table for name, type, status, budget.
- `getPPCChartData`: Query ppc_performance_daily grouped by date (or week/month). Return one data point per time bucket.
- For `profit` calculation: `ppcSales - adSpend` is the simplest version. Don't try to factor in fees/COGS yet — that's a later enhancement.
- For `tacos`: query total revenue from `daily_sales` for the same date range, then `adSpend / totalRevenue * 100`.

**Add console.log for every function:**
```typescript
console.log(`[ppc] getPPCSummary: ${dateFrom.toISOString()} to ${dateTo.toISOString()}, campaigns found: ${campaigns.length}`);
```

### Step 1B: Create PPC API Route

**File: `src/app/api/ppc/route.ts`**

```typescript
// GET /api/ppc?from=2026-02-01&to=2026-02-28&tab=campaigns&status=all&type=all&search=
//
// Response shape:
{
  ok: true,
  data: {
    summary: PPCSummaryMetrics,
    campaigns: CampaignRow[],
    chart: PPCChartDataPoint[],
  }
}
```

- Parse `from`/`to` query params as UTC dates (default: last 30 days)
- Parse `tab` param (default: "campaigns") — for Phase 1 only "campaigns" matters
- Parse `status` filter (default: "all")
- Parse `type` filter (default: "all")
- Parse `search` text filter
- Parse `granularity` (default: "daily")
- Get userId from Clerk auth (same pattern as dashboard tiles route)
- Call the 3 service functions
- Return combined response

**Add console.log showing received params and returned row counts.**

### Step 1C: Create Basic PPC Page

**File: `src/app/(app)/ppc/page.tsx`** (or wherever the app routes live)

For Phase 1, keep it simple:
- Page title "PPC Dashboard"
- Date range controls (reuse DateRangeDropdown from dashboard)
- Summary metrics bar (row of 6-8 metric cards showing: PPC Sales, Ad Spend, ACOS, Profit, CPC, CTR, Orders, ROAS)
- Campaign table using @tanstack/react-table with columns: Name, Type (badge), Status, Ad Spend, ACOS (color coded), Profit (green/red), Impressions, Clicks, CPC, CTR, Orders, ROAS
- Sortable columns, sticky header

**DO NOT build tabs, drill-down, chart, filters, or slide-over yet.** Just get the data flowing.

### Phase 1 Verification

1. `npm run dev`, log in at localhost:3000
2. Navigate to `/ppc`
3. Check terminal for `[ppc]` console.log lines showing real data counts
4. Summary bar should show real numbers (not zero, not NaN)
5. Campaign table should show real campaign names from your database
6. Sorting should work on all columns
7. Date range change should re-fetch with new numbers

**Paste the terminal output showing the console.log lines and a screenshot of the page.**

---

## PHASE 2: PPC Chart + Summary Panel

### Goal
Add the combo chart and right-side summary panel, same layout as Dashboard Chart view.

### Step 2A: Chart Component

**File: `src/components/pages/ppc/ppc-chart.tsx`**

- Recharts ComposedChart, ~450px tall
- Green bars: Ad Spend (left Y-axis, dollars)
- Blue bars: Profit (left Y-axis, can go negative below zero)
- Yellow line + circles: ACOS % (right Y-axis, percentage)
- Time toggle pills: 7d | 14d | 30d (default) | 90d | 6m | 12m
- Config gear icon for toggling additional metrics (Sales, CPC, CTR, Impressions, ROAS)
- Legend, tooltips, axis labels
- Data from `chart` array in API response

### Step 2B: Right Summary Panel

**File: `src/components/pages/ppc/ppc-summary-panel.tsx`**

- ~30% width, scrollable independently
- Stacked metrics:
  - PPC Sales (bold)
  - Orders (expandable)
  - Ad Spend (red, bold)
  - Profit (green/red, bold, large)
  - Average CPC
  - ACOS (bold)
  - TACOS
  - CTR
  - Impressions
  - ROAS

### Step 2C: Wire Into Page

Update the PPC page layout:
```
┌─────────────────────────────────┬──────────────────┐
│ Combo Chart (~70% width)        │ Summary Panel    │
│                                 │ (~30% width)     │
│ [7d] [14d] [30d] [90d] [6m]    │ Stacked metrics  │
├─────────────────────────────────┴──────────────────┤
│ Campaign Table                                      │
└─────────────────────────────────────────────────────┘
```

### Phase 2 Verification

1. Chart renders with real data, bars and lines visible
2. Tooltips show exact values on hover
3. Time pills change the chart data range
4. Summary panel shows real numbers matching the chart's range
5. No crashes, no NaN values

---

## PHASE 3: Campaign Table Tabs + Filters

### Goal
Add the 7 tabs and advanced filter panel.

### Step 3A: Extend API Route

Add tab-specific queries to the API:

```
GET /api/ppc?tab=campaigns    → getCampaignRows() (existing)
GET /api/ppc?tab=adgroups     → getAdGroupRows()
GET /api/ppc?tab=keywords     → getKeywordRows()
GET /api/ppc?tab=searchterms  → getSearchTermRows()
GET /api/ppc?tab=portfolios   → getPortfolioRows()
GET /api/ppc?tab=allperiods   → getAllPeriodsRows()
GET /api/ppc?tab=byasin       → getByAsinRows(asin?)
```

Each returns the same shape: `{ rows: Array<{...}>, totalCount: number }`

### Step 3B: Add Tab-Specific Columns

Each tab has different columns. Key differences:

**Portfolios tab:** Portfolio Name | Campaign Count | Ad Spend | ACOS | Profit | Sales | ROAS. Expandable to show campaigns within each portfolio.

**Ad Groups tab:** Ad Group Name | Campaign Name | Type | Ad Spend | ACOS | Profit | Sales | Impressions | Clicks | CPC | CTR | Orders | Conv Rate | ROAS

**Keywords tab:** Keyword Text | Match Type (badge: Exact/Phrase/Broad) | Portfolio | Campaign | Ad Group | Bid (editable inline) | Ad Spend | ACOS | Profit | Sales | Impressions | Clicks | CPC | CTR | Orders | Conv Rate | ROAS

**Search Terms tab:** Search Term Text | Campaign | Ad Group | Keyword | Ad Spend | ACOS | Sales | Impressions | Clicks | CPC | Orders | Conv Rate. Action buttons: "Add as keyword" | "Add as negative" (these can be non-functional placeholders in Phase 3).

**By ASIN tab:** ASIN selector dropdown at top. When selected, shows summary bar + filtered campaign/keyword/search term tables for that ASIN only.

**All Periods tab:** Same as Campaigns but aggregated across all time (no date filter).

### Step 3C: Advanced Filter Panel

**File: `src/components/pages/ppc/ppc-filters.tsx`**

Triggered by "More Filters" button. Slides down or renders as a collapsible panel.

Fields:
- Search by keyword (text input)
- Campaign status: All | Active | Paused | Archived (dropdown)
- Campaign type: All | SP | SB | SBV | SD (dropdown)
- ACOS range: min/max number inputs
- Spend range: min/max number inputs
- Sales range: min/max number inputs
- Clear All | Apply buttons

Filters are passed as query params to the API. The API applies WHERE clauses based on filters.

### Step 3D: Tab Component

**File: `src/components/pages/ppc/ppc-tabs.tsx`**

Horizontal tabs: **All Periods** | **Portfolios** | **Campaigns** (default) | **Ad Groups** | **Keywords** | **Search Terms** | **By ASIN**

ALL tabs must be clickable. No "(soon)" or "(coming soon)" labels. If a tab's data query returns 0 rows, show an empty state — not a disabled tab.

Right side of tab bar: CSV export button | Copy button | Columns toggle button

### Phase 3 Verification

1. All 7 tabs render and are clickable
2. Campaigns tab shows real campaign data (same as Phase 1)
3. Ad Groups tab shows real ad group data
4. Keywords tab shows real keywords with match type badges
5. Search Terms tab shows real search terms
6. Portfolios tab groups campaigns by portfolio
7. By ASIN tab has a working ASIN dropdown
8. Filters panel opens, applies filters, updates the table
9. CSV export downloads real data

---

## PHASE 4: Drill-Down Hierarchy + Campaign Detail

### Goal
Add expandable rows (Campaign → Ad Groups → Keywords → Search Terms) and the campaign detail slide-over.

### Step 4A: Drill-Down API Endpoints

```
GET /api/ppc/campaign/:id/adgroups     → ad groups for this campaign
GET /api/ppc/adgroup/:id/keywords      → keywords for this ad group
GET /api/ppc/adgroup/:id/searchterms   → search terms for this ad group
GET /api/ppc/campaign/:id/detail       → full campaign detail for slide-over
```

### Step 4B: Expandable Rows

On the Campaigns tab, each row has a ▸ expand icon. Clicking it:
1. Fetches ad groups for that campaign
2. Renders them as indented child rows (left padding ~24px)
3. Each ad group row also has ▸ expand
4. Expanding an ad group shows its keywords (indented ~48px)
5. Each keyword can expand to show its search terms (indented ~72px)

Indentation visual cues: indented row has a subtle left border or background shade.

### Step 4C: Campaign Detail Slide-Over

**File: `src/components/pages/ppc/campaign-detail-panel.tsx`**

Triggered by "More" link on a campaign row. ~500px wide slide-over from the right.

Contents:
- Campaign name (large), type badge, status badge, creation date
- Budget: daily budget value
- Total spend, total sales, total profit for selected period
- Mini daily chart (recharts line chart, ~200px tall) showing daily ad spend + ACOS for this campaign
- List of ad groups (name, spend, ACOS, profit — sorted by spend desc)
- Top 10 keywords by spend (keyword text, match type, spend, ACOS, orders)
- Top 10 search terms by spend (search term, spend, ACOS, orders)
- Close button (×)

### Phase 4 Verification

1. Click ▸ on a campaign row — ad groups appear indented below
2. Click ▸ on an ad group — keywords appear further indented
3. Click ▸ on a keyword — search terms appear
4. Multiple campaigns can be expanded simultaneously
5. Click "More" on a campaign — slide-over opens with real data
6. Slide-over mini chart shows real daily data
7. Close slide-over, open another one — works correctly

---

## CRITICAL RULES FOR ALL PHASES

1. **Test at localhost:3000 LOGGED IN.** Not in preview mode.
2. **Add console.log to every API route and service function** showing params and result counts.
3. **Do NOT use the worktree.** Edit files in the main repo at `src/`.
4. **Do NOT modify existing sync jobs** or Amazon data Prisma models.
5. **Do NOT claim "already working"** without showing terminal logs as evidence.
6. **Components under 200 lines** — extract hooks and sub-components.
7. **TypeScript strict — no `any` types.**
8. **Dark mode is default** — use the design system colors from COMMERCE-OS-MASTER-SPEC.md.
9. **Every table**: sortable columns, sticky header, column visibility toggle, CSV export.
10. **Every chart**: title, axis labels, tooltips, legend, config gear.
11. **Skeleton loaders** while data fetches. Error state with retry button on failures.

---

## Build Order

1. **Phase 1 first** — get data flowing, prove the pipeline works
2. **Phase 2** — add chart and summary panel
3. **Phase 3** — add tabs and filters (this is the biggest phase)
4. **Phase 4** — add drill-down and detail panel

Do NOT skip ahead. Each phase must be verified working before starting the next.
Complete Phase 1, show me the terminal logs and a screenshot, then I'll give the go-ahead for Phase 2.
