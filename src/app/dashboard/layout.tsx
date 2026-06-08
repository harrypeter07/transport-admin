"use client";

import { useActionState, useState, useEffect } from "react";
import { logout } from "@/app/actions/auth";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import {
  Menu,
  X,
  LayoutDashboard,
  Users,
  CarFront,
  Clock,
  Map,
  Settings,
  BarChart,
  Network,
  FileSpreadsheet,
  UserCog,
  CheckCircle,
  User,
  Bell,
  CalendarClock,
} from "lucide-react";

const adminNavGroups = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard/admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operations",
    items: [
      { name: "Employees", href: "/dashboard/admin/operations/employees", icon: Users },
      { name: "Cabs", href: "/dashboard/admin/operations/cabs", icon: CarFront },
      { name: "Shifts", href: "/dashboard/admin/operations/shifts", icon: Clock },
      { name: "Leaves & Approvals", href: "/dashboard/admin/operations/leaves", icon: FileSpreadsheet },
      { name: "Hierarchy", href: "/dashboard/admin/operations/hierarchy", icon: Network },
      { name: "Calendar & Holidays", href: "/dashboard/admin/operations/calendar", icon: Clock },
      { name: "User Accounts", href: "/dashboard/admin/operations/users", icon: UserCog },
    ],
  },
  {
    label: "Transport",
    items: [
      { name: "Route Optimization", href: "/dashboard/admin/transport/optimization", icon: Map },
    ],
  },
  {
    label: "System",
    items: [
      { name: "Analytics", href: "/dashboard/admin/analytics", icon: BarChart },
      { name: "Settings", href: "/dashboard/admin/settings", icon: Settings },
    ],
  },
];

const managerNavGroups = [
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

const employeeNavGroups = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard/employee", icon: LayoutDashboard },
      { name: "My Route", href: "/dashboard/employee/route", icon: Map },
      { name: "Requests", href: "/dashboard/employee/requests", icon: CalendarClock },
      { name: "Notifications", href: "/dashboard/employee/notifications", icon: Bell },
      { name: "Profile", href: "/dashboard/employee/profile", icon: User },
    ],
  },
];

const driverNavGroups = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard/driver", icon: LayoutDashboard },
      { name: "My Routes", href: "/dashboard/driver/routes", icon: Map },
      { name: "Notifications", href: "/dashboard/driver/notifications", icon: Bell },
      { name: "Profile", href: "/dashboard/driver/profile", icon: User },
    ],
  },
];

interface SessionUser {
  name: string;
  email: string;
  role: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [, action, pending] = useActionState(logout, undefined);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(d => {
        if (!d.error && d.userId) setSession(d as SessionUser);
      })
      .catch(() => {});
  }, []);

  // Auto close drawer when path changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Match roles based on pathname
  let activeGroups: any[] = [];
  let rolePrefix = "";
  if (pathname.startsWith("/dashboard/admin")) {
    activeGroups = adminNavGroups;
    rolePrefix = "/dashboard/admin";
  } else if (pathname.startsWith("/dashboard/manager")) {
    activeGroups = managerNavGroups;
    rolePrefix = "/dashboard/manager";
  } else if (pathname.startsWith("/dashboard/employee")) {
    activeGroups = employeeNavGroups;
    rolePrefix = "/dashboard/employee";
  } else if (pathname.startsWith("/dashboard/driver")) {
    activeGroups = driverNavGroups;
    rolePrefix = "/dashboard/driver";
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex flex-col text-[#1c1b1f] selection:bg-[#ff4f00] selection:text-white antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#e8e8e8] bg-white">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-4">
              <Image
                src="/logo.png"
                alt="GlobalLogic"
                width={140}
                height={40}
                className="h-7 w-auto"
                priority
              />
              <div className="w-px h-5 bg-[#e8e8e8] hidden sm:block" />
              <span className="text-xs font-semibold text-[#6b6b6b] tracking-wider uppercase hidden sm:inline">
                Transit Admin
              </span>
            </Link>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <NotificationBell />
            
            {/* User identity chip (desktop) */}
            {session && (
              <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-[#f7f7f7] border border-[#e8e8e8]">
                <div className="w-5 h-5 rounded-full bg-[#1c1b1f] flex items-center justify-center text-white text-[9px] font-bold">
                  {session.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <span className="text-[11px] font-semibold text-[#4a4a4a] max-w-[100px] truncate">{session.name}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#6b6b6b]">{session.role}</span>
              </div>
            )}
            
            {/* Desktop Sign Out */}
            <div className="hidden md:flex items-center gap-3">
              <div className="w-px h-5 bg-[#e8e8e8]" />
              <form action={action}>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#6b6b6b] hover:text-[#ff4f00] transition-colors px-3 py-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>{pending ? "Signing out..." : "Sign out"}</span>
                </button>
              </form>
            </div>

            {/* Mobile Hamburger menu toggle (Right aligned) */}
            {activeGroups.length > 0 && (
              <div className="md:hidden flex items-center">
                <div className="w-px h-5 bg-[#e8e8e8] mr-2" />
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="p-1.5 -mr-1 text-[#6b6b6b] hover:text-[#1c1b1f] transition cursor-pointer"
                  aria-label="Open navigation menu"
                >
                  <Menu className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer Menu */}
      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 w-64 bg-white border-l border-[#e8e8e8] flex flex-col overflow-y-auto transition-transform duration-300 ease-in-out md:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <span className="text-xs font-bold uppercase tracking-widest text-[#9a9a9a]">Navigation</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 text-[#6b6b6b] hover:text-[#1c1b1f] hover:bg-[#f7f7f7] rounded-none transition cursor-pointer"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {activeGroups.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="text-[9px] font-bold text-[#b0b0b0] uppercase tracking-widest mb-1.5 px-2">
                {group.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item: any) => {
                  const isActive =
                    item.href === rolePrefix
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 px-2.5 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-[#ff4f00] text-white"
                          : "text-[#4a4a4a] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-[#9a9a9a]"}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Mobile Sign Out inside drawer */}
        <div className="p-4 border-t border-[#e8e8e8] bg-[#f7f7f7]/50">
          <form action={action}>
            <button
              type="submit"
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#e8e8e8] hover:border-slate-350 text-sm font-semibold text-[#6b6b6b] hover:text-[#ff4f00] transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {pending ? "Signing out..." : "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
