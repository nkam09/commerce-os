"use client";

import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/formatters";
import type { MonthlyCashflow } from "@/lib/services/cashflow-service";

type Props = {
  data: MonthlyCashflow[];
};

type RowDef = {
  label: string;
  key: keyof MonthlyCashflow;
  isNegative?: boolean;
  isBold?: boolean;
  isColored?: boolean;
};

const ROWS: RowDef[] = [
  { label: "Revenue", key: "revenue" },
  { label: "Amazon Fees", key: "amazonFees", isNegative: true },
  { label: "Ad Spend", key: "adSpend", isNegative: true },
  { label: "COGS", key: "cogs", isNegative: true },
  { label: "Refunds", key: "refunds", isNegative: true },
  { label: "Indirect Expenses", key: "indirectExpenses", isNegative: true },
  { label: "Net Cash Flow", key: "netCashFlow", isBold: true, isColored: true },
  {
    label: "Cumulative Balance",
    key: "cumulativeBalance",
    isBold: true,
    isColored: true,
  },
];

export function MonthlyBreakdownTable({ data }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground">
          Monthly Cash Flow Breakdown
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-2xs font-medium text-muted-foreground px-4 py-2 sticky left-0 bg-card">
                Category
              </th>
              {data.map((m) => (
                <th
                  key={m.month}
                  className={cn(
                    "text-right text-2xs font-medium px-4 py-2 min-w-[100px]",
                    m.isProjected
                      ? "text-muted-foreground italic"
                      : "text-muted-foreground"
                  )}
                >
                  {m.month}
                  {m.isProjected && (
                    <span className="block text-2xs font-normal opacity-60">
                      projected
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-border/50">
                <td
                  className={cn(
                    "px-4 py-2.5 sticky left-0 bg-card",
                    row.isBold
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {row.label}
                </td>
                {data.map((m) => {
                  const val = m[row.key] as number;
                  let color = "text-foreground";
                  if (row.isColored) {
                    color = val >= 0 ? "text-green-400" : "text-red-400";
                  } else if (row.isNegative) {
                    color = "text-red-400";
                  }

                  return (
                    <td
                      key={m.month}
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums",
                        row.isBold && "font-semibold",
                        m.isProjected && !row.isBold && "italic",
                        color
                      )}
                    >
                      {row.isNegative ? "-" : ""}
                      {formatCurrency(Math.abs(val))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
