"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
 Users, AlertTriangle, CheckCircle, Navigation, ShieldCheck,
 CalendarRange, Clock, Sparkles, Map, DollarSign, Fuel, Car,
 TrendingUp, ArrowRight, Zap, Bell, RefreshCw
} from "lucide-react";
import Link from "next/link";
import { getSessionCache, setSessionCache, invalidateSessionCache } from "@/lib/sessionCache";
import LoadingProgress, { type ProgressStage } from "@/components/LoadingProgress";
import { formatDateLong } from "@/lib/dateFormat";

const CACHE_KEY_DASHBOARD = "admin_dashboard_metrics";
const CACHE_KEY_SETTINGS = "admin_dashboard_settings";

const stages: ProgressStage[] = [
  { key: "fetch", label: "Fetching metrics", weight: 70 },
  { key: "settings", label: "Loading configuration", weight: 30 },
];

const RETRY_DELAYS = [1000, 2000, 4000];

function useCounter(target: number, duration = 800) {
 const [value, setValue] = useState(0);
 const rafRef = useRef<number | null>(null);

 useEffect(() => {
 if (target === 0) { setValue(0); return; }
 const start = performance.now();
 const step = (now: number) => {
 const progress = Math.min((now - start) / duration, 1);
 const eased = 1 - Math.pow(1 - progress, 3);
 setValue(Math.floor(eased * target));
 if (progress < 1) rafRef.current = requestAnimationFrame(step);
 };
 rafRef.current = requestAnimationFrame(step);
 return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
 }, [target, duration]);

 return value;
}

function AnimatedNumber({ value, loading }: { value: number; loading: boolean }) {
 const counter = useCounter(loading ? 0 : value);
 return <>{loading ? "—" : counter.toLocaleString()}</>;
}

function StatCard({
 label, value, icon: Icon, color = "slate", loading,
}: {
 label: string; value: number; icon: any; color?: string; loading: boolean;
}) {
 const colorMap: Record<string, string> = {
 blue: "text-[#ff4f00] bg-[#f7f7f7] border-[#e8e8e8]",
 emerald: "text-[#1c1b1f] bg-[#f7f7f7] border-[#e8e8e8]",
 amber: "text-[#1c1b1f] bg-[#f7f7f7] border-[#e8e8e8]",
 red: "text-[#1c1b1f] bg-[#f7f7f7] border-[#e8e8e8]",
 indigo: "text-[#ff4f00] bg-[#f7f7f7] border-[#e8e8e8]",
 slate: "text-[#6b6b6b] bg-[#f7f7f7] border-slate-100",
 };
 const cls = colorMap[color] || colorMap.slate;

 return (
 <div className="bg-white border border-[#e8e8e8] rounded-none p-5 shadow-xs flex flex-col justify-between hover:shadow-none transition-shadow">
 <div className="flex items-center justify-between mb-3">
 <span className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest leading-tight">{label}</span>
 <div className={`p-2 rounded-none border ${cls}`}>
 <Icon className="w-3.5 h-3.5" />
 </div>
 </div>
 <span className={`text-3xl font-black tracking-tight ${color !== "slate" ? cls.split(" ")[0] : "text-[#1c1b1f]"}`}>
 <AnimatedNumber value={value} loading={loading} />
 </span>
 </div>
 );
}

function SavingsCard({
 label, value, suffix, note, loading, currency,
}: {
 label: string; value: string | number; suffix?: string; note: string; loading: boolean; currency: string;
}) {
 return (
 <div className="bg-white to-white border border-[#e8e8e8] rounded-none p-5 flex flex-col justify-between shadow-xs">
 <span className="text-[10px] font-black text-[#1c1b1f] uppercase tracking-widest block mb-2 flex items-center gap-1">
 <Sparkles size={10} /> {label}
 </span>
 <div>
 <span className="text-2xl font-black text-[#1c1b1f]">
 {loading ? "—" : `${value}${suffix || ""}`}
 </span>
 <span className="text-[9px] text-[#6b6b6b] block font-bold font-mono mt-0.5">{note}</span>
 </div>
 </div>
 );
}

