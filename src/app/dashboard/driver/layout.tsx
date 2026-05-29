"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, User } from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/dashboard/driver", icon: LayoutDashboard },
  { name: "My Routes", href: "/dashboard/driver/routes", icon: Map },
  { name: "Profile", href: "/dashboard/driver/profile", icon: User },
];

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
        <nav className="flex-1 py-4 px-3 flex flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard/driver"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon
                  className={`w-4 h-4 flex-shrink-0 ${
                    isActive ? "text-white" : "text-slate-400"
                  }`}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Page content */}
      <div className="flex-1 min-w-0 p-8 bg-slate-50">
        {children}
      </div>
    </div>
  );
}
