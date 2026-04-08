# BUGFIX-SPEC.md — Read This Entire File Before Writing Any Code

> Claude Code: This document contains EXACT specifications for 2 bugs.
> Follow the instructions LITERALLY. Do not skip steps.
> Do not claim something is "already working" — test it yourself.
> ALL changes go in the main repo only. No worktree.

---

## Bug 1: P&L Daily/Weekly/Monthly Granularity Toggle

### What's broken
The P&L view has 3 toggle buttons: Daily | Weekly | Monthly.
Clicking them changes the visual highlight but the grid ALWAYS shows monthly columns (MAR 2026, FEB 2026, JAN 2026...).
When "Daily" is selected, columns should show individual days.
When "Weekly" is selected, columns should show week ranges.

### Root cause
The API route `/api/dashboard/pl-data` always returns data grouped by month.
The frontend displays whatever the API returns.
Neither the API nor the frontend has any logic to group by day or week.

### What to do — BACKEND

**File: `src/app/api/dashboard/pl-data/route.ts`** (or wherever the P&L API handler is)

Accept a `granularity` query parameter: `daily` | `weekly` | `monthly` (default: `monthly`).

**When granularity = "monthly"** (current behavior, keep it):
- Group by month. Column headers: "MAR 2026", "FEB 2026", etc.
- Each bucket = one calendar month.

**When granularity = "daily":**
- Query `daily_sales`, `daily_fees`, `daily_ads` individually per day.
- Return one entry per day within the selected time range.
- Column headers: "Mar 25", "Mar 24", "Mar 23", etc.
- Each bucket contains: sales, units, refunds, adSpend, fees (referral + FBA + storage + other), cogs, grossProfit, indirectExpenses (prorate monthly expenses to daily: amount/daysInMonth), netProfit.
- Limit to last 30 days by default (or the selected time range).

**When granularity = "weekly":**
- Group daily data into ISO weeks (Monday–Sunday).
- Return one entry per week.
- Column headers: "Mar 17-23", "Mar 10-16", etc.
- Each bucket = SUM of daily values within that week.
- Limit to last 12 weeks by default.

**Response shape must be the same for all granularities:**
```typescript
{
  ok: true,
  data: {
    granularity: "daily" | "weekly" | "monthly",
    columns: [
      {
        key: "2026-03-25",        // or "2026-W12" or "2026-03"
        label: "Mar 25",          // or "Mar 17-23" or "MAR 2026"
        metrics: {
          sales: number,
          units: number,
          refundCount: number,
          promo: number,
          advertisingCost: number,
          refundCost: number,
          amazonFees: number,
          costOfGoods: number,
          grossProfit: number,
          indirectExpenses: number,
          netProfit: number,
          estimatedPayout: number,
          realAcos: number | null,
          tacos: number | null,
          refundPct: number | null,
          margin: number | null,
          roi: number | null,
        }
      }
    ]
  }
}
```

### What to do — FRONTEND

**File: `src/components/pages/dashboard/pl-view.tsx`**

- The granularity toggle buttons (Daily | Weekly | Monthly) must update a state variable.
- When the state changes, re-fetch the API with `?granularity=daily` (or weekly/monthly).
- Render the `columns` array from the response as table columns.
- Use `column.label` as the column header text.
- Use `column.metrics.*` for cell values.
- The expandable rows (▸ Sales, ▸ Units, etc.) should still work — map sub-metrics from the same `column.metrics` object.

### How to verify
1. Start `npm run dev`, log in at localhost:3000
2. Go to P&L view
3. Click "Daily" — columns should change to individual days (Mar 25, Mar 24, Mar 23...)
4. Click "Weekly" — columns should change to week ranges (Mar 17-23, Mar 10-16...)
5. Click "Monthly" — columns should show months (MAR 2026, FEB 2026...)
6. Values in each column should be real data from the database, not zeros

---

## Bug 2: Tiles View Date Dropdown Does Nothing

