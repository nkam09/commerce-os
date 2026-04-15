"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BrandState {
  selectedBrand: string;
  setSelectedBrand: (brand: string) => void;
}

export const useBrandStore = create<BrandState>()(
  persist(
    (set) => ({
      selectedBrand: "All Brands",
      setSelectedBrand: (brand) => set({ selectedBrand: brand }),
    }),
    {
      name: "commerce-os-brand",
    }
  )
);

/**
 * Returns the `&brand=X` query suffix to append to API URLs.
 * Empty string when "All Brands" is selected (no filter).
 */
export function useBrandParam(): string {
  const brand = useBrandStore((s) => s.selectedBrand);
  return brand && brand !== "All Brands"
    ? `&brand=${encodeURIComponent(brand)}`
    : "";
}
