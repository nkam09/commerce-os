"use client";

// Re-export the full ProductPerformanceTable from the product-table module.
// The previous simple implementation is replaced by a TanStack Table-based version
// with its own period selector, tabs, group by, column visibility, and export controls.

export { ProductPerformanceTable } from "./product-table";
export type { ProductRow } from "./product-table/types";
