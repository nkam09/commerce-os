"use client";

import { useState, useRef, useEffect } from "react";
import { useBrandStore } from "@/lib/stores/brand-store";
import { useApiData } from "@/hooks/use-api-data";
import { cn } from "@/lib/utils/cn";

export function BrandSelector() {
  const { selectedBrand, setSelectedBrand } = useBrandStore();
  const { data: brands } = useApiData<string[]>("/api/brands");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Don't render if no brands or only one brand
  if (!brands || brands.length <= 1) return null;

  const options = ["All Brands", ...brands];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
          selectedBrand !== "All Brands"
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-elevated hover:text-foreground"
        )}
      >
        <BrandIcon />
        <span className="hidden sm:inline max-w-[120px] truncate">{selectedBrand}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 animate-fade-in rounded-lg border border-border bg-card py-1 shadow-xl">
          {options.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                setSelectedBrand(b);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-2 text-left text-xs transition hover:bg-elevated",
                b === selectedBrand ? "font-semibold text-primary" : "text-foreground"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M1 2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2Zm0 5.5A1.5 1.5 0 0 1 2.5 6h11A1.5 1.5 0 0 1 15 7.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-5ZM3 8.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H3Zm0 2a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1H3Z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5 opacity-60">
      <path d="M3.22 4.72a.75.75 0 0 1 1.06 0L6 6.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0L3.22 5.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}
