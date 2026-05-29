"use client";

import { useState, useEffect } from "react";
import { Users, AlertTriangle, CheckCircle, Navigation } from "lucide-react";

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time transportation operations overview.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-xs font-black text-blue-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Navigation size={14} /> Active Routes
          </span>
          <span className="text-4xl font-extrabold text-blue-600">{loading ? "-" : metrics?.metrics?.activeCount || 0}</span>
        </div>
        
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-xs font-black text-red-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <AlertTriangle size={14} /> Delayed Passengers
          </span>
          <span className="text-4xl font-extrabold text-red-600">{loading ? "-" : metrics?.metrics?.delayedEmployeesCount || 0}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <CheckCircle size={14} /> Completed Today
          </span>
          <span className="text-4xl font-extrabold text-emerald-600">{loading ? "-" : metrics?.metrics?.completedCount || 0}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Users size={14} /> Total Users
          </span>
          <span className="text-4xl font-extrabold text-slate-900">57</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col items-center text-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unoptimized Dist.</span>
          <span className="text-2xl font-extrabold text-slate-500">{loading ? "-" : metrics?.metrics?.totalUnoptimizedDistance || 0} km</span>
        </div>
        
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col items-center text-center border-b-4 border-b-indigo-500">
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Optimized Dist.</span>
          <span className="text-3xl font-extrabold text-indigo-600">{loading ? "-" : metrics?.metrics?.totalOptimizedDistance || 0} km</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col items-center text-center bg-emerald-50">
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Total Savings</span>
          <span className="text-3xl font-extrabold text-emerald-600">
            {loading ? "-" : (metrics?.metrics?.savings > 0 ? "+" : "") + (metrics?.metrics?.savings || 0)} km
          </span>
        </div>
      </div>

      {metrics?.activeRoutes?.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">
              Live Routes In Progress
            </h2>
          </div>
          <div className="p-0">
            <ul className="divide-y divide-slate-100">
              {metrics.activeRoutes.map((route: any) => (
                <li key={route.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      Cab {route.cab.vehicleNumber} 
                      <span className="text-slate-400 font-normal">•</span>
                      <span className="text-slate-600 font-medium">Driver: {route.cab.driver?.name}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {route.stops.filter((s:any) => s.status === 'BOARDED' || s.status === 'SKIPPED').length} / {route.stops.length} Stops Completed
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-blue-100 text-blue-700">
                      In Progress
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs h-64 flex items-center justify-center">
          <div className="text-center">
            <span className="text-slate-400 block mb-2 font-bold uppercase tracking-widest text-xs">No Active Operations</span>
            <p className="text-sm text-slate-500">There are no routes currently in progress.</p>
          </div>
        </div>
      )}
    </div>
  );
}
