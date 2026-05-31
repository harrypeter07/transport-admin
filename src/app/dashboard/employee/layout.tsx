"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Map, CalendarClock, User, Bell , Menu, X } from "lucide-react";

const navItems = [
 { name: "Dashboard", href: "/dashboard/employee", icon: LayoutDashboard },
 { name: "My Route", href: "/dashboard/employee/route", icon: Map },
 { name: "Requests", href: "/dashboard/employee/requests", icon: CalendarClock },
 { name: "Notifications", href: "/dashboard/employee/notifications", icon: Bell },
 { name: "Profile", href: "/dashboard/employee/profile", icon: User },
];

export default function EmployeeLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const pathname = usePathname();
 const [sidebarOpen, setSidebarOpen] = useState(false);

 useEffect(() => {
 setSidebarOpen(false);
 }, [pathname]);

 useEffect(() => {
 if (sidebarOpen) {
 document.body.style.overflow = "hidden";
 } else {
 document.body.style.overflow = "";
 }
 return () => { document.body.style.overflow = ""; };
 }, [sidebarOpen]);

 const activeItem = navItems.find((i) =>
 i.href === "/dashboard/employee" ? pathname === i.href : pathname.startsWith(i.href)
 );

 function SidebarNav() {
 return (
 <nav className="flex-1 py-4 px-3 flex flex-col gap-0.5">

 {navItems.map((item) => {
 const isActive =
 item.href === "/dashboard/employee"
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
 <div className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-8 bg-[#f7f7f7]">
 {/* Mobile nav bar */}
 <div className="md:hidden flex items-center gap-3 px-1 py-3 mb-4 border-b border-[#e8e8e8]/50">
 <button
 onClick={() => setSidebarOpen(true)}
 className="p-1.5 bg-white text-[#6b6b6b] hover:text-[#1c1b1f] border border-[#e8e8e8] shadow-xs transition"
 aria-label="Open navigation"
 >
 <Menu className="w-4 h-4" />
 </button>
 <span className="text-sm font-bold text-[#1c1b1f] tracking-tight">
 {activeItem?.name ?? "Employee"}
 </span>
 </div>
 {children}
 </div>
 </div>
 );
}