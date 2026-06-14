"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, AlertCircle, CalendarRange, CheckSquare, ShieldCheck, Map, RefreshCw } from "lucide-react";
import CalendarWidget from "@/components/CalendarWidget";
import { getSessionCache, setSessionCache, invalidateSessionCache } from "@/lib/sessionCache";
import LoadingProgress, { type ProgressStage } from "@/components/LoadingProgress";

const CACHE_KEY = "manager_dashboard_metrics";

const stages: ProgressStage[] = [
  { key: "fetch", label: "Loading dashboard", weight: 100 },
];

const RETRY_DELAYS = [1000, 2000, 4000];

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

export default function ManagerDashboardPage() {
 const [metrics, setMetrics] = useState<any>(null);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
 const [currentStage, setCurrentStage] = useState("");

 const fetchMetrics = useCallback(async (isRefresh = false) => {
   if (isRefresh) {
     setRefreshing(true);
   } else {
     setLoading(true);
   }
   setCompletedStages(new Set());

   const cached = getSessionCache<any>(CACHE_KEY);
   if (cached && !isRefresh) {
     setMetrics(cached);
     setLoading(false);
     return;
   }

   setCurrentStage("Loading dashboard");

   const res = await fetchWithRetry("/api/execution/dashboard");
   setCompletedStages(prev => new Set(prev).add("fetch"));

   if (res) {
     const data = await res.json();
     setMetrics(data);
     setSessionCache(CACHE_KEY, data);
   }

   setLoading(false);
   setRefreshing(false);
   setCurrentStage("");
 }, []);

 useEffect(() => {
   fetchMetrics();
 }, [fetchMetrics]);

 function handleRefresh() {
   invalidateSessionCache(CACHE_KEY);
   fetchMetrics(true);
 }

 if (loading && !getSessionCache(CACHE_KEY)) {
   return <LoadingProgress stages={stages} completed={completedStages} currentLabel={currentStage} />;
 }

 const teamSize = metrics?.metrics?.teamSize || 0;
 const onLeaveToday = metrics?.metrics?.employeesOnLeaveToday || 0;
 const pendingApprovals = metrics?.metrics?.pendingApprovalsCount || 0;
 const delayedCount = metrics?.metrics?.delayedEmployeesCount || 0;
 const teamLeavesList = metrics?.metrics?.teamLeavesList || [];

 const inTransitCount = metrics?.activeRoutes?.reduce((acc: number, r: any) =>
  acc + r.stops.filter((s: any) => s.status === "PENDING" || s.status === "REACHED").length, 0
 ) || 0;

 return (
 <div className="space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
  <div>
   <h1 className="text-2xl font-bold text-[#1c1b1f]">Manager Portal</h1>
   <p className="text-sm text-[#6b6b6b] mt-1">
   Track your reporting team members' availability and transport status.
   </p>
  </div>
  <button
   onClick={handleRefresh}
   disabled={refreshing}
   className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e8e8] hover:bg-[#f7f7f7] text-[#4a4a4a] text-xs font-bold rounded-none transition disabled:opacity-50 self-start"
  >
   <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
   {refreshing ? "Refreshing..." : "Refresh"}
  </button>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
  <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs flex flex-col">
   <span className="text-xs font-black text-[#9a9a9a] uppercase tracking-widest mb-2 flex items-center gap-1">
   <Users size={14} /> Team Size
   </span>
   <span className="text-4xl font-extrabold text-[#1c1b1f]">{loading ? "-" : teamSize}</span>
  </div>

  <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs flex flex-col">
   <span className="text-xs font-black text-[#6b6b6b] uppercase tracking-widest mb-2 flex items-center gap-1">
   <CalendarRange size={14} /> On Leave Today
   </span>
   <span className="text-4xl font-extrabold text-[#1c1b1f]">{loading ? "-" : onLeaveToday}</span>
  </div>

  <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs flex flex-col">
   <span className="text-xs font-black text-[#ff4f00] uppercase tracking-widest mb-2 flex items-center gap-1">
   <CheckSquare size={14} /> Pending Approvals
   </span>
   <a href="/dashboard/manager/approvals" className="text-4xl font-extrabold text-[#ff4f00] hover:underline">
   {loading ? "-" : pendingApprovals}
   </a>
  </div>
  
  <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs flex flex-col">
   <span className={`text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-1 ${delayedCount > 0 ? 'text-[#6b6b6b]' : 'text-[#9a9a9a]'}`}>
   <AlertCircle size={14} /> Delayed Today
   </span>
   <span className={`text-4xl font-extrabold ${delayedCount > 0 ? 'text-red-650' : 'text-[#1c1b1f]'}`}>
   {loading ? "-" : delayedCount}
   </span>
  </div>
  </div>

  {teamLeavesList.length > 0 && (
  <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-none p-4 flex flex-col gap-2">
   <h3 className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider flex items-center gap-1">
   <CalendarRange size={14} /> Team Members Out on Leave Today
   </h3>
   <div className="flex flex-wrap gap-2">
   {teamLeavesList.map((name: string, i: number) => (
    <span key={i} className="bg-white border border-amber-250 text-amber-850 px-2.5 py-1 rounded-none text-xs font-semibold">
    👤 {name}
    </span>
   ))}
   </div>
  </div>
  )}

  {metrics?.delayedEmployees?.length > 0 && (
  <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-none p-6 shadow-xs">
   <h2 className="text-xs font-black text-[#1c1b1f] uppercase tracking-widest mb-4 flex items-center gap-2">
   <AlertCircle size={16} /> Operational Delayed Commuters
   </h2>
   <div className="space-y-3">
   {metrics.delayedEmployees.map((stop: any) => (
    <div key={stop.id} className="bg-white p-4 rounded-none border border-red-150 flex items-center justify-between">
    <div>
     <p className="font-bold text-[#1c1b1f] text-sm">{stop.employee?.name}</p>
     <p className="text-xs text-[#6b6b6b] mt-0.5">Cab {stop.route?.cab?.vehicleNumber} • Driver: {stop.route?.cab?.driverName || "N/A"}</p>
    </div>
    <div className="text-right">
     <span className="text-red-650 font-bold text-xs uppercase tracking-wide">
     {stop.employeeDelayMins > 0 ? `Employee Late: ${stop.employeeDelayMins}m` : `Driver Late: ${stop.driverDelayMins}m`}
     </span>
    </div>
    </div>
   ))}
   </div>
  </div>
  )}

  {metrics?.activeRoutes?.length > 0 && (
  <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs">
   <h2 className="text-xs font-black text-[#4a4a4a] uppercase tracking-widest mb-4 flex items-center gap-1.5">
   <Map size={15} /> Subordinate Commute Progress
   </h2>
   <div className="space-y-4">
   {metrics.activeRoutes.map((route: any) => (
    <div key={route.id} className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-none p-4">
    <div className="flex justify-between items-start mb-3">
     <div>
     <p className="font-bold text-[#1c1b1f] text-sm">Cab {route.cab?.vehicleNumber}</p>
     <p className="text-xs text-[#6b6b6b] mt-0.5">Driver: {route.cab?.driverName || "N/A"} • 📞 {route.cab?.driverPhone || "N/A"}</p>
     </div>
     <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#f7f7f7] text-[#1c1b1f] tracking-wider">
     {route.status}
     </span>
    </div>
    <div className="divide-y divide-slate-150 bg-white border border-[#e8e8e8] rounded-none overflow-hidden">
     {route.stops.map((stop: any) => (
     <div key={stop.id} className="p-3 flex justify-between items-center text-xs">
      <span className="font-bold text-[#4a4a4a]">{stop.employee?.name}</span>
      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
      stop.status === 'BOARDED' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
      stop.status === 'REACHED' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
      'bg-[#f7f7f7] text-slate-650'
      }`}>
      {stop.status}
      </span>
     </div>
     ))}
    </div>
    </div>
   ))}
   </div>
  </div>
  )}

  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs flex flex-col justify-between">
   <div>
   <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
    <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest">
    Team Actions
    </h2>
   </div>
   <p className="text-xs text-[#6b6b6b] leading-relaxed mb-4">
    Review and approve leave applications or pickup/drop shift timing modifications requested by your subordinate team members.
   </p>
   </div>
   <a href="/dashboard/manager/approvals" className="w-full text-center px-4 py-3 bg-[#1c1b1f] text-white rounded-none text-xs font-bold hover:bg-black transition block">
   Open Approvals Desk ({pendingApprovals})
   </a>
  </div>

  <div>
   <CalendarWidget />
  </div>
  </div>
 </div>
 );
}
