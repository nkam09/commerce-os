"use client";

import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import type { CashPositionCard } from "@/lib/services/cashflow-service";

type Props = {
  cards: CashPositionCard[];
};

export function CashflowSummaryCards({ cards }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const isNetCashFlow = card.label === "Net Cash Flow";
        const isPositive = card.value >= 0;

        return (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-2xs text-muted-foreground mb-1">{card.label}</p>
            <p
              className={cn(
                "text-xl font-semibold tabular-nums",
                isNetCashFlow
                  ? isPositive
                    ? "text-green-400"
                    : "text-red-400"
                  : "text-foreground"
              )}
            >
              {formatCurrency(card.value)}
            </p>

            <div className="mt-3 space-y-1">
              {card.subItems.map((sub) => (
                <div
                  key={sub.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-2xs text-muted-foreground">
                    {sub.label}
                  </span>
                  <span className="text-2xs tabular-nums text-foreground">
                    {typeof sub.value === "number"
                      ? formatCurrency(sub.value)
                      : sub.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
