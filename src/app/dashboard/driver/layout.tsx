"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, User, Bell , Menu, X } from "lucide-react";

const navItems = [
 { name: "Dashboard", href: "/dashboard/driver", icon: LayoutDashboard },
 { name: "My Routes", href: "/dashboard/driver/routes", icon: Map },
 { name: "Notifications", href: "/dashboard/driver/notifications", icon: Bell },
 { name: "Profile", href: "/dashboard/driver/profile", icon: User },
];

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const activeItem = navItems.find((i) =>
    i.href === "/dashboard/driver" ? pathname === i.href : pathname.startsWith(i.href)
  );

  function SidebarNav() {
    return (
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
              className={`flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#ff4f00] text-white"
                  : "text-[#4a4a4a] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? "text-white" : "text-[#9a9a9a]"
                }`}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] relative">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r border-[#e8e8e8] bg-white flex-col sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
        <SidebarNav />
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-8 bg-[#f7f7f7]">
        {children}
      </div>
    </div>
  );
}