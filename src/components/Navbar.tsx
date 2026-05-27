"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, User, Truck, Shield, LayoutDashboard, Home, LogOut } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Employees Desk", href: "/admin/employees", icon: User },
    { name: "Route Optimization", href: "/admin/optimization", icon: Compass },
    { name: "Compliance Logs", href: "/admin/compliance", icon: Shield },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white font-black text-lg">
            TA
          </div>
          <span className="font-bold tracking-tight text-slate-900">Transit Admin</span>
          <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">
            Nagpur-MIHAN
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                  ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }
                `}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-500 font-mono">Role: Administrator</span>
        </div>
      </div>
    </header>
  );
}
