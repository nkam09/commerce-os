"use client";

import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";
import type { InventorySummaryCard } from "@/lib/services/inventory-service";

type Props = {
  cards: InventorySummaryCard[];
};

function SummaryCard({ card }: { card: InventorySummaryCard }) {
  const isHighlighted = card.highlighted;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Colored header band */}
      <div
        className={cn(
          "px-3 py-2",
          isHighlighted
            ? "bg-rose-500/15 border-b border-rose-500/30"
            : "bg-teal-500/15 border-b border-teal-500/30"
        )}
      >
        <span
          className={cn(
            "text-xs font-semibold",
            isHighlighted ? "text-rose-400" : "text-teal-400"
          )}
        >
          {card.label}
        </span>
      </div>

      {/* Metric rows */}
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-2xs text-muted-foreground">Units</span>
          <span className="text-xs font-medium text-foreground tabular-nums">
            {formatNumber(card.units)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-2xs text-muted-foreground">Cost of goods</span>
          <span className="text-xs font-medium text-foreground tabular-nums">
            {formatCurrency(card.costOfGoods)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-2xs text-muted-foreground">Potential sales</span>
          <span className="text-xs font-medium text-foreground tabular-nums">
            {formatCurrency(card.potentialSales)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-2xs text-muted-foreground">Potential profit</span>
          <span className="text-xs font-medium text-green-400 tabular-nums">
            {formatCurrency(card.potentialProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function InventorySummaryCards({ cards }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <SummaryCard key={card.label} card={card} />
      ))}
    </div>
  );
}