### What's broken
The global date preset dropdown (top-right of page, currently shows "Last 30 days") changes its label text when clicked but does NOT change the 5 period summary cards.
The 5 cards always show: Today | Yesterday | MTD | This Month Forecast | Last Month.
Changing the dropdown to "Yesterday" or "Last 7 days" has no visible effect on the cards.

### Root cause
The tiles API `/api/dashboard/tiles` always returns 5 hardcoded periods.
The dropdown writes to the Zustand store but the API ignores those params.
Even if the API read the params, it wouldn't know what 5 periods to show for "Last 7 days".

### What to do

**This is a design decision, not just a code fix.** The 5 period cards are specifically designed to show Today/Yesterday/MTD/Forecast/Last Month as a default combo. The date dropdown should switch between PRESET COMBOS of periods, not arbitrary date ranges.

**File: `src/app/api/dashboard/tiles/route.ts`** (and the service it calls)

Accept a `combo` query parameter with these values:

| combo value | Card 1 | Card 2 | Card 3 | Card 4 | Card 5 |
|------------|--------|--------|--------|--------|--------|
| `default` | Today | Yesterday | MTD | This Month Forecast | Last Month |
| `days` | Today | Yesterday | Last 7 Days | Last 14 Days | Last 30 Days |
| `weeks` | This Week | Last Week | 2 Weeks Ago | 3 Weeks Ago | — |
| `months` | MTD | Last Month | 2 Months Ago | 3 Months Ago | — |
| `quarters` | This Quarter | Last Quarter | 2 Quarters Ago | — | — |

Each combo defines what date ranges to query. The API should calculate the from/to dates for each card based on the combo and today's date.

**File: `src/components/pages/dashboard/tiles-view.tsx`**

- Replace the global date dropdown with a "Period Combo" selector.
- Options: "Standard" (default), "Daily Compare", "Weekly Compare", "Monthly Compare", "Quarterly Compare".
- When selection changes, re-fetch `/api/dashboard/tiles?combo=days` (or weeks, months, etc.).
- The 5 cards render whatever periods the API returns.

**File: The tiles service (`src/lib/services/dashboard-tiles-service.ts`)**

- Accept the `combo` parameter.
- For each combo, define the period date ranges:
  - `default`: today, yesterday, monthStart→today, monthStart→monthEnd (forecast), lastMonthStart→lastMonthEnd
  - `days`: today, yesterday, today-7→today, today-14→today, today-30→today
  - `weeks`: thisWeekMon→today, lastWeekMon→lastWeekSun, 2weeksAgoMon→2weeksAgoSun, 3weeksAgoMon→3weeksAgoSun
  - `months`: monthStart→today, lastMonthStart→lastMonthEnd, 2moStart→2moEnd, 3moStart→3moEnd
  - `quarters`: thisQStart→today, lastQStart→lastQEnd, 2QStart→2QEnd
- Query each period using the existing `queryPeriodMetrics` function (it already accepts from/to dates).
- Return the same response shape, just with different period labels and date ranges.

### How to verify
1. Start `npm run dev`, log in at localhost:3000
2. Go to Tiles view
3. The dropdown should show "Standard" by default with Today/Yesterday/MTD/Forecast/Last Month
4. Switch to "Daily Compare" — cards should change to Today/Yesterday/Last 7 Days/Last 14 Days/Last 30 Days with real data
5. Switch to "Monthly Compare" — cards should show MTD/Last Month/2 Months Ago/3 Months Ago
6. All cards should show real numbers (not zeros, not the same numbers as before)

---

## CRITICAL RULES

1. **Test at localhost:3000 logged in.** Not in preview mode. Preview has no auth.
2. **Add console.log to API routes** showing the received params and returned data count.
3. **Do not use the worktree.** Edit files in the main repo at `src/`.
4. **Do not claim "already working"** without showing evidence (paste the API response or terminal logs).
5. **Do not modify existing sync jobs** or Amazon data Prisma models.
