"use client";
import { useEffect, useState } from "react";
import {
  Package,
  AlertTriangle,
  TrendingDown,
  RefreshCw,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShoppingCart,
} from "lucide-react";

type InventoryRow = {
  productId: string;
  sku: string;
  asin: string;
  title: string;
  available: number;
  inbound: number;
  velocityPerDay: number;
  daysLeft: number;
  reorderDate: string | null;
  reorderPoint: number;
  suggestedQty: number;
  cashNeeded: number;
  status: "HEALTHY" | "AT_RISK" | "CRITICAL" | "OUT_OF_STOCK";
  hasCogs: boolean;
};

type Summary = {
  totalAvailable: number;
  totalInbound: number;
  atRiskCount: number;
  criticalCount: number;
  totalProducts: number;
};

type EditingState = {
  productId: string;
  field: "available" | "reorderPoint" | "reorderQty" | "leadTimeDays" | "cogs";
  value: string;
};

const STATUS_CONFIG = {
  HEALTHY: { label: "Healthy", color: "text-emerald-400", bg: "bg-emerald-400/10", dot: "bg-emerald-400" },
  AT_RISK: { label: "At Risk", color: "text-amber-400", bg: "bg-amber-400/10", dot: "bg-amber-400" },
  CRITICAL: { label: "Critical", color: "text-red-400", bg: "bg-red-400/10", dot: "bg-red-400" },
  OUT_OF_STOCK: { label: "Out of Stock", color: "text-red-500", bg: "bg-red-500/10", dot: "bg-red-500" },
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-[#161b22] border border-white/8 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
        <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
          <Icon size={14} className={color.replace("bg-", "text-").replace("/10", "")} />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function DaysLeftBadge({ days, status }: { days: number; status: string }) {
  if (days === 999) return <span className="text-gray-500">—</span>;
  if (status === "OUT_OF_STOCK" || days === 0)
    return <span className="text-red-400 font-semibold">0d</span>;
  const color =
    days < 20 ? "text-red-400" : days < 40 ? "text-amber-400" : "text-emerald-400";
  return <span className={`font-semibold ${color}`}>{days}d</span>;
}

export default function InventoryPage() {
  const [data, setData] = useState<{ rows: InventoryRow[]; summary: Summary } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof InventoryRow>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/inventory");
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const fieldMap: Record<string, string> = {
        available: "manualAvailable",
        reorderPoint: "reorderPoint",
        reorderQty: "reorderQty",
        leadTimeDays: "leadTimeDays",
        cogs: "landedCogsPerUnit",
      };
      await fetch(`/api/products/${editing.productId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldMap[editing.field]]: parseFloat(editing.value) }),
      });
      setEditing(null);
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function toggleSort(field: keyof InventoryRow) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedRows = data?.rows
    ? [...data.rows].sort((a, b) => {
        const statusOrder = { OUT_OF_STOCK: 0, CRITICAL: 1, AT_RISK: 2, HEALTHY: 3 };
        if (sortField === "status") {
          const diff = statusOrder[a.status] - statusOrder[b.status];
          return sortDir === "asc" ? diff : -diff;
        }
        const av = a[sortField] as any;
        const bv = b[sortField] as any;
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      })
    : [];

  const criticalRows = sortedRows.filter(
    (r) => r.status === "CRITICAL" || r.status === "OUT_OF_STOCK"
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw size={18} className="animate-spin" />
          <span>Loading inventory data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">
          Error: {error}
        </div>
      </div>
    );
  }

  const summary = data!.summary;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Inventory Planner</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reorder logic by SKU</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Alert banner */}
      {criticalRows.length > 0 && (
        <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-400 font-medium text-sm">
              Critical: {criticalRows.map((r) => r.sku).join(", ")} — Low Stock!
            </p>
            <p className="text-gray-500 text-xs mt-0.5">
              Place purchase orders immediately to avoid stockouts.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Available"
          value={summary.totalAvailable === 0 ? "—" : summary.totalAvailable.toLocaleString()}
          sub={summary.totalAvailable === 0 ? "FBA sync pending" : "FBA units"}
          icon={Package}
          color="bg-blue-400"
        />
        <StatCard
          label="Total Inbound"
          value={summary.totalInbound === 0 ? "—" : summary.totalInbound.toLocaleString()}
          sub="In transit / ordered"
          icon={ShoppingCart}
          color="bg-purple-400"
        />
        <StatCard
          label="At-Risk SKUs"
          value={summary.atRiskCount}
          sub="Need attention soon"
          icon={TrendingDown}
          color="bg-amber-400"
        />
        <StatCard
          label="Critical SKUs"
          value={summary.criticalCount}
          sub="Order now"
          icon={AlertTriangle}
          color="bg-red-400"
        />
      </div>

      {/* FBA notice if all zeros */}
      {summary.totalAvailable === 0 && (
        <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-300">
          <strong>Note:</strong> FBA inventory sync returned 0 units — this is an Amazon Seller Central API issue (new ASINs may not appear in the FBA inventory API immediately). Stock counts will populate once Amazon indexes your inventory. Velocity, reorder logic, and COGS data are fully functional.
        </div>
      )}

      {/* Table */}
      <div className="bg-[#161b22] border border-white/8 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {[
                  { key: "sku", label: "SKU / Product" },
                  { key: "available", label: "Available" },
                  { key: "inbound", label: "Inbound" },
                  { key: "velocityPerDay", label: "Velocity/Day" },
                  { key: "daysLeft", label: "Days Left" },
                  { key: "reorderDate", label: "Reorder Date" },
                  { key: "suggestedQty", label: "Suggested Qty" },
                  { key: "cashNeeded", label: "Cash Needed" },
                  { key: "status", label: "Status" },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key as keyof InventoryRow)}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      {sortField === key ? (
                        sortDir === "asc" ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )
                      ) : null}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedRows.map((row) => {
                const cfg = STATUS_CONFIG[row.status];
                const isExpanded = expandedRow === row.productId;

                return (
                  <>
                    <tr
                      key={row.productId}
                      className="hover:bg-white/3 transition-colors cursor-pointer"
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : row.productId)
                      }
                    >
                      {/* SKU / Product */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-white text-xs">{row.sku}</div>
                        <div className="text-gray-500 text-xs mt-0.5 max-w-[200px] truncate">
                          {row.title}
                        </div>
                      </td>

                      {/* Available */}
                      <td className="px-4 py-3 text-gray-300">
                        {row.available === 0 ? (
                          <span className="text-gray-600">—</span>
                        ) : (
                          row.available.toLocaleString()
                        )}
                      </td>

                      {/* Inbound */}
                      <td className="px-4 py-3">
                        {row.inbound > 0 ? (
                          <span className="text-blue-400 font-medium">
                            {row.inbound.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      {/* Velocity */}
                      <td className="px-4 py-3 text-gray-300">
                        {row.velocityPerDay > 0 ? `${row.velocityPerDay}/d` : (
                          <span className="text-gray-600">0.0</span>
                        )}
                      </td>

                      {/* Days Left */}
                      <td className="px-4 py-3">
                        <DaysLeftBadge days={row.daysLeft} status={row.status} />
                      </td>

                      {/* Reorder Date */}
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {row.reorderDate
                          ? new Date(row.reorderDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : <span className="text-gray-600">—</span>}
                      </td>

                      {/* Suggested Qty */}
                      <td className="px-4 py-3 text-gray-300">
                        {row.suggestedQty.toLocaleString()}
                      </td>

                      {/* Cash Needed */}
                      <td className="px-4 py-3">
                        {row.cashNeeded > 0 ? (
                          <span className="text-white font-medium">
                            ${row.cashNeeded.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">Set COGS</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setExpandedRow(isExpanded ? null : row.productId)
                            }
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                            title="Edit settings"
                          >
                            <Edit2 size={13} />
                          </button>
                          <a
                            href={`https://www.amazon.com/dp/${row.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                            title="View on Amazon"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded edit row */}
                    {isExpanded && (
                      <tr key={`${row.productId}-expand`} className="bg-white/2">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="bg-[#0d1117] border border-white/8 rounded-lg p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">
                              Edit Settings — {row.sku}
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              {[
                                {
                                  field: "available" as const,
                                  label: "FBA Units (manual)",
                                  value: row.available,
                                  placeholder: "e.g. 150",
                                },
                                {
                                  field: "reorderPoint" as const,
                                  label: "Reorder Point",
                                  value: row.reorderPoint,
                                  placeholder: "e.g. 50",
                                },
                                {
                                  field: "reorderQty" as const,
                                  label: "Reorder Qty",
                                  value: row.suggestedQty,
                                  placeholder: "e.g. 200",
                                },
                                {
                                  field: "leadTimeDays" as const,
                                  label: "Lead Time (days)",
                                  value: 30,
                                  placeholder: "e.g. 30",
                                },
                                {
                                  field: "cogs" as const,
                                  label: "Landed COGS/Unit ($)",
                                  value: row.cashNeeded / row.suggestedQty || 0,
                                  placeholder: "e.g. 4.50",
                                },
                              ].map(({ field, label, value, placeholder }) => {
                                const isEditingThis =
                                  editing?.productId === row.productId &&
                                  editing?.field === field;

                                return (
                                  <div key={field} className="space-y-1">
                                    <label className="text-xs text-gray-500">{label}</label>
                                    {isEditingThis ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          value={editing.value}
                                          onChange={(e) =>
                                            setEditing({ ...editing, value: e.target.value })
                                          }
                                          className="w-full bg-[#161b22] border border-blue-500/50 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-400"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveEdit();
                                            if (e.key === "Escape") setEditing(null);
                                          }}
                                        />
                                        <button
                                          onClick={saveEdit}
                                          disabled={saving}
                                          className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                        >
                                          <Check size={12} />
                                        </button>
                                        <button
                                          onClick={() => setEditing(null)}
                                          className="p-1 rounded bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          setEditing({
                                            productId: row.productId,
                                            field,
                                            value: String(value || ""),
                                          })
                                        }
                                        className="w-full bg-[#161b22] border border-white/10 hover:border-white/20 rounded px-2 py-1.5 text-left text-white text-xs flex items-center justify-between group transition-colors"
                                      >
                                        <span>
                                          {field === "cogs"
                                            ? row.hasCogs
                                              ? `$${(row.cashNeeded / row.suggestedQty).toFixed(2)}`
                                              : "Not set"
                                            : value}
                                        </span>
                                        <Edit2
                                          size={10}
                                          className="text-gray-600 group-hover:text-gray-400"
                                        />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {!row.hasCogs && (
                              <p className="text-xs text-amber-400/80 mt-3">
                                ⚠ Set Landed COGS/Unit to calculate Cash Needed and accurate profit margins.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sortedRows.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No products found. Add products to get started.
        </div>
      )}
    </div>
  );
}
