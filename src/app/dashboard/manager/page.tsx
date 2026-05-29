"use client";

import { useState, useEffect } from "react";
import { Users, AlertCircle } from "lucide-react";
import CalendarWidget from "@/components/CalendarWidget";

export default function ManagerDashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [trackingData, setTrackingData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // 30s poll
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    const res = await fetch("/api/execution/dashboard");
    if (res.ok) {
      const data = await res.json();
      setMetrics(data);
    }
    setLoading(false);
  }

  const delayedCount = metrics?.delayedEmployeesCount || 0;
  const inTransitCount = metrics?.activeRoutes?.reduce((acc: number, r: any) => 
    acc + r.stops.filter((s: any) => s.status === "PENDING" || s.status === "REACHED").length, 0
  ) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manager Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of your team's transportation and availability.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Team In Transit</span>
          <span className="text-4xl font-extrabold text-slate-900">{loading ? "-" : inTransitCount}</span>
        </div>
        
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
          <span className={`text-sm font-black uppercase tracking-widest mb-2 ${delayedCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>
            Delayed Employees
          </span>
          <span className={`text-4xl font-extrabold ${delayedCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {loading ? "-" : delayedCount}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-sm font-black text-emerald-500 uppercase tracking-widest mb-2">Team Availability</span>
          <span className="text-4xl font-extrabold text-emerald-600">100%</span>
        </div>
      </div>

      {metrics?.delayedEmployees?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 shadow-xs">
          <h2 className="text-sm font-black text-red-700 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertCircle size={16} /> Operational Delays
          </h2>
          <div className="space-y-3">
            {metrics.delayedEmployees.map((stop: any) => (
              <div key={stop.id} className="bg-white p-4 rounded-lg border border-red-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">{stop.employee.name}</p>
                  <p className="text-xs text-slate-500">Cab {stop.route.cab.vehicleNumber} • Driver: {stop.route.cab.driver?.name}</p>
                </div>
                <div className="text-right">
                  <span className="text-red-600 font-bold text-sm">
                    {stop.employeeDelayMins > 0 ? `Employee Late by ${stop.employeeDelayMins}m` : `Driver Late by ${stop.driverDelayMins}m`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics?.activeRoutes?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">
            Team Live Tracking
          </h2>
          <div className="space-y-4">
            {metrics.activeRoutes.map((route: any) => {
              const tData = trackingData[route.id];
              return (
                <div key={route.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-slate-900">Cab {route.cab.vehicleNumber}</p>
                      <p className="text-xs text-slate-500">Driver: {route.cab.driver?.name}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 bg-white border border-slate-100 rounded">
                    {route.stops.map((stop: any) => (
                      <div key={stop.id} className="p-3 flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">{stop.employee.name}</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                          stop.status === 'BOARDED' ? 'bg-emerald-100 text-emerald-700' :
                          stop.status === 'REACHED' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {stop.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">
              Upcoming Leaves & Requests
            </h2>
            <a href="/dashboard/manager/approvals" className="text-xs font-bold text-blue-600 hover:text-blue-700">Go to Approvals &rarr;</a>
          </div>
          <div className="flex flex-col items-center justify-center py-6 bg-slate-50 rounded-lg border border-slate-100 border-dashed">
            <span className="text-slate-400 mb-2">Check Approvals Desk</span>
            <p className="text-sm text-slate-500">Visit the approvals tab to review pending leave or timing changes.</p>
          </div>
        </div>

        <div>
          <CalendarWidget />
        </div>
      </div>
    </div>
  );
}
