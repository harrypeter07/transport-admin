"use client";

import { useEffect, useState } from "react";
import NotificationPreferences from "@/components/NotificationPreferences";

interface SessionUser {
  name: string;
  email: string;
  role: string;
}

export default function EmployeeProfilePage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(d => {
        if (!d.error && d.userId) {
          setSession(d as SessionUser);
          // Fetch employee profile data
          fetch("/api/employee/profile")
            .then(res => res.json())
            .then(data => {
              if (!data.error) {
                setProfile(data);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1c1b1f]">My Profile</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Manage your personal details and security.
          </p>
        </div>
      </div>

      {session && (
        <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
          <div className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#1c1b1f] flex items-center justify-center text-white text-sm font-bold">
              {session.name?.charAt(0)?.toUpperCase() || "E"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#1c1b1f] truncate">{session.name}</p>
              <p className="text-xs text-[#6b6b6b] truncate">{session.email}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest bg-[#f0f0f0] text-[#6b6b6b] px-2.5 py-1 rounded-none">
              {session.role}
            </span>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
        <div className="p-6 border-b border-[#e8e8e8]">
          <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4">
            Personal Information
          </h2>
          <form className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">Phone Number</label>
                <input type="tel" className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" value={profile?.phone || ""} readOnly placeholder="+91 00000 00000" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">Email Address</label>
                <input type="email" className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" value={profile?.email || ""} readOnly placeholder="user@corporate.com" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mb-1.5">Residential Address</label>
              <textarea className="w-full rounded-none border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f]" value={profile?.formattedAddress || profile?.address || ""} readOnly rows={3}></textarea>
            </div>
            <button type="button" className="px-4 py-2 bg-[#1c1b1f] text-white text-sm font-bold rounded-none hover:bg-black transition-colors">
              Save Changes
            </button>
          </form>
        </div>
        
        <div className="p-6 bg-[#f7f7f7]">
          <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4">
            Security & Account
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#1c1b1f]">Change Password</p>
              <p className="text-xs text-[#6b6b6b] mt-0.5">Update your login credentials securely.</p>
            </div>
            <a href="/change-password" className="px-4 py-2 border border-[#d0d0d0] text-[#4a4a4a] text-sm font-bold rounded-none hover:bg-[#f7f7f7] transition-colors bg-white">
              Update Password
            </a>
          </div>
        </div>
      </div>
      
      <NotificationPreferences />
    </div>
  );
}