async function fetchWithRetry(url: string, retries = RETRY_DELAYS): Promise<Response | null> {
  for (let i = 0; i <= retries.length; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // network error — retry
    }
    if (i < retries.length) {
      await new Promise(r => setTimeout(r, retries[i]));
    }
  }
  return null;
}

export default function AdminDashboardPage() {
 const [metrics, setMetrics] = useState<any>(null);
 const [settings, setSettings] = useState<any>(null);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
 const [currentStage, setCurrentStage] = useState("");

 const applyData = useCallback((metricsData: any, settingsData: any) => {
   setMetrics(metricsData);
   setSettings(settingsData);
   setSessionCache(CACHE_KEY_DASHBOARD, metricsData);
   setSessionCache(CACHE_KEY_SETTINGS, settingsData);
 }, []);

 const fetchAll = useCallback(async (isRefresh = false) => {
   if (isRefresh) {
     setRefreshing(true);
   } else {
     setLoading(true);
   }
   setCompletedStages(new Set());

   const cachedMetrics = getSessionCache<any>(CACHE_KEY_DASHBOARD);
   const cachedSettings = getSessionCache<any>(CACHE_KEY_SETTINGS);
   if (cachedMetrics && cachedSettings && !isRefresh) {
     setMetrics(cachedMetrics);
     setSettings(cachedSettings);
     setLoading(false);
     return;
   }

   setCurrentStage("Fetching metrics");

   const metricsRes = await fetchWithRetry("/api/execution/dashboard");
   setCompletedStages(prev => new Set(prev).add("fetch"));

   if (metricsRes) {
     const metricsData = await metricsRes.json();
     setCurrentStage("Loading configuration");
     const settingsRes = await fetchWithRetry("/api/settings");
     setCompletedStages(prev => new Set(prev).add("settings"));

     const settingsData = settingsRes ? await settingsRes.json() : null;
     applyData(metricsData, settingsData);
   }

   setLoading(false);
   setRefreshing(false);
   setCurrentStage("");
 }, [applyData]);

 useEffect(() => {
   fetchAll();
 }, [fetchAll]);

 function handleRefresh() {
   invalidateSessionCache(CACHE_KEY_DASHBOARD);
   invalidateSessionCache(CACHE_KEY_SETTINGS);
   fetchAll(true);
 }

 if (loading && !getSessionCache(CACHE_KEY_DASHBOARD)) {
   return <LoadingProgress stages={stages} completed={completedStages} currentLabel={currentStage} />;
 }

 const m = metrics?.metrics || {};
 const currency = settings?.currencySymbol || "₹";
 const fuelPrice = settings?.fuelPricePerLitre || 100;
 const mileage = settings?.avgFuelMileageKmL || 10;
 const depotName = settings?.depotName || "Depot";

 const fuelSaved = m.savings ? Math.max(0, m.savings) / mileage : 0;
 const costSaved = fuelSaved * fuelPrice;

  const today = formatDateLong(new Date().toISOString().split("T")[0]);

 const issueCount = (m.delayedRoutesCount || 0) + (m.totalPendingRequestsCount || 0);
 const systemStatus = issueCount > 0
 ? { label: `${issueCount} Issue${issueCount > 1 ? "s" : ""} Detected`, cls: "bg-[#f7f7f7] text-[#1c1b1f] border-[#e8e8e8]" }
 : { label: "All Systems Operational", cls: "bg-[#f7f7f7] text-[#1c1b1f] border-[#e8e8e8]" };

 return (
 <div className="space-y-8 max-w-7xl mx-auto">

  {/* HERO HEADER */}
  <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
  <div>
  <div className="flex items-center gap-2 mb-1">
   <h1 className="text-xl font-extrabold text-[#1c1b1f] tracking-tight">Admin Operations</h1>
   <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-none border ${systemStatus.cls}`}>
   {systemStatus.label}
   </span>
  </div>
  <p className="text-xs text-[#6b6b6b]">{today} · {depotName}</p>
  </div>
  <div className="flex flex-wrap gap-2">
  <button
   onClick={handleRefresh}
   disabled={refreshing}
   className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e8e8] hover:bg-[#f7f7f7] text-[#4a4a4a] text-xs font-bold rounded-none transition disabled:opacity-50"
  >
   <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
   {refreshing ? "Refreshing..." : "Refresh"}
  </button>
  <Link
   href="/dashboard/admin/transport/optimization"
   className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1c1b1f] hover:bg-black text-white text-xs font-bold rounded-none transition shadow-none"
  >
   <Zap className="w-3.5 h-3.5" /> Generate Routes
  </Link>
  <Link
   href="/dashboard/admin/operations/leaves"
   className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e8e8] hover:bg-[#f7f7f7] text-[#4a4a4a] text-xs font-bold rounded-none transition"
  >
   <Bell className="w-3.5 h-3.5" /> Manage Leaves
   {m.totalPendingRequestsCount > 0 && (
   <span className="bg-[#1c1b1f] text-white text-[9px] font-black px-1.5 py-0.5 rounded-none">
    {m.totalPendingRequestsCount}
   </span>
   )}
  </Link>
  <Link
   href="/dashboard/admin/analytics"
   className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e8e8] hover:bg-[#f7f7f7] text-[#4a4a4a] text-xs font-bold rounded-none transition"
  >
   <TrendingUp className="w-3.5 h-3.5" /> Analytics
  </Link>
  </div>
  </div>

  {/* FLEET OPERATIONS */}
  <div className="space-y-3">
  <h2 className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-2">
   Fleet Operations
  </h2>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
   <StatCard label="Active Routes" value={m.activeCount || 0} icon={Navigation} color="blue" loading={loading} />
   <StatCard label="Completed Routes" value={m.completedCount || 0} icon={CheckCircle} color="emerald" loading={loading} />
   <StatCard label="In Transit" value={m.totalEmployeesTravelling || 0} icon={Users} color="indigo" loading={loading} />
   <StatCard label="Active Fleet (Cabs)" value={m.totalCabsActive || 0} icon={Car} color="slate" loading={loading} />
  </div>
  </div>

  {/* WORKFORCE & APPROVALS */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 space-y-3">
   <h2 className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-2">
   Workforce Availability
   </h2>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
   <StatCard label="Registered Employees" value={m.totalEmployeesCount || 0} icon={Users} loading={loading} />
   <StatCard label="Department Managers" value={m.totalManagersCount || 0} icon={ShieldCheck} loading={loading} />
   <StatCard label="On Leave Today" value={m.totalLeavesTodayCount || 0} icon={CalendarRange} color="amber" loading={loading} />
   <StatCard label="Absent Today" value={m.totalAbsencesCount || 0} icon={Clock} loading={loading} />
   </div>
  </div>

  <div className="space-y-3">
   <h2 className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-2">
   Approvals Workflow
   </h2>
   <div className="bg-white border border-[#e8e8e8] rounded-none p-4 flex items-center justify-between shadow-xs">
   <div>
    <span className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest block">Pending Requests</span>
    <span className={`text-3xl font-black mt-0.5 block ${m.totalPendingRequestsCount > 0 ? "text-[#1c1b1f]" : "text-[#1c1b1f]"}`}>
    <AnimatedNumber value={m.totalPendingRequestsCount || 0} loading={loading} />
    </span>
   </div>
   <Link
    href="/dashboard/admin/operations/leaves"
    className="text-xs font-bold bg-[#1c1b1f] text-white hover:bg-black px-3.5 py-1.5 rounded-none transition"
   >
    Review
   </Link>
   </div>
   <div className="bg-white border border-[#e8e8e8] rounded-none p-4 flex items-center justify-between shadow-xs">
   <div>
    <span className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest block">Holidays</span>
   </div>
   <Link
    href="/dashboard/admin/operations/calendar"
    className="text-xs font-bold bg-[#1c1b1f] text-white hover:bg-black px-3.5 py-1.5 rounded-none transition"
   >
    Manage
   </Link>
   </div>
  </div>
  </div>

  {/* DELAY WARNINGS */}
  <div className="space-y-3">
  <h2 className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-2">
   Transport Commute Delays
  </h2>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
   <StatCard label="Delayed Routes" value={m.delayedRoutesCount || 0} icon={AlertTriangle} color={m.delayedRoutesCount > 0 ? "red" : "slate"} loading={loading} />
   <StatCard label="Delayed Drivers" value={m.delayedDriversCount || 0} icon={Clock} color={m.delayedDriversCount > 0 ? "red" : "slate"} loading={loading} />
   <StatCard label="Delayed Employees" value={m.delayedEmployeesCount || 0} icon={Users} color={m.delayedEmployeesCount > 0 ? "red" : "slate"} loading={loading} />
  </div>
  </div>

  {/* ROI SAVINGS */}
  <div className="space-y-3">
  <h2 className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-2">
   Route Optimization Efficiency & ROI
  </h2>
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
   <SavingsCard label="Distance Conserved" value={`+${m.savings || 0}`} suffix=" km" note="Optimized vs Naive Routes" loading={loading} currency={currency} />
   <SavingsCard label="Fuel Conserved" value={`+${fuelSaved.toFixed(0)}`} suffix=" L" note={`At ${mileage} km/L average`} loading={loading} currency={currency} />
   <SavingsCard label="Cost Savings" value={`${currency}${costSaved.toLocaleString()}`} note={`Fuel at ${currency}${fuelPrice}/L`} loading={loading} currency={currency} />
   <div className="bg-white border border-[#e8e8e8] rounded-none p-5 flex flex-col justify-between shadow-xs">
   <span className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest mb-2">Optimization Tools</span>
   <div className="space-y-1.5">
    <Link href="/dashboard/admin/transport/optimization" className="text-xs font-bold text-[#ff4f00] hover:underline flex items-center gap-1">
    Open Optimizer <ArrowRight className="w-3 h-3" />
    </Link>
    <Link href="/dashboard/admin/analytics" className="text-xs font-bold text-[#ff4f00] hover:underline flex items-center gap-1">
    View ROI Analytics <ArrowRight className="w-3 h-3" />
    </Link>
   </div>
   </div>
  </div>
  </div>

  {/* ACTIVE DISPATCH LIST */}
  {metrics?.activeRoutes?.length > 0 ? (
  <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
   <div className="p-5 border-b border-slate-100 bg-[#f7f7f7] flex items-center justify-between">
   <h2 className="text-[10px] font-black text-[#4a4a4a] uppercase tracking-widest">
    Live Dispatch — In Progress
   </h2>
   <span className="text-[10px] font-black text-[#ff4f00] bg-[#f7f7f7] border border-[#e8e8e8] px-2 py-0.5 rounded-none">
    {metrics.activeRoutes.length} Active
   </span>
   </div>
   <ul className="divide-y divide-slate-100">
   {metrics.activeRoutes.map((route: any) => {
   const completed = route.stops.filter((s: any) => s.status === "BOARDED" || s.status === "SKIPPED").length;
   const total = route.stops.length;
   const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
   return (
    <li key={route.id} className="p-5 hover:bg-[#f7f7f7] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div>
     <p className="font-bold text-[#1c1b1f] text-sm flex items-center gap-2">
     {route.cab?.vehicleNumber || "No Vehicle"}
     <span className="text-[#9a9a9a] font-normal text-xs">·</span>
     <span className="text-[#6b6b6b] font-semibold text-xs">{route.cab?.driverName || "N/A"}</span>
     </p>
     <div className="mt-1.5 flex items-center gap-3">
     <div className="flex-1 bg-[#f7f7f7] rounded-none h-1.5 w-32">
      <div className="bg-[#1c1b1f] h-1.5 rounded-none transition-all" style={{ width: `${pct}%` }} />
     </div>
     <span className="text-[10px] text-[#6b6b6b] font-bold">{completed}/{total} stops</span>
     </div>
    </div>
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-none text-[10px] font-black tracking-widest uppercase bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8]">
     In Progress
    </span>
    </li>
   );
   })}
   </ul>
  </div>
  ) : (
  <div className="bg-white border border-[#e8e8e8] rounded-none p-8 shadow-xs flex items-center justify-center">
   <div className="text-center">
   <Car className="w-8 h-8 text-[#b0b0b0] mx-auto mb-2" />
   <span className="text-[#9a9a9a] block mb-1 font-bold uppercase tracking-widest text-[10px]">No Dispatch Routes Active</span>
   <p className="text-xs text-[#6b6b6b]">No optimized transport routes are currently running.</p>
   </div>
  </div>
  )}
 </div>
 );
}
