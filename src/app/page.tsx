"use client";
import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import {
  useOverview, useProfit, useInventory, useCashFlow,
  usePurchaseOrders, useShipments, useReimbursements,
  useExpenses, useProjects, useAiInsights, askAI,
  type Period
} from "@/hooks/useCommerceOS";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n: number, prefix = "$") =>
  `${prefix}${n >= 1000 ? (n / 1000).toFixed(1) + "k" : n?.toLocaleString() ?? "0"}`;

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  HEALTHY:       { bg: "bg-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400" },
  REORDER_SOON:  { bg: "bg-amber-500/20",   text: "text-amber-400",   dot: "bg-amber-400"   },
  AT_RISK:       { bg: "bg-red-500/20",     text: "text-red-400",     dot: "bg-red-400"     },
  STOCKOUT_RISK: { bg: "bg-red-700/30",     text: "text-red-300",     dot: "bg-red-300"     },
};

const poStatusColors: Record<string, string> = {
  DRAFT:         "text-slate-400 bg-slate-700/50",
  IN_PRODUCTION: "text-amber-400 bg-amber-500/20",
  SHIPPED:       "text-blue-400 bg-blue-500/20",
  RECEIVED:      "text-emerald-400 bg-emerald-500/20",
  CLOSED:        "text-slate-500 bg-slate-800/50",
};

const stageColors: Record<string, string> = {
  BOOKED:        "text-slate-400",
  IN_PRODUCTION: "text-amber-400",
  ON_WATER:      "text-blue-400",
  CUSTOMS:       "text-purple-400",
  DELIVERED:     "text-emerald-400",
  CHECKED_IN:    "text-emerald-600",
};

