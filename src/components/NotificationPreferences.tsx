"use client";

import { useState, useEffect } from "react";
import { Bell, ShieldAlert, Route as RouteIcon, CheckSquare, Settings } from "lucide-react";

export default function NotificationPreferences() {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    const res = await fetch("/api/notifications/settings");
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
    }
  }

  async function handleToggle(field: string, value: boolean) {
    if (!settings) return;
    
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    setSaving(true);
    
    const res = await fetch("/api/notifications/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    
    if (res.ok) {
      setMessage("Preferences saved");
      setTimeout(() => setMessage(""), 2000);
    }
    setSaving(false);
  }

  if (!settings) return <div className="p-4 text-slate-400">Loading preferences...</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            <Bell size={16} /> Notification Preferences
          </h2>
          <p className="text-xs text-slate-500 mt-1">Choose which alerts you want to receive.</p>
        </div>
        {message && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{message}</span>}
      </div>
      
      <div className="p-0">
        <ul className="divide-y divide-slate-100">
          <li className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                <RouteIcon size={18} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Route Updates</h3>
                <p className="text-xs text-slate-500 mt-0.5">Alerts when your cab arrives, starts, or skips.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.routeNotifications}
                onChange={(e) => handleToggle("routeNotifications", e.target.checked)}
                disabled={saving}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
            </label>
          </li>
          
          <li className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center">
                <CheckSquare size={18} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Leave & Approvals</h3>
                <p className="text-xs text-slate-500 mt-0.5">Updates on leave requests and timing changes.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.leaveNotifications}
                onChange={(e) => handleToggle("leaveNotifications", e.target.checked)}
                disabled={saving}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
            </label>
          </li>

          <li className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">System Alerts</h3>
                <p className="text-xs text-slate-500 mt-0.5">Important operational delays and security notices.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={settings.systemNotifications}
                onChange={(e) => handleToggle("systemNotifications", e.target.checked)}
                disabled={saving}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
            </label>
          </li>
        </ul>
      </div>
    </div>
  );
}
