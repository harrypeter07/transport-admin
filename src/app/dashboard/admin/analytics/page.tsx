"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronRight, BarChart3, TrendingUp, DollarSign, Fuel, Users,
  Clock, Navigation, RefreshCw, BarChart2, ArrowUpRight, Zap
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell, Tooltip as ReTooltip
} from "recharts";

const COLORS = ["#059669", "#94a3b8", "#3b82f6", "#8b5cf6", "#f59e0b"];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "ANNUAL">("DAILY");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  async function fetchAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis?period=${period}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        throw new Error("Failed to load analytics data.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  const currency = data?.currencySymbol || "₹";
  const hasRouteData = data?.routeBreakdowns?.length > 0;

  const chartData = hasRouteData
    ? data.routeBreakdowns.map((item: any) => ({
        name: item.cabPlate?.split("-").slice(-1)[0] || item.name,
        "Manual": item.unoptimizedKm || 0,
        "Optimized": item.optimizedKm || 0,
      }))
    : [];

  const pieData = hasRouteData
    ? [
        { name: "Seats Used", value: data.cabUtilization || 0 },
        { name: "Seats Empty", value: 100 - (data.cabUtilization || 0) },
      ]
    : [];

  const kpis = [
    {
      icon: DollarSign,
      label: "Operational Savings",
      value: `${currency}${(data?.costSaved || 0).toLocaleString()}`,
      badge: "Savings",
      badgeCls: "bg-emerald-50 text-emerald-600 border-emerald-100",
    },
    {
      icon: Navigation,
      label: "Distance Conserved",
      value: `${(data?.kmSaved || 0).toLocaleString()} km`,
      badge: period,
      badgeCls: "bg-slate-50 text-slate-600 border-slate-100",
    },
    {
      icon: Fuel,
      label: "Fuel Conserved",
      value: `${(data?.fuelSaved || 0).toLocaleString()} L`,
      badge: "Fuel",
      badgeCls: "bg-blue-50 text-blue-600 border-blue-100",
    },
    {
      icon: Clock,
      label: "Travel Time Saved",
      value: `${data?.timeSavedHours || 0} hrs`,
      badge: "Hours",
      badgeCls: "bg-violet-50 text-violet-600 border-violet-100",
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Analytics</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Executive Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Fleet-wide financial calculations, fuel tracking, and routing effectiveness.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-white shadow-xs">
            {(["DAILY", "WEEKLY", "MONTHLY", "ANNUAL"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-black rounded-lg cursor-pointer transition ${
                  period === p
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-slate-500 transition shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin-fast" : ""}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">{error}</div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-2xl">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin-fast" />
          <p className="mt-4 text-xs font-black text-slate-400 uppercase tracking-widest">Compiling ROI Ledger...</p>
        </div>
      ) : !hasRouteData ? (
        /* EMPTY STATE */
        <div className="flex flex-col items-center justify-center py-24 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <BarChart2 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-1">No Route Data Yet</h3>
          <p className="text-xs text-slate-500 text-center max-w-xs mb-5">
            Generate optimized routes first. Analytics will automatically populate with real savings data.
          </p>
          <Link
            href="/dashboard/admin/transport/optimization"
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
          >
            <Zap className="w-3.5 h-3.5" /> Open Route Optimizer
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl">
                    <kpi.icon className="w-4 h-4 text-slate-600" />
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-wider border px-1.5 py-0.5 rounded ${kpi.badgeCls}`}>
                    {kpi.badge}
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">{kpi.value}</div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* SECONDARY METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cab Reduction</span>
              <div>
                <span className="text-3xl font-extrabold text-emerald-400">+{data?.cabReduction || 0}</span>
                <span className="text-xs text-slate-400 block mt-1">Fewer vehicles needed through geographic employee grouping</span>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cab Capacity Utilization</span>
              <div>
                <span className="text-3xl font-extrabold text-slate-900">{data?.cabUtilization || 0}%</span>
                <span className="text-xs text-slate-500 block mt-1">Average seat booking efficiency across all routes</span>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Driver Allocation Rate</span>
              <div>
                <span className="text-3xl font-extrabold text-slate-900">{data?.driverUtilization || 0}%</span>
                <span className="text-xs text-slate-500 block mt-1">Active drivers deployed vs total registered drivers</span>
              </div>
            </div>
          </div>

          {/* CHARTS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bar Chart — Route Comparison */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Route Distance Comparison (km)
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Manual sequences vs AI-optimized routes per cab
                </p>
              </div>
              <div className="h-[240px] w-full text-[10px] font-bold">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="#94a3b8" />
                    <YAxis tickLine={false} axisLine={false} stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "none", borderRadius: "8px", color: "#fff", fontSize: "10px" }}
                      itemStyle={{ color: "#fff" }}
                    />
                    <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: "10px" }} />
                    <Bar name="Manual (Naive)" dataKey="Manual" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar name="Optimized (AI)" dataKey="Optimized" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut — Seat Utilization */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Seat Utilization</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Seat occupancy across all active routes</p>
              </div>
              <div className="h-[200px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((_: any, idx: number) => (
                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip
                      contentStyle={{ background: "#0f172a", border: "none", borderRadius: "8px", color: "#fff", fontSize: "10px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 justify-center">
                {pieData.map((entry: any, idx: number) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                    {entry.name}: {entry.value}%
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
