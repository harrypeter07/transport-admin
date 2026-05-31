"use client";

import { useState, useEffect, useRef } from "react";
import {
  Users, AlertTriangle, CheckCircle, Navigation, ShieldCheck,
  CalendarRange, Clock, Sparkles, Map, DollarSign, Fuel, Car,
  TrendingUp, ArrowRight, Zap, Bell
} from "lucide-react";
import Link from "next/link";

// Animated counter hook
function useCounter(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
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
    blue: "text-[#ff4f00] bg-blue-50 border-blue-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
    red: "text-red-600 bg-red-50 border-red-100",
    indigo: "text-[#ff4f00] bg-indigo-50 border-indigo-100",
    slate: "text-[#6b6b6b] bg-[#f7f7f7] border-slate-100",
  };
  const cls = colorMap[color] || colorMap.slate;

  return (
    <div className="bg-white border border-[#e8e8e8] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:shadow-none transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest leading-tight">{label}</span>
        <div className={`p-2 rounded-xl border ${cls}`}>
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
    <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-2 flex items-center gap-1">
        <Sparkles size={10} /> {label}
      </span>
      <div>
        <span className="text-2xl font-black text-emerald-700">
          {loading ? "—" : `${value}${suffix || ""}`}
        </span>
        <span className="text-[9px] text-emerald-500 block font-bold font-mono mt-0.5">{note}</span>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [metricsRes, settingsRes] = await Promise.all([
        fetch("/api/execution/dashboard"),
        fetch("/api/settings"),
      ]);
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (e) {
      console.error("Failed to fetch dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }

  const m = metrics?.metrics || {};
  const currency = settings?.currencySymbol || "₹";
  const fuelPrice = settings?.fuelPricePerLitre || 100;
  const mileage = settings?.avgFuelMileageKmL || 10;
  const depotName = settings?.depotName || "Depot";

  const fuelSaved = m.savings ? Math.max(0, m.savings) / mileage : 0;
  const costSaved = fuelSaved * fuelPrice;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const issueCount = (m.delayedRoutesCount || 0) + (m.totalPendingRequestsCount || 0);
  const systemStatus = issueCount > 0
    ? { label: `${issueCount} Issue${issueCount > 1 ? "s" : ""} Detected`, cls: "bg-amber-100 text-amber-700 border-amber-200" }
    : { label: "All Systems Operational", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* HERO HEADER */}
      <div className="bg-white border border-[#e8e8e8] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-extrabold text-[#1c1b1f] tracking-tight">Admin Operations</h1>
            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${systemStatus.cls}`}>
              {systemStatus.label}
            </span>
          </div>
          <p className="text-xs text-[#6b6b6b]">{today} · {depotName}</p>
        </div>
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/admin/transport/optimization"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1c1b1f] hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-none"
          >
            <Zap className="w-3.5 h-3.5" /> Generate Routes
          </Link>
          <Link
            href="/dashboard/admin/operations/leaves"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e8e8] hover:bg-[#f7f7f7] text-[#4a4a4a] text-xs font-bold rounded-xl transition"
          >
            <Bell className="w-3.5 h-3.5" /> Manage Leaves
            {m.totalPendingRequestsCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                {m.totalPendingRequestsCount}
              </span>
            )}
          </Link>
          <Link
            href="/dashboard/admin/analytics"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#e8e8e8] hover:bg-[#f7f7f7] text-[#4a4a4a] text-xs font-bold rounded-xl transition"
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

        {/* APPROVALS DESK */}
        <div className="space-y-3">
          <h2 className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest border-b border-slate-100 pb-2">
            Approvals Workflow
          </h2>
          <div className="bg-white border border-[#e8e8e8] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest block">Pending Requests</span>
              <span className={`text-3xl font-black mt-0.5 block ${m.totalPendingRequestsCount > 0 ? "text-red-600" : "text-[#1c1b1f]"}`}>
                <AnimatedNumber value={m.totalPendingRequestsCount || 0} loading={loading} />
              </span>
            </div>
            <Link
              href="/dashboard/admin/operations/leaves"
              className="text-xs font-bold bg-[#1c1b1f] text-white hover:bg-black px-3.5 py-1.5 rounded-xl transition"
            >
              Review
            </Link>
          </div>
          <div className="bg-white border border-[#e8e8e8] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-[10px] font-black text-[#9a9a9a] uppercase tracking-widest block">Holidays</span>
            </div>
            <Link
              href="/dashboard/admin/operations/calendar"
              className="text-xs font-bold bg-[#1c1b1f] text-white hover:bg-black px-3.5 py-1.5 rounded-xl transition"
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
          <div className="bg-white border border-[#e8e8e8] rounded-2xl p-5 flex flex-col justify-between shadow-xs">
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
        <div className="bg-white border border-[#e8e8e8] rounded-2xl shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-[#f7f7f7] flex items-center justify-between">
            <h2 className="text-[10px] font-black text-[#4a4a4a] uppercase tracking-widest">
              Live Dispatch — In Progress
            </h2>
            <span className="text-[10px] font-black text-[#ff4f00] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
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
                      {route.cab.vehicleNumber}
                      <span className="text-[#9a9a9a] font-normal text-xs">·</span>
                      <span className="text-[#6b6b6b] font-semibold text-xs">{route.cab.driverName || "N/A"}</span>
                    </p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="flex-1 bg-[#f7f7f7] rounded-full h-1.5 w-32">
                        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-[#6b6b6b] font-bold">{completed}/{total} stops</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase bg-blue-100 text-blue-700 border border-blue-200">
                    In Progress
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="bg-white border border-[#e8e8e8] rounded-2xl p-8 shadow-xs flex items-center justify-center">
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
