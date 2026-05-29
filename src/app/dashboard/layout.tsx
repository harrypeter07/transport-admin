"use client";

import { useActionState } from "react";
import { logout } from "@/app/actions/auth";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [, action, pending] = useActionState(logout, undefined);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-slate-900 selection:text-white font-sans antialiased">
      {/* Single Platform Shell Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand */}
          <Link href="/dashboard/admin" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-black text-sm select-none">
              TA
            </div>
            <span className="font-extrabold tracking-tight text-slate-900 text-base">Transit Admin</span>
            <span className="hidden sm:inline text-[10px] bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded font-mono font-bold">
              ETMS
            </span>
          </Link>

          {/* User actions */}
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="w-px h-6 bg-slate-200"></div>
            <form action={action}>
              <button
                type="submit"
                disabled={pending}
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition px-3 py-1.5 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200"
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

      {/* Main Content Area */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
