"use client";

import { useState, useEffect } from "react";
import { Users, AlertCircle, CalendarRange, CheckSquare, ShieldCheck, Map } from "lucide-react";
import CalendarWidget from "@/components/CalendarWidget";

export default function ManagerDashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // 30s poll
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      const res = await fetch("/api/execution/dashboard");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (e) {
      console.error("Failed to fetch manager metrics:", e);
    } finally {
      setLoading(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1c1b1f]">Manager Portal</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Track your reporting team members' availability and transport status.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-[#e8e8e8] rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-xs font-black text-[#9a9a9a] uppercase tracking-widest mb-2 flex items-center gap-1">
            <Users size={14} /> Team Size
          </span>
          <span className="text-4xl font-extrabold text-[#1c1b1f]">{loading ? "-" : teamSize}</span>
        </div>

        <div className="bg-white border border-[#e8e8e8] rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-xs font-black text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <CalendarRange size={14} /> On Leave Today
          </span>
          <span className="text-4xl font-extrabold text-amber-600">{loading ? "-" : onLeaveToday}</span>
        </div>

        <div className="bg-white border border-[#e8e8e8] rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-xs font-black text-[#ff4f00] uppercase tracking-widest mb-2 flex items-center gap-1">
            <CheckSquare size={14} /> Pending Approvals
          </span>
          <a href="/dashboard/manager/approvals" className="text-4xl font-extrabold text-[#ff4f00] hover:underline">
            {loading ? "-" : pendingApprovals}
          </a>
        </div>
        
        <div className="bg-white border border-[#e8e8e8] rounded-xl p-6 shadow-xs flex flex-col">
          <span className={`text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-1 ${delayedCount > 0 ? 'text-red-500' : 'text-[#9a9a9a]'}`}>
            <AlertCircle size={14} /> Delayed Today
          </span>
          <span className={`text-4xl font-extrabold ${delayedCount > 0 ? 'text-red-650' : 'text-[#1c1b1f]'}`}>
            {loading ? "-" : delayedCount}
          </span>
        </div>
      </div>

      {teamLeavesList.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
          <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
            <CalendarRange size={14} /> Team Members Out on Leave Today
          </h3>
          <div className="flex flex-wrap gap-2">
            {teamLeavesList.map((name: string, i: number) => (
              <span key={i} className="bg-white border border-amber-250 text-amber-850 px-2.5 py-1 rounded-lg text-xs font-semibold">
                👤 {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {metrics?.delayedEmployees?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 shadow-xs">
          <h2 className="text-xs font-black text-red-700 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertCircle size={16} /> Operational Delayed Commuters
          </h2>
          <div className="space-y-3">
            {metrics.delayedEmployees.map((stop: any) => (
              <div key={stop.id} className="bg-white p-4 rounded-xl border border-red-150 flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#1c1b1f] text-sm">{stop.employee.name}</p>
                  <p className="text-xs text-[#6b6b6b] mt-0.5">Cab {stop.route.cab.vehicleNumber} • Driver: {stop.route.cab.driver?.name || "N/A"}</p>
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
        <div className="bg-white border border-[#e8e8e8] rounded-xl p-6 shadow-xs">
          <h2 className="text-xs font-black text-[#4a4a4a] uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <Map size={15} /> Subordinate Commute Progress
          </h2>
          <div className="space-y-4">
            {metrics.activeRoutes.map((route: any) => (
              <div key={route.id} className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-[#1c1b1f] text-sm">Cab {route.cab.vehicleNumber}</p>
                    <p className="text-xs text-[#6b6b6b] mt-0.5">Driver: {route.cab.driver?.name || "N/A"} • 📞 {route.cab.driver?.phone || "N/A"}</p>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-700 tracking-wider">
                    {route.status}
                  </span>
                </div>
                <div className="divide-y divide-slate-150 bg-white border border-[#e8e8e8] rounded-lg overflow-hidden">
                  {route.stops.map((stop: any) => (
                    <div key={stop.id} className="p-3 flex justify-between items-center text-xs">
                      <span className="font-bold text-[#4a4a4a]">{stop.employee.name}</span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        stop.status === 'BOARDED' ? 'bg-emerald-100 text-emerald-700' :
                        stop.status === 'REACHED' ? 'bg-blue-100 text-blue-700' :
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
        <div className="bg-white border border-[#e8e8e8] rounded-xl p-6 shadow-xs flex flex-col justify-between">
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
          <a href="/dashboard/manager/approvals" className="w-full text-center px-4 py-3 bg-[#1c1b1f] text-white rounded-lg text-xs font-bold hover:bg-black transition block">
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
