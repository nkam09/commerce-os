"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import type { SettlementRow } from "@/lib/services/cashflow-service";

type Props = {
  settlements: SettlementRow[];
};

function statusBadge(status: SettlementRow["status"]) {
  const styles = {
    paid: "bg-green-500/10 text-green-400 border-green-500/20",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    projected: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium capitalize",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function SettlementTable({ settlements }: Props) {
  const sorted = useMemo(() => {
    return [...settlements].sort((a, b) => {
      const dateA = a.paymentDate ?? a.periodEnd;
      const dateB = b.paymentDate ?? b.periodEnd;
      return dateB.localeCompare(dateA);
    });
  }, [settlements]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground">
          Settlement History
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-2xs font-medium text-muted-foreground px-4 py-2">
                Period
              </th>
              <th className="text-left text-2xs font-medium text-muted-foreground px-4 py-2">
                Status
              </th>
              <th className="text-right text-2xs font-medium text-muted-foreground px-4 py-2">
                Gross Sales
              </th>
              <th className="text-right text-2xs font-medium text-muted-foreground px-4 py-2">
                Refunds
              </th>
              <th className="text-right text-2xs font-medium text-muted-foreground px-4 py-2">
                Amazon Fees
              </th>
              <th className="text-right text-2xs font-medium text-muted-foreground px-4 py-2">
                Ad Spend
              </th>
              <th className="text-right text-2xs font-medium text-muted-foreground px-4 py-2">
                Other
              </th>
              <th className="text-right text-2xs font-medium text-muted-foreground px-4 py-2">
                Net Payout
              </th>
              <th className="text-right text-2xs font-medium text-muted-foreground px-4 py-2">
                Payment
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border/50 hover:bg-elevated/30 transition"
              >
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="text-foreground">
                    {formatShortDate(s.periodStart)} –{" "}
                    {formatShortDate(s.periodEnd)}
                  </span>
                </td>
                <td className="px-4 py-2.5">{statusBadge(s.status)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {formatCurrency(s.grossSales)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-400">
                  -{formatCurrency(s.refunds)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-400">
                  -{formatCurrency(s.amazonFees)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-400">
                  -{formatCurrency(s.adSpend)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  -{formatCurrency(s.otherDeductions)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums font-semibold",
                    s.netPayout >= 0 ? "text-green-400" : "text-red-400"
                  )}
                >
                  {formatCurrency(s.netPayout)}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {s.paymentDate && (
                    <span className="text-muted-foreground">
                      {formatShortDate(s.paymentDate)}
                    </span>
                  )}
                  {s.daysUntilPayout !== null && (
                    <span
                      className={cn(
                        "ml-1.5 text-2xs font-medium",
                        s.daysUntilPayout <= 3
                          ? "text-green-400"
                          : "text-muted-foreground"
                      )}
                    >
                      ({s.daysUntilPayout}d)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
