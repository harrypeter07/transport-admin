"use client";

import Link from "next/link";
import { ChevronRight, Settings2, Bell, Shield, User, Globe, Key } from "lucide-react";

export default function SettingsPage() {
  const categories = [
    { id: "profile", label: "My Profile", icon: User, desc: "Manage your account details and preferences" },
    { id: "security", label: "Security", icon: Shield, desc: "Password, 2FA, and active sessions" },
    { id: "notifications", label: "Notifications", icon: Bell, desc: "Email and push notification alerts" },
    { id: "api", label: "API Keys", icon: Key, desc: "Developer access and integrations" },
    { id: "preferences", label: "Preferences", icon: Settings2, desc: "Theme, timezone, and language" },
    { id: "organization", label: "Organization", icon: Globe, desc: "Company details and billing" },
  ];

  return (
    <div className="space-y-6 animate-fadeIn max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/dashboard/admin" className="hover:text-slate-900 transition">Dashboard</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-900">Settings</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">System Settings</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage your platform preferences and configurations.</p>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all cursor-not-allowed opacity-75"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
              <cat.icon className="w-5 h-5 text-slate-600" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 mb-1">{cat.label}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{cat.desc}</p>
            <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Coming in Phase 5
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
