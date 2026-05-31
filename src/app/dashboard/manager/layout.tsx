"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CheckCircle, User } from "lucide-react";

const navGroups = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard/manager", icon: LayoutDashboard },
      { name: "My Team", href: "/dashboard/manager/team", icon: Users },
      { name: "Approvals", href: "/dashboard/manager/approvals", icon: CheckCircle },
      { name: "Profile", href: "/dashboard/manager/profile", icon: User },
    ],
  },
];

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
        <nav className="flex-1 py-4 px-3">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-2">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/dashboard/manager"
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
                        className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}
                      />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Page content */}
      <div className="flex-1 min-w-0 p-8 bg-slate-50">
        {children}
      </div>
    </div>
  );
}
