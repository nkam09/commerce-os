# Commerce OS — Repo Checklist

Tracks the state of the repo across all checkpoints. Update as each item is verified locally or in production.

---

## Legend

- ✅ Done and verified
- 🔲 Not yet done
- ⚠️ Done but requires live validation
- ❌ Known issue

---

## CP1 — Foundation

| Item | Status |
|------|--------|
| `next.config.ts` with `serverExternalPackages` | ✅ |
| `tailwind.config.ts` | ✅ |
| `tsconfig.json` with `@/` path alias | ✅ |
| `src/middleware.ts` at repo root (not src/) | ✅ |
| `src/app/layout.tsx` (root Clerk provider) | ✅ |
| `src/app/(app)/layout.tsx` (app shell) | ✅ |
| `src/components/app/` (sidebar, topbar, shell, nav-items) | ✅ |
| `src/lib/db/prisma.ts` (singleton client) | ✅ |
| `src/lib/auth/require-user.ts` (Clerk → internal user) | ✅ |
| `src/lib/utils/cn.ts` | ✅ |
| App compiles with `npm run build` | 🔲 verify after CP6 applied |
| App boots with `npm run dev` | ✅ |

---

## CP2 — Schema, Seed, Utilities, Hooks

| Item | Status |
|------|--------|
| `prisma/schema.prisma` — 12 enums, 17 models | ✅ |
| All model unique constraints correct | ✅ |
| `prisma/seed.ts` runs without error | ✅ |
| `src/lib/utils/api.ts` (`apiSuccess`, `apiError`, envelope) | ✅ |
| `src/lib/utils/formatters.ts` | ✅ |
| `src/lib/utils/math.ts` | ✅ |
| `src/lib/utils/dates.ts` | ✅ |
| `src/lib/utils/validation.ts` (all Zod schemas) | ✅ |
| `src/hooks/use-api-data.ts` (`useApiData`, `useApiMutation`) | ✅ |
| `src/components/shared/` (data-table, metric-card, status-badge, etc.) | ✅ |

---

## CP3 — Services, API Routes, Dashboard Pages

| Item | Status |
|------|--------|
| `product-service.ts` | ✅ |
| `dashboard-query-service.ts` | ✅ |
| `page-payload-service.ts` | ✅ |
| `product-drawer-service.ts` | ✅ |
| `GET /api/dashboard/overview` | ✅ |
| `GET /api/dashboard/inventory` | ✅ |
| `GET /api/dashboard/cashflow` | ✅ |
| `GET /api/pages/products` | ✅ |
| `GET /api/pages/purchase-orders` | ✅ |
| `GET /api/pages/shipments` | ✅ |
| `GET /api/pages/expenses` | ✅ |
| `GET /api/pages/projects` | ✅ |
| `GET /api/products/[id]/drawer` | ✅ |
| `GET /api/sync/health` | ✅ |
| `/overview` page renders with seed data | ✅ |
| `/products` page renders with seed data | ✅ |
| `/inventory` page renders with seed data | ✅ |
| `/cash-flow` page renders with seed data | ✅ |
| `/sync-health` page renders | ✅ |
| `/settings` page renders | ✅ |

---

## CP4 — CRUD Layer and Operations Pages

| Item | Status |
|------|--------|
| `POST /api/products/create` | ✅ |
| `PATCH /api/products/[id]/settings` | ✅ |
| `POST /api/products/[id]/archive` | ✅ |
| `POST /api/purchase-orders/create` | ✅ |
| `PATCH /api/purchase-orders/[id]` | ✅ |
| `POST /api/purchase-orders/[id]/archive` | ✅ |
| `POST /api/shipments/create` | ✅ |
| `PATCH /api/shipments/[id]` | ✅ |
| `POST /api/shipments/[id]/archive` | ✅ |
| `POST /api/expenses/create` | ✅ |
| `PATCH /api/expenses/[id]` | ✅ |
| `POST /api/expenses/[id]/archive` | ✅ |
| `POST /api/projects/create` | ✅ |
| `PATCH /api/projects/[id]` | ✅ |
| `POST /api/projects/[id]/archive` | ✅ |
| `src/components/forms/` (all form components) | ✅ |
| `src/components/pages/` (PO, shipments, expenses, projects page components) | ✅ |
| `/purchase-orders` page loads | ✅ |
| `/shipments` page loads | ✅ |
| `/expenses` page loads | ✅ |
| `/projects` page loads | ✅ |
| Add Product dialog works | ✅ |
| Product settings save works | ✅ |
| Archive works for all entity types | ✅ |

---

## CP5 — Amazon Ingestion Architecture

