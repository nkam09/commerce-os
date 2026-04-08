# Commerce OS

Internal Amazon operator platform. Combines Sellerboard-style profitability visibility, inventory planning, purchase order tracking, shipment tracking, expense tracking, cash flow forecasting, project management, and sync health monitoring.

---

## Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Prisma** + **PostgreSQL**
- **Clerk** (authentication)
- **Tailwind CSS**
- **Vitest** (tests)
- **Render** (deployment target)

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/commerce_os"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
```

Clerk keys are available at https://dashboard.clerk.com. Amazon credentials can be left blank until live sync validation.

### 3. Create the database

```bash
createdb commerce_os
```

Or use your preferred Postgres client or Docker setup.

### 4. Run migrations

```bash
npm run db:migrate
```

### 5. Seed demo data

```bash
npm run db:seed
```

Creates a demo user, US marketplace, 3 products with 30 days of sales/fees/ads data, inventory snapshots, purchase orders, shipments, expenses, projects, and AI insights.

### 6. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000. Sign in via Clerk, then navigate to `/overview`.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Run Vitest tests |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Reset and re-migrate |
| `npm run job:sync-orders` | Run orders sync job |
| `npm run job:sync-inventory` | Run inventory sync job |
| `npm run job:sync-finances` | Run finances sync job |
| `npm run job:sync-ads-products` | Run ads sync job |
| `npm run job:sync-catalog` | Run catalog sync job (placeholder) |
| `npm run job:sync-health-refresh` | Refresh sync connection statuses |
| `npm run worker` | Start background worker (all jobs on interval) |

---

## Pages

| Route | Description |
|-------|-------------|
| `/overview` | Executive dashboard — sales, profit, inventory health, alerts |
| `/products` | Product catalog with settings completeness |
| `/inventory` | Inventory planner with reorder calculations |
| `/cash-flow` | Cash flow — inflows, PO balances, expense burn |
| `/purchase-orders` | PO tracking |
| `/shipments` | Shipment tracking |
| `/expenses` | Operating expenses |
| `/projects` | Internal project management |
| `/sync-health` | Amazon sync job status and cursors |
| `/settings` | Credential reference and validation routes |

---

## API Routes

### Dashboard
- `GET /api/dashboard/overview`
- `GET /api/dashboard/inventory`
- `GET /api/dashboard/cashflow`

### Pages
- `GET /api/pages/products`
- `GET /api/pages/purchase-orders`
- `GET /api/pages/shipments`
- `GET /api/pages/expenses`
- `GET /api/pages/projects`

### Products
- `GET  /api/products/[id]/drawer`
- `POST /api/products/create`
- `PATCH /api/products/[id]/settings`
- `POST /api/products/[id]/archive`

### Operations (CRUD)
- `POST /api/purchase-orders/create`
- `PATCH /api/purchase-orders/[id]`
- `POST /api/purchase-orders/[id]/archive`
- `POST /api/shipments/create`
- `PATCH /api/shipments/[id]`
- `POST /api/shipments/[id]/archive`
- `POST /api/expenses/create`
- `PATCH /api/expenses/[id]`
- `POST /api/expenses/[id]/archive`
- `POST /api/projects/create`
- `PATCH /api/projects/[id]`
- `POST /api/projects/[id]/archive`

### Sync
- `GET  /api/sync/health`
- `GET  /api/sync/amazon/test-connection`
- `POST /api/sync/amazon/test-orders-transform`
- `POST /api/sync/amazon/test-financial-transform`
- `POST /api/sync/amazon/test-inventory-transform`

---

## Validation Routes

These routes are auth-gated and intended for manual use during live credential setup.

### `GET /api/sync/amazon/test-connection`

Attempts an LWA token exchange using `AMAZON_SP_API_CLIENT_ID`, `AMAZON_SP_API_CLIENT_SECRET`, and `AMAZON_SP_API_REFRESH_TOKEN`. On success, updates `lastTestedAt` on the SP_API SyncConnection record.

Returns: `{ tokenType, expiresIn, latencyMs, connectionUpdated }`

### `POST /api/sync/amazon/test-orders-transform`

Accepts raw SP API orders-with-items payload. Runs through `transformOrdersToSaleRows`. Returns aggregated `RawSaleRow[]`.

Body: `{ orders: Array<{ order: SpOrder, items: SpOrderItem[] }> }`

### `POST /api/sync/amazon/test-financial-transform`

Accepts raw SP API FinancialEvents object. Runs through `transformFinancialEventsToFeeRows`. Returns `RawFeeRow[]` with fee bucket breakdown.

Body: `{ financialEvents: SpFinancialEvents, marketplaceCode?: string }`

### `POST /api/sync/amazon/test-inventory-transform`

Accepts raw SP API inventorySummaries array. Runs through `transformInventorySummariesToRows`. Returns `RawInventoryRow[]`.

Body: `{ inventorySummaries: SpInventorySummary[], marketplaceCode?: string, snapshotDate?: string }`

---

## Amazon Live Validation Sequence

After local seed works:

1. Add SP API credentials to `.env.local`
2. Add Ads API credentials to `.env.local`
3. `GET /api/sync/amazon/test-connection` — verify LWA token exchange
4. Copy a real orders response and POST to `/api/sync/amazon/test-orders-transform`
5. `npm run job:sync-orders`
6. `npm run job:sync-inventory`
7. `npm run job:sync-finances`
8. `npm run job:sync-ads-products`
9. Check `/sync-health` for job run results
10. Compare data against Seller Central and Ads Manager

Items that still require live validation are marked `// TODO:` throughout `src/lib/amazon/`.

---

## Tests

```bash
npm run test
```

Tests are in `tests/` and use Vitest with `@/` path alias resolution via `vitest.config.ts`. They test pure transformer and planning functions only — no DB, no Clerk, no Next.js runtime required.

| Test file | Covers |
|-----------|--------|
| `order-payload-transformer.test.ts` | Order aggregation, cancellation, refund merge |
| `financial-events-transformer.test.ts` | Fee flattening, bucket mapping, revenue exclusion |
| `ads-report-transformer.test.ts` | Report parsing, ACOS/ROAS/CPC math, aggregation |
| `inventory-planning-service.test.ts` | Inventory transform, days-of-stock, reorder qty |
| `profit-service.test.ts` | Net revenue, gross margin, net profit % |

---

## Deployment (Render)

See `render.yaml`. Deploys three services:
- `commerce-os-web` — Next.js web service
- `commerce-os-worker` — Background sync worker
- `commerce-os-db` — PostgreSQL database

Set all `sync: false` env vars in the Render dashboard after initial deploy. Set `CLERK_SYNC_USER_ID` in the worker environment after first sign-in.

---

## Checkpoints Completed

- ✅ CP1 — Foundation (config, layout, shell, auth)
- ✅ CP2 — Schema, seed, utilities, hooks, shared components
- ✅ CP3 — Services, API routes, dashboard pages, product drawer
- ✅ CP4 — Manual ops CRUD (create/edit/archive forms + PO/shipment/expense/project pages)
- ✅ CP5 — Amazon ingestion (SP API, Ads API, transformers, normalization, jobs, workers)
- ✅ CP6 — Validation routes, tests, README, REPO_CHECKLIST
