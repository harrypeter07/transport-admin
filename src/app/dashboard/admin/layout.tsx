"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
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
 Menu,
 X,
} from "lucide-react";

const navGroups = [
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

export default function AdminLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const pathname = usePathname();
 const isOptimizationPage = pathname === "/dashboard/admin/transport/optimization";
 const [sidebarOpen, setSidebarOpen] = useState(false);

 // Close sidebar on route change
 useEffect(() => {
 setSidebarOpen(false);
 }, [pathname]);

 // Prevent body scroll when sidebar is open on mobile
 useEffect(() => {
 if (sidebarOpen) {
 document.body.style.overflow = "hidden";
 } else {
 document.body.style.overflow = "";
 }
 return () => { document.body.style.overflow = ""; };
 }, [sidebarOpen]);

 const allItems = navGroups.flatMap((g) => g.items);
 const activeItem = allItems.find((i) =>
 i.href === "/dashboard/admin" ? pathname === i.href : pathname.startsWith(i.href)
 );

 function SidebarNav() {
 return (
 <nav className="flex-1 py-4 px-3">
 {navGroups.map((group) => (
 <div key={group.label} className="mb-5">
 <div className="text-[9px] font-bold text-[#b0b0b0] uppercase tracking-widest mb-1.5 px-2">
 {group.label}
 </div>
 <div className="flex flex-col gap-0.5">
 {group.items.map((item) => {
 const isActive =
 item.href === "/dashboard/admin"
 ? pathname === item.href
 : pathname.startsWith(item.href);
 const Icon = item.icon;
 return (
 <Link
 key={item.href}
 href={item.href}
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
 );
 }

 return (
 <div className="flex min-h-[calc(100vh-56px)] relative">
 {/* Mobile overlay backdrop */}
 {sidebarOpen && (
 <div
 className="fixed inset-0 z-40 bg-black/50 md:hidden"
 onClick={() => setSidebarOpen(false)}
 />
 )}

 {/* Mobile sidebar drawer */}
 <aside
 className={`fixed z-50 w-64 bg-white border-r border-[#e8e8e8] flex flex-col overflow-y-auto transition-transform duration-300 md:hidden`}
 style={{ top: "56px", bottom: 0, left: 0, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}
 >
 <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8e8]">
 <span className="text-xs font-bold uppercase tracking-widest text-[#9a9a9a]">Navigation</span>
 <button onClick={() => setSidebarOpen(false)} className="p-1 text-[#6b6b6b] hover:text-[#1c1b1f]">
 <X className="w-4 h-4" />
 </button>
 </div>
 <SidebarNav />
 </aside>

 {/* Desktop sidebar */}
 <aside className="hidden md:flex w-56 flex-shrink-0 border-r border-[#e8e8e8] bg-white flex-col sticky top-14 h-[calc(100vh-56px)] overflow-y-auto">
 <SidebarNav />
 </aside>

 {/* Main content */}
 <div className={`flex-1 min-w-0 overflow-x-hidden ${isOptimizationPage ? "" : "p-4 md:p-8 bg-[#f7f7f7]"}`}>
 {/* Mobile nav bar */}
 <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-[#e8e8e8] sticky top-14 z-30">
 <button
 onClick={() => setSidebarOpen(true)}
 className="p-1.5 text-[#6b6b6b] hover:text-[#1c1b1f] transition"
 aria-label="Open navigation"
 >
 <Menu className="w-5 h-5" />
 </button>
 <span className="text-xs font-bold text-[#1c1b1f] uppercase tracking-widest">
 {activeItem?.name ?? "Admin"}
 </span>
 </div>
 {children}
 </div>
 </div>
 );
}