const severityColors: Record<string, { bg: string; badge: string; icon: string }> = {
  HIGH:   { bg: "bg-red-500/10 border-red-500/30",    badge: "bg-red-500/20 text-red-400",    icon: "🔴" },
  MEDIUM: { bg: "bg-amber-500/10 border-amber-500/30", badge: "bg-amber-500/20 text-amber-400", icon: "🟡" },
  LOW:    { bg: "bg-blue-500/10 border-blue-500/30",   badge: "bg-blue-500/20 text-blue-400",   icon: "🔵" },
};

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────
const Sidebar = ({ activePage, setActivePage }: { activePage: string; setActivePage: (p: string) => void }) => {
  const navItems = [
    { id: "overview",       icon: "⬡", label: "Overview" },
    { id: "profit",         icon: "◈", label: "Profit" },
    { id: "inventory",      icon: "▣", label: "Inventory" },
    { id: "cashflow",       icon: "⟡", label: "Cash Flow" },
    { id: "orders",         icon: "◫", label: "Purchase Orders" },
    { id: "shipments",      icon: "◬", label: "Shipments" },
    { id: "reimbursements", icon: "◎", label: "Reimbursements" },
    { id: "expenses",       icon: "◉", label: "Expenses" },
    { id: "projects",       icon: "◧", label: "Projects" },
    { id: "ai",             icon: "✦", label: "AI Insights" },
  ];
  return (
    <div className="w-60 flex-shrink-0 bg-[#0a0a0f] border-r border-white/5 flex flex-col">
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">C</div>
          <div>
            <div className="text-white font-semibold text-sm tracking-wide">Commerce OS</div>
            <div className="text-slate-500 text-xs">Private Dashboard</div>
          </div>
        </div>
      </div>
      <div className="mx-4 mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-emerald-400 font-medium">Amazon Connected</span>
        </div>
        <div className="text-slate-500 text-xs mt-1">Last sync: 12 min ago</div>
      </div>
      <nav className="flex-1 p-3 mt-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setActivePage(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-left group ${activePage === item.id ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}`}>
            <span className={`text-base ${activePage === item.id ? "text-violet-400" : "text-slate-500 group-hover:text-slate-300"}`}>{item.icon}</span>
            {item.label}
            {item.id === "ai" && <span className="ml-auto w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">!</span>}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">N</div>
          <div>
            <div className="text-white text-xs font-medium">Naim</div>
            <div className="text-slate-500 text-xs">Owner</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const KPICard = ({ label, value, sub, delta, prefix = "$" }: { label: string; value: number | string; sub?: string; delta?: number; prefix?: string }) => (
  <div className="bg-[#0f0f1a] border border-white/5 rounded-xl p-5 flex flex-col gap-1 hover:border-white/10 transition-colors">
    <div className="text-slate-500 text-xs font-medium tracking-wide uppercase">{label}</div>
    <div className="text-2xl font-bold text-white mt-1">{prefix}{typeof value === "number" ? value >= 1000 ? (value / 1000).toFixed(1) + "k" : value.toLocaleString() : value}</div>
    {sub && <div className="text-slate-500 text-xs">{sub}</div>}
    {delta !== undefined && (
      <div className={`text-xs font-medium mt-1 ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
        {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}% vs last period
      </div>
    )}
  </div>
);

const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: string }) => (
  <div className="flex items-center justify-between mb-5">
    <div>
      <h2 className="text-white font-semibold text-lg">{title}</h2>
      {subtitle && <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>}
    </div>
    {action && <button className="px-4 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-sm border border-violet-500/30 transition-colors">{action}</button>}
  </div>
);

const Spinner = () => (
  <div className="flex items-center justify-center h-40">
    <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const ErrorBox = ({ msg }: { msg: string }) => (
  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{msg}</div>
);

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────

const fmtFull = (n: number) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PeriodTile = ({ title, subtitle, data, accent }: { title: string; subtitle: string; data: any; accent: string }) => {
  const t = data?.totals ?? {};
  const netColor = (t.netProfit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <div className={`bg-[#0f0f1a] border-t-2 ${accent} border-x border-b border-white/5 rounded-xl p-4 space-y-3`}>
      <div>
        <div className="text-white font-semibold text-sm">{title}</div>
        <div className="text-slate-500 text-xs">{subtitle}</div>
      </div>
      <div>
        <div className="text-slate-500 text-xs mb-0.5">Sales</div>
        <div className="text-white font-bold text-xl">{fmtShort(t.grossSales ?? 0)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-slate-500">Orders / Units</div>
          <div className="text-slate-200 font-medium">{t.unitsSold ?? 0} / {t.unitsSold ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-500">Ad cost</div>
          <div className="text-red-400 font-medium">{fmtShort(-(t.adSpend ?? 0))}</div>
        </div>
        <div>
          <div className="text-slate-500">Gross profit</div>
          <div className={`font-medium ${(t.grossSales ?? 0) - (t.amazonFees ?? 0) - (t.cogsTotal ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmtShort((t.grossSales ?? 0) - (t.amazonFees ?? 0) - (t.cogsTotal ?? 0))}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Net profit</div>
          <div className={`font-semibold ${netColor}`}>{fmtShort(t.netProfit ?? 0)}</div>
        </div>
      </div>
    </div>
  );
};

const OverviewPage = ({ setActivePage, setSelectedProduct }: { setActivePage: (p: string) => void; setSelectedProduct: (p: any) => void }) => {
  const { data: todayData,     loading: l1 } = useOverview("TODAY");
  const { data: yestData,      loading: l2 } = useOverview("YESTERDAY");
  const { data: mtdData,       loading: l3 } = useOverview("MTD");
  const { data: forecastData,  loading: l4 } = useOverview("30D");
  const { data: lastMonthData, loading: l5 } = useOverview("LAST_MONTH");

  const loading = l1 || l2 || l3 || l4 || l5;
  if (loading) return <Spinner />;

  const d = mtdData as any ?? {};
  const products = d.products ?? [];
  const alerts = d.alerts ?? [];
  const criticalAlerts = alerts.filter((a: any) => a.severity === "HIGH").length;
  const mtdTotals = (mtdData as any)?.totals ?? {};

  // Today's date info
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const yestDate = new Date(now); yestDate.setDate(now.getDate() - 1);
  const yestStr = yestDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const mtdStr = `1-${now.getDate()} ${now.toLocaleString("default", { month: "long" })} ${now.getFullYear()}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `1-${new Date(now.getFullYear(), now.getMonth(), 0).getDate()} ${lastMonthDate.toLocaleString("default", { month: "long" })} ${lastMonthDate.getFullYear()}`;

  return (
    <div className="space-y-6">

      {/* AI Brief */}
      <div className="bg-gradient-to-r from-violet-900/40 to-indigo-900/30 border border-violet-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-500/30 flex items-center justify-center text-xs">✦</div>
          <div className="flex-1">
            <div className="text-violet-300 font-semibold text-xs mb-1">AI Daily Brief</div>
            <p className="text-slate-300 text-sm">
              MTD Revenue: <span className="text-white font-medium">{fmtShort(mtdTotals.grossSales ?? 0)}</span> ·
              Net Profit: <span className={`font-medium ${(mtdTotals.netProfit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtFull(mtdTotals.netProfit ?? 0)}</span>
              {criticalAlerts > 0 && <span className="text-red-400 font-medium"> · {criticalAlerts} critical alert{criticalAlerts > 1 ? "s" : ""} need attention.</span>}
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setActivePage("ai")} className="px-3 py-1 rounded-md bg-violet-500/20 text-violet-300 text-xs border border-violet-500/30 hover:bg-violet-500/30 transition-colors">View All Insights</button>
              {criticalAlerts > 0 && <button onClick={() => setActivePage("inventory")} className="px-3 py-1 rounded-md bg-red-500/20 text-red-300 text-xs border border-red-500/30 hover:bg-red-500/30 transition-colors">⚠ Inventory</button>}
            </div>
          </div>
        </div>
      </div>

      {/* Period Tiles — Sellerboard style */}
      <div className="grid grid-cols-5 gap-3">
        <PeriodTile title="Today"             subtitle={todayStr}    data={todayData}     accent="border-blue-500" />
        <PeriodTile title="Yesterday"         subtitle={yestStr}     data={yestData}      accent="border-teal-500" />
        <PeriodTile title="Month to date"     subtitle={mtdStr}      data={mtdData}       accent="border-indigo-500" />
        <PeriodTile title="This month (forecast)" subtitle={`1-31 ${now.toLocaleString("default", { month: "long" })} ${now.getFullYear()}`} data={forecastData} accent="border-violet-500" />
        <PeriodTile title="Last month"        subtitle={lastMonthStr} data={lastMonthData} accent="border-emerald-500" />
      </div>

      {/* SKU Table */}
      <div>
        <SectionHeader title="SKU Performance" subtitle="Month to date" />
        <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {["Product", "Units", "Sales", "Ads", "Gross Profit", "Net Profit", "Margin", "ACoS"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((row: any, i: number) => {
                const s = row.summary ?? {};
                const health = row.health ?? "HEALTHY";
                const sc = statusColors[health] ?? statusColors.HEALTHY;
                const grossProfit = (s.grossSales ?? 0) - (s.amazonFees ?? 0) - (s.cogsTotal ?? 0);
                const netColor = (s.netProfit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
                const gpColor  = grossProfit >= 0 ? "text-emerald-400" : "text-red-400";
                const margin   = ((s.marginPercent ?? 0) * 100).toFixed(1);
                const acos     = ((s.acos ?? 0) * 100).toFixed(1);
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                      onClick={() => setSelectedProduct({ ...row.product, ...s, health })}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-violet-500/20 flex items-center justify-center text-xs text-violet-400 font-bold">
                          {(row.product?.sku ?? "?")[0]}
                        </div>
                        <div>
                          <div className="text-white font-medium text-xs">{row.product?.sku}</div>
                          <div className="text-slate-600 text-xs truncate max-w-[140px]">{row.product?.asin}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{s.unitsSold ?? 0}</td>
                    <td className="px-4 py-3 text-slate-200 font-medium">{fmtShort(s.grossSales ?? 0)}</td>
                    <td className="px-4 py-3 text-red-400">{fmtShort(s.adSpend ?? 0)}</td>
                    <td className={`px-4 py-3 font-medium ${gpColor}`}>{fmtShort(grossProfit)}</td>
                    <td className={`px-4 py-3 font-semibold ${netColor}`}>{fmtShort(s.netProfit ?? 0)}</td>
                    <td className="px-4 py-3 text-slate-300">{margin}%</td>
                    <td className="px-4 py-3 text-slate-300">{acos}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

// ─── PROFIT PAGE ─────────────────────────────────────────────────────────────
const ProfitPage = () => {
  const [period, setPeriod] = useState<Period>("MTD");
  const { data, loading, error } = useProfit(period);
  const periods: Period[] = ["7D", "30D", "MTD", "LAST_MONTH"];

  const feeBreakdown = [
    { name: "FBA Fees", value: 42, color: "#6366f1" },
    { name: "Referral", value: 28, color: "#8b5cf6" },
    { name: "Storage",  value: 12, color: "#a78bfa" },
    { name: "Returns",  value: 8,  color: "#c4b5fd" },
    { name: "Other",    value: 10, color: "#ddd6fe" },
  ];

  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const d = data as any;
  // API returns { products: [{product, summary}], weeklyTrend, feeBreakdown }
  const rawProducts = d?.products ?? [];
  const totals = rawProducts.reduce((acc: any, r: any) => {
    const s = r.summary ?? {};
    return {
      grossSales: (acc.grossSales ?? 0) + (s.grossSales ?? 0),
      adSpend:    (acc.adSpend    ?? 0) + (s.adSpend    ?? 0),
      fees:       (acc.fees       ?? 0) + (s.amazonFees ?? 0),
      cogs:       (acc.cogs       ?? 0) + (s.cogsTotal  ?? 0),
      netProfit:  (acc.netProfit  ?? 0) + (s.netProfit  ?? 0),
    };
  }, {});
  const skus  = rawProducts.map((r: any) => ({ sku: r.product?.sku, ...r.summary, fees: r.summary?.amazonFees, cogs: r.summary?.cogsTotal }));
  const trend = (d?.weeklyTrend ?? []).map((w: any) => ({ date: w.date, netProfit: w.profit, grossSales: w.sales, adSpend: w.adSpend, fees: w.fees }));

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {periods.map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${period === p ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10"}`}>{p}</button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Gross Sales", value: totals.grossSales ?? 0, color: "text-white" },
          { label: "Ad Spend",    value: totals.adSpend    ?? 0, color: "text-red-400" },
          { label: "Amazon Fees", value: totals.fees       ?? 0, color: "text-red-400" },
          { label: "COGS",        value: totals.cogs       ?? 0, color: "text-red-400" },
          { label: "Net Profit",  value: totals.netProfit  ?? 0, color: "text-emerald-400" },
        ].map(item => (
          <div key={item.label} className="bg-[#0f0f1a] border border-white/5 rounded-xl p-4">
            <div className="text-slate-500 text-xs mb-2">{item.label}</div>
            <div className={`text-xl font-bold ${item.color}`}>{fmt(item.value)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-[#0f0f1a] border border-white/5 rounded-xl p-5">
          <div className="text-white font-medium text-sm mb-4">Profit Trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`} />
              <Tooltip contentStyle={{ background: "#0f0f1a", border: "1px solid #ffffff15", borderRadius: "8px", color: "#fff" }} formatter={(v: number) => [`$${v?.toLocaleString()}`, ""]} />
              <Bar dataKey="netProfit" fill="#10b981" radius={[4, 4, 0, 0]} name="Net Profit" />
              <Bar dataKey="adSpend"   fill="#ef4444" radius={[4, 4, 0, 0]} name="Ad Spend" />
              <Bar dataKey="fees"      fill="#6366f1" radius={[4, 4, 0, 0]} name="Fees" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#0f0f1a] border border-white/5 rounded-xl p-5">
          <div className="text-white font-medium text-sm mb-4">Fee Breakdown</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={feeBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {feeBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0f0f1a", border: "1px solid #ffffff15", borderRadius: "8px", color: "#fff" }} formatter={(v: number) => [`${v}%`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {feeBreakdown.map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: item.color }}></div>
                  <span className="text-slate-400">{item.name}</span>
                </div>
                <span className="text-slate-300">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <SectionHeader title="SKU Profit & Loss" subtitle="Detailed breakdown by product" />
        <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                {["SKU", "Gross Sales", "Ad Spend", "Fees", "COGS", "Net Profit", "Margin", "ACoS"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skus.map((row: any, i: number) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-violet-300 font-mono text-xs font-medium">{row.sku}</td>
                  <td className="px-4 py-3 text-slate-200">{fmt(row.grossSales ?? 0)}</td>
                  <td className="px-4 py-3 text-red-400">{fmt(row.adSpend ?? 0)}</td>
                  <td className="px-4 py-3 text-red-400">{fmt(row.fees ?? 0)}</td>
                  <td className="px-4 py-3 text-red-400">{fmt(row.cogs ?? 0)}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{fmt(row.netProfit ?? 0)}</td>
                  <td className="px-4 py-3 text-slate-300">{ ((row.marginPercent ?? 0) * 100).toFixed(1) }%</td>
                  <td className="px-4 py-3 text-slate-300">{ ((row.acos ?? 0) * 100).toFixed(1) }%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── INVENTORY PAGE ───────────────────────────────────────────────────────────
const InventoryPage = () => {
  const { data, loading, error } = useInventory();
  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const d = data as any;
  // API returns { products: [{product, inventory}], summary }
  // Flatten to { sku, ...inventory fields } for easy rendering
  const rawProducts = d?.products ?? [];
  const items = rawProducts.map((r: any) => ({
    sku: r.product?.sku,
    ...r.inventory,
  }));
  const summary = d?.summary ?? {};
  const critical = items.filter((r: any) => (r.daysLeft ?? 0) < 10);

  return (
    <div className="space-y-6">
      {critical.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <div className="text-2xl">🚨</div>
          <div>
            <div className="text-red-400 font-semibold text-sm">Critical: {critical.map((r: any) => r.sku).join(", ")} — Low Stock!</div>
            <div className="text-slate-400 text-xs mt-0.5">Place purchase orders immediately to avoid stockouts.</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Available", value: summary.totalAvailable ?? 0 },
          { label: "Total Inbound",   value: summary.totalInbound   ?? 0 },
          { label: "At-Risk SKUs",    value: summary.atRisk         ?? 0 },
          { label: "Critical SKUs",   value: summary.critical       ?? 0 },
        ].map(item => (
          <div key={item.label} className="bg-[#0f0f1a] border border-white/5 rounded-xl p-4">
            <div className="text-slate-500 text-xs mb-1">{item.label}</div>
            <div className="text-2xl font-bold text-white">{item.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div>
        <SectionHeader title="Inventory Planner" subtitle="Reorder logic by SKU" />
        <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                {["SKU", "Available", "Inbound", "Velocity/Day", "Days Left", "Reorder Date", "Suggested Qty", "Cash Needed", "Status"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row: any, i: number) => {
                const health = row.healthStatus ?? "HEALTHY";
                const sc = statusColors[health] ?? statusColors.HEALTHY;
                const daysLeft = row.daysOfStock ?? row.daysLeft ?? 0;
                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-violet-300 font-mono text-xs font-medium">{row.sku}</td>
                    <td className="px-4 py-3 text-slate-200">{(row.available ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-blue-400">{row.inbound > 0 ? row.inbound.toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-slate-300">{(row.velocity30 ?? 0).toFixed(1)}</td>
                    <td className="px-4 py-3"><span className={`font-bold ${daysLeft <= 10 ? "text-red-400" : daysLeft <= 20 ? "text-amber-400" : "text-emerald-400"}`}>{daysLeft.toFixed(0)}d</span></td>
                    <td className="px-4 py-3 text-slate-200">{row.suggestedReorderDate ? new Date(row.suggestedReorderDate).toLocaleDateString() : "—" ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-200">{(row.suggestedReorderQty ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-amber-400 font-medium">{fmt(row.reorderCashRequired ?? 0)}</td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}></div>
                        {health.replace(/_/g, " ")}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── CASH FLOW PAGE ───────────────────────────────────────────────────────────
const CashFlowPage = () => {
  const { data, loading, error } = useCashFlow();
  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const d = data as any;
  // API returns { forecast: [...months], upcomingEvents: [...], startingCash }
  const months  = d?.forecast        ?? [];
  const events  = d?.upcomingEvents  ?? [];
  const summary = {
    startingCash: d?.startingCash ?? 0,
    cashFloor:    months[0]?.cashFloor ?? 20000,
    totalOutflow: months.reduce((a: number, m: any) => a + (m.totalOutflows ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Current Cash"  value={summary.startingCash ?? 0} sub="Bank balance" />
        <KPICard label="Cash Floor"    value={summary.cashFloor    ?? 0} sub="Minimum threshold" />
        <KPICard label="6-Month End"   value={months[months.length - 1]?.endingCash ?? 0} sub="Projected ending" />
        <KPICard label="Total Outflow" value={summary.totalOutflow ?? 0} sub="Next 6 months" />
      </div>
      <div>
        <SectionHeader title="Monthly Cash Forecast" subtitle="6-month projection" />
        <div className="bg-[#0f0f1a] border border-white/5 rounded-xl p-5">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`} />
              <Tooltip contentStyle={{ background: "#0f0f1a", border: "1px solid #ffffff15", borderRadius: "8px", color: "#fff" }} formatter={(v: number) => [`$${v?.toLocaleString()}`, ""]} />
              <Bar dataKey="totalInflows"  fill="#10b981" radius={[4, 4, 0, 0]} name="Inflows" />
              <Bar dataKey="totalOutflows" fill="#ef4444" radius={[4, 4, 0, 0]} name="Outflows" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-[#0f0f1a] border border-white/5 rounded-xl p-5">
        <div className="text-white font-medium text-sm mb-4">Projected Ending Cash</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={months}>
            <defs>
              <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`} />
            <Tooltip contentStyle={{ background: "#0f0f1a", border: "1px solid #ffffff15", borderRadius: "8px", color: "#fff" }} formatter={(v: number) => [`$${v?.toLocaleString()}`, ""]} />
            <Area type="monotone" dataKey="endingCash" stroke="#6366f1" strokeWidth={2} fill="url(#cashGrad)" name="Ending Cash" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {events.length > 0 && (
        <div>
          <SectionHeader title="Upcoming Cash Events" subtitle="Scheduled inflows & outflows" />
          <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  {["Date", "Type", "Description", "Direction", "Amount"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 10).map((row: any, i: number) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{new Date(row.eventDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-white/5 text-slate-400">{row.type}</span></td>
                    <td className="px-4 py-3 text-slate-200">{row.notes ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium ${row.direction === "INFLOW" ? "text-emerald-400" : "text-red-400"}`}>{row.direction === "INFLOW" ? "↑ Inflow" : "↓ Outflow"}</span></td>
                    <td className={`px-4 py-3 font-semibold ${row.direction === "INFLOW" ? "text-emerald-400" : "text-red-400"}`}>{row.direction === "INFLOW" ? "+" : "-"}{fmt(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PURCHASE ORDERS PAGE ─────────────────────────────────────────────────────
const PurchaseOrdersPage = () => {
  const { data, loading, error } = usePurchaseOrders();
  const [selectedPO, setSelectedPO] = useState<any>(null);
  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const rawPos = (data as any) ?? [];
  // API returns POs with items relation — compute totals from items
  const pos = rawPos.map((po: any) => ({
    ...po,
    totalCost:  (po.depositAmount ?? 0) + (po.balanceAmount ?? 0),
    totalUnits: (po.items ?? []).reduce((a: number, item: any) => a + (item.qtyUnits ?? 0), 0),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total POs"       value={pos.length} prefix="" />
        <KPICard label="Total Committed" value={pos.reduce((a: number, p: any) => a + (p.totalCost ?? 0), 0)} />
        <KPICard label="Units Ordered"   value={pos.reduce((a: number, p: any) => a + (p.totalUnits ?? 0), 0)} prefix="" />
      </div>
      <SectionHeader title="Purchase Orders" subtitle="All orders and status" action="+ New PO" />
      <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              {["PO Number", "Supplier", "Units", "Total Cost", "Deposit", "Balance Due", "ETA", "Status"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pos.map((po: any, i: number) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => setSelectedPO(po)}>
                <td className="px-4 py-3 text-violet-300 font-mono text-xs font-medium">{po.poNumber}</td>
                <td className="px-4 py-3 text-slate-200">{po.supplierName}</td>
                <td className="px-4 py-3 text-slate-200">{(po.totalUnits ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-white font-medium">{fmt(po.totalCost ?? 0)}</td>
                <td className="px-4 py-3 text-emerald-400">{fmt(po.depositAmount ?? 0)}</td>
                <td className="px-4 py-3 text-amber-400">{fmt(po.balanceAmount ?? 0)}</td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{po.etaDate ? new Date(po.etaDate).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${poStatusColors[po.status] ?? "text-slate-400 bg-slate-700/50"}`}>{po.status?.replace(/_/g, " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedPO && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedPO(null)}>
          <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-6 w-[480px] max-w-full mx-4" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-white font-semibold">{selectedPO.poNumber}</div>
                <div className="text-slate-500 text-sm">{selectedPO.supplierName}</div>
              </div>
              <button onClick={() => setSelectedPO(null)} className="text-slate-500 hover:text-slate-300 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              {[["Total Cost", fmt(selectedPO.totalCost ?? 0)], ["Deposit", fmt(selectedPO.depositAmount ?? 0)], ["Balance", fmt(selectedPO.balanceAmount ?? 0)], ["Units", (selectedPO.totalUnits ?? 0).toLocaleString()], ["ETA", selectedPO.etaDate ? new Date(selectedPO.etaDate).toLocaleDateString() : "—"], ["Status", selectedPO.status]].map(([k, v]) => (
                <div key={k} className="bg-white/5 rounded-lg p-3">
                  <div className="text-slate-500 text-xs">{k}</div>
                  <div className="text-white text-sm font-medium mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SHIPMENTS PAGE ───────────────────────────────────────────────────────────
const ShipmentsPage = () => {
  const { data, loading, error } = useShipments();
  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const shipments = (data as any) ?? [];
  const stages = ["BOOKED", "IN_PRODUCTION", "ON_WATER", "CUSTOMS", "DELIVERED", "CHECKED_IN"];

  return (
    <div className="space-y-6">
      <SectionHeader title="Shipments" subtitle="Logistics tracking" action="+ New Shipment" />
      <div className="space-y-4">
        {shipments.map((ship: any, i: number) => (
          <div key={i} className="bg-[#0f0f1a] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium">{ship.shipmentName}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-slate-400">{ship.shippingMode}</span>
                </div>
                <div className="text-slate-500 text-xs mt-1">ETA: {ship.etaDate ? new Date(ship.etaDate).toLocaleDateString() : "—"}</div>
              </div>
              <div className="text-right">
                <div className={`font-semibold text-sm ${stageColors[ship.stage] ?? "text-slate-400"}`}>{ship.stage?.replace(/_/g, " ")}</div>
                <div className="text-slate-500 text-xs">{fmt(ship.freightCostEstimate ?? 0)} freight</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {stages.map((stage, si) => {
                const currentIdx = stages.indexOf(ship.stage);
                const isPast = si < currentIdx;
                const isCurrent = si === currentIdx;
                return (
                  <div key={stage} className="flex-1 flex items-center">
                    <div className={`h-1.5 flex-1 rounded-full ${isPast ? "bg-violet-500" : isCurrent ? "bg-violet-400" : "bg-white/10"}`}></div>
                    {si < stages.length - 1 && <div className={`w-2 h-2 rounded-full border-2 flex-shrink-0 ${isPast || isCurrent ? "border-violet-500 bg-violet-500" : "border-white/10 bg-transparent"}`}></div>}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-slate-600 text-xs mt-1.5">
              {stages.map(s => <span key={s} className="text-center" style={{ flex: 1 }}>{s.replace(/_/g, " ")}</span>)}
            </div>
          </div>
        ))}
        {shipments.length === 0 && <div className="text-slate-500 text-sm text-center py-10">No shipments yet.</div>}
      </div>
    </div>
  );
};

// ─── REIMBURSEMENTS PAGE ──────────────────────────────────────────────────────
const ReimbursementsPage = () => {
  const { data, loading, error } = useReimbursements();
  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const items = (data as any) ?? [];
  const open = items.filter((r: any) => r.status !== "CLOSED");
  const totalEstimated = open.reduce((a: number, r: any) => a + (r.amountEstimated ?? 0), 0);
  const totalRecovered = items.reduce((a: number, r: any) => a + (r.amountRecovered ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Open Claims"     value={open.length}     prefix="" sub={`${fmt(totalEstimated)} estimated`} />
        <KPICard label="Total Recovered" value={totalRecovered}  sub="All time" />
        <KPICard label="Recovery Rate"   value={totalEstimated > 0 ? Math.round(totalRecovered / (totalEstimated + totalRecovered) * 100) : 0} prefix="" sub="% recovered" />
      </div>
      <SectionHeader title="Reimbursement Claims" subtitle="Sorted by priority" action="+ New Claim" />
      <div className="space-y-3">
        {items.map((r: any, i: number) => (
          <div key={i} className="bg-[#0f0f1a] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-white text-sm font-medium">{r.issueType?.replace(/_/g, " ")}</span>
                </div>
                <div className="text-slate-500 text-xs">{r.id} · {new Date(r.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                <div className="text-white font-semibold">{fmt(r.amountEstimated ?? 0)}</div>
                <div className="text-xs text-slate-500">estimated</div>
                {r.amountRecovered > 0 && <div className="text-emerald-400 text-xs font-medium mt-0.5">+{fmt(r.amountRecovered)} recovered</div>}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${r.status === "FOLLOW_UP" ? "bg-amber-500/20 text-amber-400" : r.status === "SUBMITTED" ? "bg-blue-500/20 text-blue-400" : r.status === "OPEN" ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"}`}>{r.status?.replace(/_/g, " ")}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-slate-500 text-sm text-center py-10">No reimbursement claims yet.</div>}
      </div>
    </div>
  );
};

// ─── EXPENSES PAGE ────────────────────────────────────────────────────────────
const ExpensesPage = () => {
  const { data, loading, error } = useExpenses();
  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const d = data as any;
  const expenses     = d?.expenses     ?? [];
  const monthlyTotal = d?.monthlyTotal ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Monthly OpEx"      value={monthlyTotal}      sub="Recurring costs" />
        <KPICard label="Annual Projection" value={monthlyTotal * 12} sub="Estimated annual" />
        <KPICard label="# Expenses"        value={expenses.length}   prefix="" sub="Active line items" />
      </div>
      <SectionHeader title="Recurring Expenses" subtitle="Monthly operational costs" action="+ Add Expense" />
      <div className="bg-[#0f0f1a] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              {["Category", "Vendor", "Amount", "Frequency", "Annual Cost"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp: any, i: number) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 text-xs">{exp.category}</span></td>
                <td className="px-4 py-3 text-slate-200">{exp.vendorName}</td>
                <td className="px-4 py-3 text-white font-medium">{fmt(exp.amount ?? 0)}</td>
                <td className="px-4 py-3 text-slate-400">{exp.frequency}</td>
                <td className="px-4 py-3 text-slate-300">{fmt((exp.amount ?? 0) * (exp.frequency === "MONTHLY" ? 12 : exp.frequency === "QUARTERLY" ? 4 : 1))}</td>
              </tr>
            ))}
            <tr className="bg-white/[0.02]">
              <td colSpan={3} className="px-4 py-3 text-white font-semibold text-xs">MONTHLY TOTAL</td>
              <td className="px-4 py-3 text-amber-300 font-bold">{fmt(monthlyTotal)}</td>
              <td className="px-4 py-3 text-slate-300 font-semibold">{fmt(monthlyTotal * 12)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── PROJECTS PAGE ────────────────────────────────────────────────────────────
const ProjectsPage = () => {
  const { data, loading, error } = useProjects();
  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const projects = (data as any) ?? [];
  const statusStyle: Record<string, string> = {
    QUEUED:      "bg-slate-700/50 text-slate-400",
    IN_PROGRESS: "bg-blue-500/20 text-blue-400",
    REVIEW:      "bg-amber-500/20 text-amber-400",
    BLOCKED:     "bg-red-500/20 text-red-400",
    COMPLETE:    "bg-emerald-500/20 text-emerald-400",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Active Projects" value={projects.filter((p: any) => p.status === "IN_PROGRESS").length} prefix="" />
        <KPICard label="In Review"       value={projects.filter((p: any) => p.status === "REVIEW").length}      prefix="" />
        <KPICard label="Total Projects"  value={projects.length} prefix="" />
      </div>
      <SectionHeader title="Projects" action="+ New Project" />
      <div className="grid grid-cols-2 gap-4">
        {projects.map((proj: any, i: number) => (
          <div key={i} className="bg-[#0f0f1a] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-white font-medium text-sm">{proj.name}</div>
                <div className="text-slate-500 text-xs mt-0.5">Due: {proj.dueDate ? new Date(proj.dueDate).toLocaleDateString() : "—"}</div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[proj.status] ?? "bg-slate-700/50 text-slate-400"}`}>{proj.status?.replace(/_/g, " ")}</span>
            </div>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Progress</span>
                <span className="text-white font-medium">{proj.progressPercent ?? 0}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all" style={{ width: `${proj.progressPercent ?? 0}%` }}></div>
              </div>
            </div>
            <div className="text-slate-500 text-xs">{proj.tasks?.filter((t: any) => t.status === "DONE").length ?? 0}/{proj.tasks?.length ?? 0} tasks complete</div>
          </div>
        ))}
        {projects.length === 0 && <div className="col-span-2 text-slate-500 text-sm text-center py-10">No projects yet.</div>}
      </div>
    </div>
  );
};

// ─── AI INSIGHTS PAGE ─────────────────────────────────────────────────────────
const AIInsightsPage = () => {
  const { data, loading, error } = useAiInsights();
  const [question, setQuestion] = useState("");
  const [answer,   setAnswer]   = useState("");
  const [asking,   setAsking]   = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer("");
    try {
      const res = await askAI(question);
      setAnswer(res.answer);
    } catch (e: any) {
      setAnswer("Error: " + e.message);
    } finally {
      setAsking(false);
    }
  };

  if (loading) return <Spinner />;
  if (error)   return <ErrorBox msg={error} />;

  const rawData = (data as any);
  const insights = Array.isArray(rawData) ? rawData : (rawData?.insights ?? rawData?.data ?? []);
  const open = insights.filter((i: any) => i.status === "OPEN");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Open Insights" value={open.length}                                            prefix="" sub="Require attention" />
        <KPICard label="High Priority" value={open.filter((i: any) => i.severity === "HIGH").length} prefix="" sub="Critical alerts" />
        <KPICard label="Total"         value={insights.length}                                        prefix="" sub="All time" />
      </div>
      <div className="bg-gradient-to-r from-violet-900/30 to-indigo-900/20 border border-violet-500/20 rounded-xl p-4">
        <div className="text-violet-300 text-sm font-medium mb-2">✦ Ask AI about your business</div>
        <div className="flex gap-3">
          <input
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
            placeholder="Which SKU is most likely to stock out first? Why is profit down? Can I afford the next PO?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAsk()}
          />
          <button onClick={handleAsk} disabled={asking} className="px-5 py-2.5 bg-violet-500/30 hover:bg-violet-500/40 text-violet-200 rounded-lg text-sm border border-violet-500/30 transition-colors whitespace-nowrap disabled:opacity-50">
            {asking ? "Thinking..." : "Ask AI"}
          </button>
        </div>
        {answer && <div className="mt-4 p-4 bg-white/5 rounded-lg text-slate-200 text-sm leading-relaxed">{answer}</div>}
        <div className="flex flex-wrap gap-2 mt-3">
          {["Which SKU needs reorder first?", "Why is profit down MTD?", "What are my biggest risks?"].map(q => (
            <button key={q} onClick={() => setQuestion(q)} className="px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 rounded-full text-xs transition-colors">{q}</button>
          ))}
        </div>
      </div>
      <SectionHeader title="AI Insights & Alerts" subtitle="Generated from your live business data" />
      <div className="space-y-4">
        {open.map((insight: any, i: number) => {
          const sc = severityColors[insight.severity] ?? severityColors.LOW;
          return (
            <div key={i} className={`border rounded-xl p-5 ${sc.bg}`}>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{sc.icon}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${sc.badge}`}>{insight.severity}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-slate-400">{insight.scope}</span>
                  </div>
                  <div className="text-white font-semibold text-sm mb-2">{insight.title}</div>
                  <p className="text-slate-300 text-sm leading-relaxed">{insight.body}</p>
                </div>
              </div>
            </div>
          );
        })}
        {open.length === 0 && <div className="text-slate-500 text-sm text-center py-10">No open insights. Your business looks healthy! ✅</div>}
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function CommerceOS() {
  const [activePage,      setActivePage]      = useState("overview");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [syncing,         setSyncing]         = useState(false);
  const [syncResult,      setSyncResult]      = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ daysBack: 30 }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const steps = data.steps ?? {};
      const total = (steps.orders?.synced ?? 0) + (steps.inventory?.synced ?? 0) + (steps.ads?.synced ?? 0);
      const errors = Object.values(steps).filter((s: any) => s.error).length;
      setSyncResult({
        ok:  errors === 0,
        msg: errors === 0
          ? `✓ Synced ${total} records in ${(data.duration / 1000).toFixed(1)}s`
          : `⚠ Synced with ${errors} error(s) — check console`,
      });
    } catch (e: any) {
      setSyncResult({ ok: false, msg: `✗ ${e.message}` });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  const pages: Record<string, React.ReactNode> = {
    overview:       <OverviewPage setActivePage={setActivePage} setSelectedProduct={setSelectedProduct} />,
    profit:         <ProfitPage />,
    inventory:      <InventoryPage />,
    cashflow:       <CashFlowPage />,
    orders:         <PurchaseOrdersPage />,
    shipments:      <ShipmentsPage />,
    reimbursements: <ReimbursementsPage />,
    expenses:       <ExpensesPage />,
    projects:       <ProjectsPage />,
    ai:             <AIInsightsPage />,
  };

  const pageTitles: Record<string, string> = {
    overview: "Overview", profit: "Profit Dashboard", inventory: "Inventory Planner",
    cashflow: "Cash Flow", orders: "Purchase Orders", shipments: "Shipments",
    reimbursements: "Reimbursements", expenses: "Expenses", projects: "Projects", ai: "AI Insights",
  };

  return (
    <div className="flex h-screen bg-[#06060e] text-white font-sans overflow-hidden" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ffffff15; border-radius: 2px; }
      `}</style>
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-white/5 bg-[#08080f]/80 backdrop-blur-sm flex items-center px-6 justify-between flex-shrink-0">
          <h1 className="text-white font-semibold">{pageTitles[activePage]}</h1>
          <div className="flex items-center gap-3">
            {syncResult && (
              <span className={`text-xs px-3 py-1 rounded-lg ${syncResult.ok ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                {syncResult.msg}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
              Live data
            </div>
            <button onClick={handleSync} disabled={syncing} className="px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-violet-300 rounded-lg text-xs border border-violet-500/30 transition-colors">
              {syncing ? "⟳ Syncing..." : "↻ Sync Now"}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {pages[activePage]}
        </div>
      </div>
    </div>
  );
}
