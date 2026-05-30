"use client";

import { useState, useEffect } from "react";
import { Users, AlertTriangle, CheckCircle, Navigation, ShieldCheck, CalendarRange, Clock, Sparkles, Map, DollarSign, Fuel, Car } from "lucide-react";
import Link from "next/link";

export default function AdminDashboardPage() {
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
      console.error("Failed to fetch admin dashboard metrics:", e);
    } finally {
      setLoading(false);
    }
  }

  const m = metrics?.metrics || {};

  // Calculations
  const fuelSaved = m.savings ? Math.max(0, m.savings) / 10 : 0; // assumes 10km/L
  const costSaved = fuelSaved * 100; // ₹100 per liter

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Operations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time oversight of transportation logistics, fleet compliance, and workforce availability.
        </p>
      </div>

      {/* OPERATIONS SECTION */}
      <div className="space-y-4">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
          Fleet Operations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Navigation size={12} className="text-blue-500" /> Active Routes
            </span>
            <span className="text-3xl font-extrabold text-blue-600">{loading ? "-" : m.activeCount || 0}</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <CheckCircle size={12} className="text-emerald-500" /> Completed Routes
            </span>
            <span className="text-3xl font-extrabold text-emerald-600">{loading ? "-" : m.completedCount || 0}</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Users size={12} className="text-indigo-500" /> In Transit
            </span>
            <span className="text-3xl font-extrabold text-indigo-600">{loading ? "-" : m.totalEmployeesTravelling || 0}</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Car size={12} className="text-slate-500" /> Active Fleet (Cabs)
            </span>
            <span className="text-3xl font-extrabold text-slate-900">{loading ? "-" : m.totalCabsActive || 0}</span>
          </div>
        </div>
      </div>

      {/* WORKFORCE & APPROVALS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
            Workforce Availability
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Registered Employees</span>
              <span className="text-2xl font-extrabold text-slate-950">{loading ? "-" : m.totalEmployeesCount || 0}</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Department Managers</span>
              <span className="text-2xl font-extrabold text-slate-950">{loading ? "-" : m.totalManagersCount || 0}</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Employees on Leave</span>
              <span className="text-2xl font-extrabold text-amber-600">{loading ? "-" : m.totalLeavesTodayCount || 0}</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Absences Today</span>
              <span className="text-2xl font-extrabold text-slate-400">{loading ? "-" : m.totalAbsencesCount || 0}</span>
            </div>
          </div>
        </div>

        {/* APPROVALS DESK */}
        <div className="space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
            Approvals Workflow
          </h2>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between h-[84px] shadow-xs">
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Pending Requests</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-1 block">{loading ? "-" : m.totalPendingRequestsCount || 0}</span>
            </div>
            <Link href="/dashboard/admin/operations/calendar" className="text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 px-3.5 py-1.5 rounded-lg transition">
              Manage Holidays
            </Link>
          </div>
        </div>
      </div>

      {/* DELAYS & DISPATCH WARNINGS */}
      <div className="space-y-4">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
          Transport Commute Delays
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <AlertTriangle size={13} className="text-red-500" /> Delayed Routes
            </span>
            <span className={`text-3xl font-extrabold ${m.delayedRoutesCount > 0 ? "text-red-650" : "text-slate-900"}`}>
              {loading ? "-" : m.delayedRoutesCount || 0}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Clock size={13} className="text-red-500" /> Delayed Drivers
            </span>
            <span className={`text-3xl font-extrabold ${m.delayedDriversCount > 0 ? "text-red-650" : "text-slate-900"}`}>
              {loading ? "-" : m.delayedDriversCount || 0}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Users size={13} className="text-red-500" /> Delayed Employees
            </span>
            <span className={`text-3xl font-extrabold ${m.delayedEmployeesCount > 0 ? "text-red-650" : "text-slate-900"}`}>
              {loading ? "-" : m.delayedEmployeesCount || 0}
            </span>
          </div>
        </div>
      </div>

      {/* OPTIMIZATION SAVINGS & ROI */}
      <div className="space-y-4">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
          Route Optimization Efficiency & ROI
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Sparkles size={13} /> Distance Conserved
            </span>
            <div>
              <span className="text-3xl font-black text-emerald-700">{loading ? "-" : `+${m.savings || 0}`} km</span>
              <span className="text-[9px] text-emerald-500 block font-bold font-mono mt-0.5">Optimized vs Naive Routes</span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Fuel size={13} /> Fuel Conserved
            </span>
            <div>
              <span className="text-3xl font-black text-emerald-700">{loading ? "-" : `+${fuelSaved.toFixed(0)}`} L</span>
              <span className="text-[9px] text-emerald-500 block font-bold font-mono mt-0.5">At 10km/L mileage average</span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex flex-col justify-between">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <DollarSign size={13} /> Estimated Cost Savings
            </span>
            <div>
              <span className="text-3xl font-black text-emerald-700">{loading ? "-" : `₹${costSaved.toLocaleString()}`}</span>
              <span className="text-[9px] text-emerald-500 block font-bold font-mono mt-0.5">Fuel savings at ₹100/L</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-xs">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Optimization Settings</span>
            <div className="space-y-1">
              <Link href="/dashboard/admin/transport/optimization" className="text-xs font-bold text-blue-600 hover:underline block">
                Open Route Optimizer &rarr;
              </Link>
              <Link href="/dashboard/admin/analytics" className="text-xs font-bold text-indigo-600 hover:underline block">
                View Executive ROI Analytics &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE DISPATCH LIST */}
      {metrics?.activeRoutes?.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest">
              Live Dispatch Routes In Progress
            </h2>
          </div>
          <div className="p-0">
            <ul className="divide-y divide-slate-100">
              {metrics.activeRoutes.map((route: any) => (
                <li key={route.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      Cab {route.cab.vehicleNumber} 
                      <span className="text-slate-400 font-normal">•</span>
                      <span className="text-slate-655 font-semibold">Driver: {route.cab.driverName || "N/A"}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {route.stops.filter((s:any) => s.status === 'BOARDED' || s.status === 'SKIPPED').length} / {route.stops.length} Stops Completed
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-blue-100 text-blue-750">
                      In Progress
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs h-40 flex items-center justify-center">
          <div className="text-center">
            <span className="text-slate-400 block mb-1 font-bold uppercase tracking-widest text-[10px]">No Dispatch Routes Active</span>
            <p className="text-xs text-slate-500">There are no optimized transport routes currently running operations.</p>
          </div>
        </div>
      )}
    </div>
  );
}
