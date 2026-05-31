"use client";

import { useActionState } from "react";
import { logout } from "@/app/actions/auth";
import Link from "next/link";
import Image from "next/image";
import NotificationBell from "@/components/NotificationBell";

export default function DashboardLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 const [, action, pending] = useActionState(logout, undefined);

 return (
 <div className="min-h-screen bg-[#f7f7f7] flex flex-col text-[#1c1b1f] selection:bg-[#ff4f00] selection:text-white antialiased">
 {/* Header */}
 <header className="sticky top-0 z-50 w-full border-b border-[#e8e8e8] bg-white">
 <div className="w-full px-6 h-14 flex items-center justify-between">
 {/* Logo */}
 <Link href="/dashboard" className="flex items-center gap-4">
 <Image
 src="/logo.png"
 alt="GlobalLogic"
 width={140}
 height={40}
 className="h-7 w-auto"
 priority
 />
 <div className="w-px h-5 bg-[#e8e8e8]" />
 <span className="text-xs font-semibold text-[#6b6b6b] tracking-wider uppercase">
 Transit Admin
 </span>
 </Link>

 {/* Right actions */}
 <div className="flex items-center gap-3">
 <NotificationBell />
 <div className="w-px h-5 bg-[#e8e8e8]" />
 <form action={action}>
 <button
 type="submit"
 disabled={pending}
 className="flex items-center gap-1.5 text-xs font-semibold text-[#6b6b6b] hover:text-[#ff4f00] transition-colors px-3 py-1.5"
 >
 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
 </svg>
 {pending ? "Signing out..." : "Sign out"}
 </button>
 </form>
 </div>
 </div>
 </header>

 {/* Main Content */}
 <main className="flex-1 w-full">
 {children}
 </main>
 </div>
 );
}
