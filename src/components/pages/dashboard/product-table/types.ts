export interface ProductRow {
  id: string;
  asin: string;
  sku: string | null;
  title: string | null;
  imageUrl?: string | null;
  price: number;
  cogs: number;
  grossSales: number;
  netRevenue: number;
  units: number;
  fees: number;
  adSpend: number;
  acos: number | null;
  tacos: number | null;
  netProfit: number;
  margin: number | null;
  stock: number;
  daysLeft: number | null;
  refunds: number;
  refundCount: number;
  refundPct: number | null;
  amazonFees: number;
  estPayout: number;
  roi: number | null;
}

export type PeriodKey =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "mtd"
  | "last_month";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7", label: "Last 7 days" },
  { value: "last_30", label: "Last 30 days" },
  { value: "mtd", label: "MTD" },
  { value: "last_month", label: "Last Month" },
];

export type GroupByKey = "asin" | "parent" | "marketplace" | "brand" | "supplier";

export const GROUP_BY_OPTIONS: { value: GroupByKey; label: string }[] = [
  { value: "asin", label: "ASIN" },
  { value: "parent", label: "Parent" },
  { value: "marketplace", label: "Marketplace" },
  { value: "brand", label: "Brand" },
  { value: "supplier", label: "Supplier" },
];

export type TabKey = "products" | "order_items";