| Item | Status |
|------|--------|
| `src/lib/amazon/sp-api-client.ts` | ✅ |
| `src/lib/amazon/ads-api-client.ts` | ✅ |
| `src/lib/amazon/get-sp-client-for-user.ts` | ✅ |
| `src/lib/amazon/order-payload-transformer.ts` | ✅ |
| `src/lib/amazon/financial-event-flattener.ts` | ✅ |
| `src/lib/amazon/financial-event-bucket-mapper.ts` | ✅ |
| `src/lib/amazon/financial-events-transformer.ts` | ✅ |
| `src/lib/amazon/inventory-payload-transformer.ts` | ✅ |
| `src/lib/amazon/ads-report-parser.ts` | ✅ |
| `src/lib/amazon/ads-report-transformer.ts` | ✅ |
| `src/lib/sync/sync-orchestration-service.ts` | ✅ |
| `src/lib/sync/sales-normalization-service.ts` | ✅ |
| `src/lib/sync/financial-normalization-service.ts` | ✅ |
| `src/lib/sync/inventory-normalization-service.ts` | ✅ |
| `src/lib/sync/ads-normalization-service.ts` | ✅ |
| `src/lib/services/recompute-orchestration-service.ts` | ✅ |
| `src/lib/jobs/job-types.ts` | ✅ |
| `src/lib/jobs/job-connection-resolver.ts` | ✅ |
| `src/lib/jobs/sync-orders-job.ts` | ✅ |
| `src/lib/jobs/sync-finances-job.ts` | ✅ |
| `src/lib/jobs/sync-inventory-job.ts` | ✅ |
| `src/lib/jobs/sync-catalog-job.ts` (placeholder) | ✅ |
| `src/lib/jobs/sync-ads-products-job.ts` | ✅ |
| `src/lib/jobs/run-sync-orders.ts` + runners/ copy | ✅ |
| `src/lib/jobs/run-sync-finances.ts` + runners/ copy | ✅ |
| `src/lib/jobs/run-sync-inventory.ts` + runners/ copy | ✅ |
| `src/lib/jobs/run-sync-catalog.ts` + runners/ copy | ✅ |
| `src/lib/jobs/run-sync-ads-products.ts` + runners/ copy | ✅ |
| `src/lib/jobs/run-daily-summary.ts` (placeholder) | ✅ |
| `src/lib/jobs/run-rules-refresh.ts` (placeholder) | ✅ |
| `src/lib/jobs/run-sync-health-refresh.ts` | ✅ |
| `src/lib/jobs/worker-entry.ts` | ✅ |
| `render.yaml` | ✅ |
| Schema alignment audit passed | ✅ |

### CP5 Items Requiring Live Validation

| Item | Status |
|------|--------|
| LWA token exchange succeeds with real credentials | ⚠️ |
| STS AssumeRole XML parsing correct | ⚠️ |
| SigV4 signing accepted by SP API | ⚠️ |
| SP API order response wrapper shape (`payload.Orders`) | ⚠️ |
| SP API financial events response wrapper shape | ⚠️ |
| SP API inventory summaries response wrapper + `inventoryDetails` nesting | ⚠️ |
| Financial event fee type strings match bucket mapper | ⚠️ |
| Fee amount sign convention (negative = deduction) | ⚠️ |
| Ads report column names (`cost`, `purchases7d`, `sales7d`) | ⚠️ |
| Ads report date format (`YYYY-MM-DD` vs `YYYYMMDD`) | ⚠️ |
| Ads report polling interval and timeout | ⚠️ |
| Catalog Items API response shape for title/brand/imageUrl | ⚠️ |
| Rate limits on all SP API and Ads API endpoints | ⚠️ |
| `npm run job:sync-orders` runs without error | 🔲 |
| `npm run job:sync-inventory` runs without error | 🔲 |
| `npm run job:sync-finances` runs without error | 🔲 |
| `npm run job:sync-ads-products` runs without error | 🔲 |
| Sync health page shows job run records after first sync | 🔲 |

---

## CP6 — Validation Routes and Tests

| Item | Status |
|------|--------|
| `GET /api/sync/amazon/test-connection` | ✅ |
| `POST /api/sync/amazon/test-orders-transform` | ✅ |
| `POST /api/sync/amazon/test-financial-transform` | ✅ |
| `POST /api/sync/amazon/test-inventory-transform` | ✅ |
| `tests/order-payload-transformer.test.ts` | ✅ |
| `tests/financial-events-transformer.test.ts` | ✅ |
| `tests/ads-report-transformer.test.ts` | ✅ |
| `tests/inventory-planning-service.test.ts` | ✅ |
| `tests/profit-service.test.ts` | ✅ |
| `vitest.config.ts` with `@/` alias | ✅ |
| `README.md` updated | ✅ |
| `REPO_CHECKLIST.md` created | ✅ |
| `npm run test` passes | 🔲 verify locally |
| `npm run build` passes | 🔲 verify locally |
| `npm run typecheck` passes | 🔲 verify locally |

---

## Definition of Done (from build brief)

| Item | Status |
|------|--------|
| Repo exists | ✅ |
| App compiles | 🔲 verify |
| App boots locally | ✅ |
| Migrations run | ✅ |
| Seed works | ✅ |
| Pages render with demo data | ✅ |
| Create/edit/archive works | ✅ |
| Tests pass | 🔲 verify |
| Build passes | 🔲 verify |
| SP API token route works | ⚠️ live validation required |
| First live orders sync succeeds | 🔲 |
| First live inventory sync succeeds | 🔲 |
| First live finances sync succeeds | 🔲 |
| First live ads sync succeeds | 🔲 |
| Sync health reflects job runs | 🔲 |
