"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Compass,
  ShieldAlert,
  BarChart3,
  Settings,
  ShieldAlert as AlertTriangle
} from "lucide-react";
import { useTransportStore } from "@/store/useTransportStore";
import { useEffect } from "react";

export default function AdminSidebar() {
  const pathname = usePathname();
  const routes = useTransportStore((state) => state.routes);
  const fetchInitialData = useTransportStore((state) => state.fetchInitialData);

  // Auto fetch data on load
  useEffect(() => {
    if (routes.length === 0) {
      fetchInitialData();
    }
  }, []);

  const totalViolations = routes.reduce(
    (acc, r) => acc + r.violations.filter((v) => !v.resolved).length,
    0
  );

  const menuItems = [
    { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Employees Desk", href: "/admin/employees", icon: Users },
    { name: "Route Optimization", href: "/admin/optimization", icon: Compass },
    {
      name: "Compliance Logs",
      href: "/admin/compliance",
      icon: ShieldAlert,
      badge: totalViolations > 0 ? totalViolations : undefined,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between py-6">
      <div className="flex flex-col gap-6 px-4">
        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 px-3">
          Navigation Desk
        </div>
        <nav className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.name || pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200
                  ${
                    isActive
                      ? "bg-slate-100 text-slate-900 border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }
                `}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  {item.name}
                </div>
                {item.badge !== undefined && (
                  <span className="bg-red-100 text-red-700 border border-red-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {totalViolations > 0 && (
          <div className="p-3.5 bg-red-50 border border-red-100 rounded-lg flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-red-800 font-bold text-xs">
              <AlertTriangle className="w-4 h-4" />
              Safety Alerts
            </div>
            <p className="text-[10px] text-red-700 leading-relaxed">
              {totalViolations} compliance violations detected in generated cab sequences.
            </p>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 flex items-center gap-3 px-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
            AM
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-900">Admin Mgr</span>
            <span className="text-[10px] text-slate-500 font-mono">admin@transitadmin.com</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
