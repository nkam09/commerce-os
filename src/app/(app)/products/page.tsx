"use client";

import { AppTopbar } from "@/components/app/app-topbar";
import { ProductsManagement } from "@/components/pages/products/products-management";

export default function ProductsPage() {
  return (
    <>
      <AppTopbar title="Products" />
      <main className="flex-1 overflow-y-auto">
        <ProductsManagement />
      </main>
    </>
  );
}
