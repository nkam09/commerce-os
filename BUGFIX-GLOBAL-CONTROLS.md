# BUGFIX-GLOBAL-CONTROLS.md — Read This Entire File Before Writing Any Code

> Claude Code: This document contains EXACT specifications for 2 issues.
> Follow the instructions LITERALLY. Do not skip steps.
> ALL changes go in the main repo only. No worktree.
> Test at localhost:3000 LOGGED IN. Not preview mode.

---

## Issue 1: Global Controls Bar Not Working

### What's broken
The global controls bar appears at the top of every page with:
- Search bar
- Date preset dropdown (Today, Yesterday, Last 7 days, etc.)
- Marketplace filter
- Filters button
- Refresh/sync button

NONE of these controls do anything. The date dropdown changes its label text but does NOT update the view data. The other controls are completely non-functional.

### What to fix (date dropdown only — skip search, marketplace, filters, refresh for now)

The date dropdown already exists and shows presets. When a preset is selected, it must trigger a data re-fetch on the CURRENT active view.

**Architecture:**

The dashboard Zustand store (`src/lib/stores/dashboard-store.ts`) should have:
```typescript
interface DashboardStore {
  // Global date state
  datePreset: string;          // "today" | "yesterday" | "last7" | "last14" | "last30" | "mtd" | "lastMonth" | "custom"
  customDateFrom: Date | null; // only used when datePreset = "custom"
  customDateTo: Date | null;   // only used when datePreset = "custom"
  
  // Computed from preset or custom
  dateFrom: Date;              // actual start date
  dateTo: Date;                // actual end date
  
  // Actions
  setDatePreset: (preset: string) => void;
  setCustomDateRange: (from: Date, to: Date) => void;
}
```

When `setDatePreset` is called:
- Calculate `dateFrom` and `dateTo` based on the preset and today's date
- Example: "last7" → dateFrom = today - 7 days, dateTo = today
- Example: "mtd" → dateFrom = 1st of current month, dateTo = today
- Example: "lastMonth" → dateFrom = 1st of last month, dateTo = last day of last month

**Each view must subscribe to the store and re-fetch when dates change:**

- **Tiles view**: When global date changes, fetch `/api/dashboard/tiles?from=YYYY-MM-DD&to=YYYY-MM-DD` and show a SINGLE period card for that range (in addition to the combo selector cards). OR: the global date dropdown simply switches between the tile combos (Standard, Daily Compare, etc.). Pick whichever is simpler — but the dropdown MUST do something visible.

- **Chart view**: Re-fetch `/api/dashboard/chart-data?from=YYYY-MM-DD&to=YYYY-MM-DD`. The chart already has its own time pills (7d/14d/30d) — the global dropdown should set the same state. If the user picks "Last 7 days" from the global dropdown, it should be identical to clicking the "7d" pill.

- **P&L view**: Re-fetch `/api/dashboard/pl-data?granularity=X&from=YYYY-MM-DD&to=YYYY-MM-DD`. Columns should cover only the selected date range.

- **Trends view**: Re-fetch `/api/dashboard/trends?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.

### How to verify
1. Go to Tiles view. Select "Last 7 days" from global dropdown. Something must visibly change.
2. Go to Chart view. Select "Last 30 days" from global dropdown. Chart must show 30 days of data.
3. Go to P&L view. Select "Last 7 days" + "Daily" granularity. Must show 7 day columns.
4. Go to Trends view. Select "Last 30 days". Must show data for that range.

---

## Issue 2: Add Custom Date Range Picker

### What's needed
In addition to the preset options (Today, Yesterday, Last 7 days, etc.), add a "Custom range" option that opens a calendar where the user can pick a start date and end date.

### What to build

**Step 1: Install react-day-picker**
```bash
npm install react-day-picker
```
This is a lightweight date picker (~8kb). Do NOT install MUI, Ant Design, or any heavy library.

**Step 2: Add "Custom range" option to the dropdown**

In the global date dropdown component, add a divider and "Custom range..." option at the bottom of the preset list.

**Step 3: Calendar popup**

When "Custom range..." is clicked, show a popup/modal with:
- TWO side-by-side month calendars (current month and previous month)
- Click a day to set start date
- Click another day to set end date
- Selected range highlighted with blue background
- Text showing selected range: "Mar 10 – Mar 22, 2026"
- "Cancel" button (closes without applying)
- "Apply" button (sets the custom range and closes)

**Step 4: Apply the range**

When "Apply" is clicked:
- Call `setCustomDateRange(from, to)` on the dashboard store
- Set `datePreset` to "custom"
- The dropdown label changes to show "Mar 10 – Mar 22" (short format)
- The current view re-fetches data for that exact date range

**Step 5: Style**

- Dark mode compatible (dark background calendar, light text)
- Match the existing design system: bg-[#1a1d27], text-[#f1f3f5], accent blue #3b82f6
- Calendar popup positioned below the dropdown, z-index above everything
- Click outside to dismiss (without applying)

### Component structure

Create a new component:
```
src/components/ui/date-range-picker.tsx
```

Props:
```typescript
interface DateRangePickerProps {
  from: Date | null;
  to: Date | null;
  onApply: (from: Date, to: Date) => void;
  onCancel: () => void;
}
```

Integrate it into the global controls bar component. When datePreset is "custom" and customDateFrom/customDateTo exist, pass them to the picker as initial values.

### How to verify
1. Click the global date dropdown
2. Click "Custom range..." at the bottom
3. A calendar popup appears with 2 months
4. Click March 10, then click March 22
5. Range is highlighted in blue
6. Click "Apply"
7. Dropdown now shows "Mar 10 – Mar 22"
8. The current view (Tiles/Chart/P&L/Trends) re-fetches data for Mar 10-22
9. P&L with "Daily" granularity should show columns: Mar 22, Mar 21, Mar 20... Mar 10

---

## API Routes — Ensure All Accept Date Params

Check each of these API routes and make sure they accept `from` and `to` query parameters (YYYY-MM-DD format) and use them to filter data:

1. `/api/dashboard/tiles` — already accepts `combo`, also needs `from`/`to` for custom range
2. `/api/dashboard/chart-data` — must accept `from`/`to` 
3. `/api/dashboard/pl-data` — must accept `from`/`to` and `granularity`
4. `/api/dashboard/trends` — must accept `from`/`to` and `metric`

If any route doesn't accept these params, add them. The query should filter `daily_sales`, `daily_fees`, `daily_ads` by `date >= from AND date <= to`.

---

## CRITICAL RULES

1. Test at localhost:3000 logged in. Not preview mode.
2. All changes in main repo only. No worktree.
3. Add console.log to each API route showing received params.
4. Do NOT install heavy UI libraries (MUI, Ant Design, Chakra). Only react-day-picker.
5. Do NOT break the existing combo selector on Tiles view — it should coexist with the global date dropdown.
6. Dark mode styling on the calendar popup.
