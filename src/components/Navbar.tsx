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
    <header className="sticky top-0 z-50 w-full border-b border-[#e8e8e8] bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/admin/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-[#1c1b1f] flex items-center justify-center text-white font-black text-lg">
            TA
          </div>
          <span className="font-bold tracking-tight text-[#1c1b1f]">Transit Admin</span>
          <span className="text-[10px] bg-[#f7f7f7] border border-[#e8e8e8] text-[#6b6b6b] px-1.5 py-0.5 rounded font-mono">
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
                      ? "bg-[#1c1b1f] text-white shadow-none"
                      : "text-[#6b6b6b] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
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
