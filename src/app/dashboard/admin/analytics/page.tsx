"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ChevronRight, BarChart3, TrendingUp, DollarSign, Fuel, Users, ExternalLink, Info, 
  Clock, Navigation, ShieldAlert, CheckCircle, RefreshCw 
} from "lucide-react";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from "recharts";

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
        const json = await res.json();
        setData(json);
      } else {
        throw new Error("Failed to load analytics data.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  // Pre-aggregated mock chart data if database is fresh
  const chartData = data?.routeBreakdowns?.length > 0
    ? data.routeBreakdowns
    : [
        { cabPlate: "MH31-DS1024", naive: 85, optimized: 52 },
        { cabPlate: "MH31-EK5562", naive: 72, optimized: 44 },
        { cabPlate: "MH31-AA7890", naive: 94, optimized: 61 },
        { cabPlate: "MH31-BB1234", naive: 60, optimized: 38 },
      ];

  const chartFormattedData = chartData.map((item: any) => ({
    name: item.cabPlate || item.name,
    "Naive (Manual)": item.unoptimizedKm || item.naive,
    "Optimized (AI)": item.optimizedKm || item.optimized,
  }));

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
          <h1 className="text-2xl font-bold text-slate-900">Executive Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Fleet-wide financial calculations, fuel tracking, and routing effectiveness.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
            {(["DAILY", "WEEKLY", "MONTHLY", "ANNUAL"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer transition ${
                  period === p
                    ? "bg-slate-950 text-white shadow-xs"
                    : "text-slate-655 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-500 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
          {error}
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-2xl">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin"></div>
          <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Compiling ROI Ledger...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <DollarSign className="w-4 h-4 text-slate-600" />
                </div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                  Savings
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                ₹{data?.costSaved?.toLocaleString() || "0"}
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Operational Savings</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <Navigation className="w-4 h-4 text-slate-600" />
                </div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                  {period}
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {data?.kmSaved?.toLocaleString() || "0"} km
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Distance Conserved</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <Fuel className="w-4 h-4 text-slate-600" />
                </div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                  Fuel
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {data?.fuelSaved?.toLocaleString() || "0"} L
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Fuel Conserved</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg">
                  <Clock className="w-4 h-4 text-slate-600" />
                </div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                  Hours
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {data?.timeSavedHours || "0"} hrs
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Travel Time Saved</div>
            </div>
          </div>

          {/* SECONDARY UTILIZATION GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cab Reduction</span>
              <div>
                <span className="text-3xl font-extrabold text-emerald-400">+{data?.cabReduction || 0} Vehicles</span>
                <span className="text-[10px] text-slate-400 block mt-1 leading-relaxed">
                  Reduction in active fleet size requirements through geographic employee grouping.
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cab Capacity Utilization</span>
              <div>
                <span className="text-3xl font-extrabold text-slate-900">{data?.cabUtilization || 0}%</span>
                <span className="text-[10px] text-slate-500 block mt-1 leading-relaxed">
                  Average seat booking efficiency across all optimized routes today.
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Driver Allocation Rate</span>
              <div>
                <span className="text-3xl font-extrabold text-slate-900">{data?.driverUtilization || 0}%</span>
                <span className="text-[10px] text-slate-500 block mt-1 leading-relaxed">
                  Active drivers deployed on shifts relative to total registered available driver count.
                </span>
              </div>
            </div>
          </div>

          {/* COMPARISON CHART */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-850 uppercase tracking-wider">Geographic Route Comparison (km)</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Side-by-side total distances (km) of manual sequences (Naive Alphabetical) vs AI clusters.
              </p>
            </div>
            
            <div className="h-[280px] w-full text-[10px] font-bold">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartFormattedData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="#94a3b8" />
                  <YAxis tickLine={false} axisLine={false} stroke="#94a3b8" tickFormatter={(v) => `${v}k`} />
                  <Tooltip 
                    contentStyle={{ background: "#0f172a", border: "none", borderRadius: "8px", color: "#fff" }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "10px" }} />
                  <Bar name="Manual sequences (Naive)" dataKey="Naive (Manual)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar name="Optimized routes (AI)" dataKey="Optimized (AI)" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
