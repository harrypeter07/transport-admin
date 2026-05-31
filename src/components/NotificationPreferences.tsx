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

 if (!settings) return <div className="p-4 text-[#9a9a9a]">Loading preferences...</div>;

 return (
 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-6 border-b border-[#e8e8e8] bg-[#f7f7f7] flex items-center justify-between">
 <div>
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest flex items-center gap-2">
 <Bell size={16} /> Notification Preferences
 </h2>
 <p className="text-xs text-[#6b6b6b] mt-1">Choose which alerts you want to receive.</p>
 </div>
 {message && <span className="text-xs font-bold text-[#1c1b1f] bg-[#f7f7f7] px-2 py-1 rounded">{message}</span>}
 </div>
 
 <div className="p-0">
 <ul className="divide-y divide-slate-100">
 <li className="p-6 flex items-center justify-between hover:bg-[#f7f7f7] transition-colors">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-[#f7f7f7] text-[#ff4f00] rounded-none flex items-center justify-center">
 <RouteIcon size={18} />
 </div>
 <div>
 <h3 className="font-bold text-[#1c1b1f] text-sm">Route Updates</h3>
 <p className="text-xs text-[#6b6b6b] mt-0.5">Alerts when your cab arrives, starts, or skips.</p>
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
 <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#d0d0d0] after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1c1b1f]"></div>
 </label>
 </li>
 
 <li className="p-6 flex items-center justify-between hover:bg-[#f7f7f7] transition-colors">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-[#f7f7f7] text-[#1c1b1f] rounded-none flex items-center justify-center">
 <CheckSquare size={18} />
 </div>
 <div>
 <h3 className="font-bold text-[#1c1b1f] text-sm">Leave & Approvals</h3>
 <p className="text-xs text-[#6b6b6b] mt-0.5">Updates on leave requests and timing changes.</p>
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
 <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#d0d0d0] after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1c1b1f]"></div>
 </label>
 </li>

 <li className="p-6 flex items-center justify-between hover:bg-[#f7f7f7] transition-colors">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 bg-[#f7f7f7] text-[#6b6b6b] rounded-none flex items-center justify-center">
 <ShieldAlert size={18} />
 </div>
 <div>
 <h3 className="font-bold text-[#1c1b1f] text-sm">System Alerts</h3>
 <p className="text-xs text-[#6b6b6b] mt-0.5">Important operational delays and security notices.</p>
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
 <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#d0d0d0] after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1c1b1f]"></div>
 </label>
 </li>
 </ul>
 </div>
 </div>
 );
}
