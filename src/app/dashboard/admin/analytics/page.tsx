"use client";

import Link from "next/link";
import { ChevronRight, BarChart3, TrendingUp, TrendingDown, DollarSign, Fuel, Users, ExternalLink, Info } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6 animate-fadeIn max-w-6xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Analytics</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Executive Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">High-level operational KPIs, utilization metrics, and savings.</p>
        </div>
        <Link
          href="/dashboard/admin/transport/optimization"
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-2 transition"
        >
          View Route Analytics <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Architecture Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-slate-600 leading-relaxed">
          <strong className="text-slate-900 block mb-1">Analytics Architecture Notice</strong>
          This page displays <strong className="font-semibold text-slate-800">Executive Analytics</strong> (Cost, Fuel, and Fleet Utilization). 
          For specific route-by-route comparisons, map visualizations, and distance optimizations, please use the 
          <Link href="/dashboard/admin/transport/optimization" className="mx-1 text-slate-900 underline hover:text-slate-600 font-medium">
            Transport Route Analytics
          </Link> 
          module embedded within the Optimization desk.
        </div>
      </div>

      {/* Placeholder KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Cost Savings (YTD)", value: "₹12.4L", trend: "+14%", icon: DollarSign },
          { label: "Fuel Savings", value: "4,200 L", trend: "+8%", icon: Fuel },
          { label: "Cab Utilization", value: "88%", trend: "+2%", icon: CarFrontIcon },
          { label: "Driver Utilization", value: "92%", trend: "-1%", icon: Users },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs opacity-60">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-slate-50 rounded-lg">
                <kpi.icon className="w-4 h-4 text-slate-500" />
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kpi.trend.startsWith("+") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {kpi.trend}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">{kpi.value}</div>
            <div className="text-xs text-slate-400 font-medium mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Placeholder Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 opacity-60">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs h-80 flex flex-col items-center justify-center text-center">
          <BarChart3 className="w-10 h-10 text-slate-300 mb-3" />
          <h3 className="text-sm font-extrabold text-slate-900 mb-1">Monthly Savings Trend</h3>
          <p className="text-xs text-slate-500 max-w-xs">Financial module pending Phase 4 implementation.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs h-80 flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-10 h-10 text-slate-300 mb-3" />
          <h3 className="text-sm font-extrabold text-slate-900 mb-1">Shift Performance KPIs</h3>
          <p className="text-xs text-slate-500 max-w-xs">Operational module pending Phase 4 implementation.</p>
        </div>
      </div>
    </div>
  );
}

function CarFrontIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2.06 17.57 2.94-8.82A2 2 0 0 1 6.9 7.5h10.2a2 2 0 0 1 1.9 1.25l2.94 8.82" />
      <path d="M4.5 14h15" />
      <path d="M2.2 12h19.6" />
      <path d="M12 2v2.5" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}
