"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
 ChevronRight,
 MapPin,
 DollarSign,
 CheckSquare,
 Save,
 Loader2,
 CheckCircle,
 AlertCircle,
} from "lucide-react";
import LocationAutocomplete from "@/components/LocationAutocomplete";

type Settings = {
 leaveApprovalRequired: boolean;
 timingChangeApprovalRequired: boolean;
 defaultCity: string;
 defaultCountry: string;
 defaultDepotLat: number;
 defaultDepotLng: number;
 depotName: string;
 maxPickupRadiusKm: number;
 currencySymbol: string;
 fuelPricePerLitre: number;
 avgFuelMileageKmL: number;
};

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
 return (
 <div
 className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-none shadow-sm text-sm font-bold border animate-fadeIn ${
 type === "success"
 ? "bg-[#f7f7f7] text-[#1c1b1f] border-[#e8e8e8]"
 : "bg-[#f7f7f7] text-[#1c1b1f] border-[#e8e8e8]"
 }`}
 >
 {type === "success" ? (
 <CheckCircle className="w-4 h-4" />
 ) : (
 <AlertCircle className="w-4 h-4" />
 )}
 {msg}
 </div>
 );
}

function Panel({
 title,
 icon: Icon,
 children,
}: {
 title: string;
 icon: any;
 children: React.ReactNode;
}) {
 return (
 <div className="bg-white rounded-none border border-[#e8e8e8] shadow-xs">
 <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
 <div className="p-1.5 rounded-none bg-[#f7f7f7] border border-slate-100">
 <Icon className="w-4 h-4 text-[#6b6b6b]" />
 </div>
 <h2 className="text-sm font-extrabold text-[#1c1b1f] tracking-tight">{title}</h2>
 </div>
 <div className="p-6 space-y-5">{children}</div>
 </div>
 );
}

function Field({
 label,
 note,
 children,
}: {
 label: string;
 note?: string;
 children: React.ReactNode;
}) {
 return (
 <div>
 <label className="block text-xs font-bold text-[#4a4a4a] mb-1">{label}</label>
 {children}
 {note && <p className="text-[10px] text-[#9a9a9a] mt-1 font-medium">{note}</p>}
 </div>
 );
}

const inputClass =
 "w-full border border-[#e8e8e8] rounded-none px-3.5 py-2.5 text-sm text-[#1c1b1f] bg-[#f7f7f7] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-slate-400 transition-all placeholder:text-[#9a9a9a]";

export default function SettingsPage() {
 const [settings, setSettings] = useState<Settings | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState<string | null>(null);
 const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

 useEffect(() => {
 fetch("/api/settings")
 .then((r) => r.json())
 .then((data) => setSettings(data))
 .catch(() => showToast("Failed to load settings", "error"))
 .finally(() => setLoading(false));
 }, []);

 function showToast(msg: string, type: "success" | "error") {
 setToast({ msg, type });
 setTimeout(() => setToast(null), 3500);
 }

 async function saveSection(section: string, patch: Partial<Settings>) {
 setSaving(section);
 try {
 const res = await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(patch),
 });
 if (res.ok) {
 const updated = await res.json();
 setSettings(updated);
 showToast("Settings saved successfully.", "success");
 } else {
 const err = await res.json();
 showToast(err.error || "Failed to save.", "error");
 }
 } catch {
 showToast("Network error. Please try again.", "error");
 } finally {
 setSaving(null);
 }
 }

 if (loading) {
 return (
 <div className="flex items-center justify-center h-64">
 <Loader2 className="w-6 h-6 animate-spin-fast text-[#9a9a9a]" />
 </div>
 );
 }

 if (!settings) return null;

 return (
 <div className="space-y-6 animate-fadeIn max-w-4xl">
 {toast && <Toast msg={toast.msg} type={toast.type} />}

 {/* Breadcrumb */}
 <nav className="flex items-center gap-1.5 text-xs text-[#6b6b6b]">
 <Link href="/dashboard/admin" className="hover:text-[#1c1b1f] transition">
 Dashboard
 </Link>
 <ChevronRight className="w-3 h-3" />
 <span className="font-semibold text-[#1c1b1f]">Settings</span>
 </nav>

 {/* Header */}
 <div>
 <h1 className="text-xl font-extrabold text-[#1c1b1f] tracking-tight">System Settings</h1>
 <p className="text-[#6b6b6b] text-sm mt-0.5">
 Configure location, routing, approvals, and financial parameters.
 </p>
 </div>

 {/* Panel 1 — Location & Depot */}
 <Panel title="Location & Depot" icon={MapPin}>
 <div className="grid grid-cols-2 gap-4">
 <Field label="Base City" note="Used for geocoding employee addresses">
 <LocationAutocomplete
 id="defaultCity"
 className={inputClass}
 defaultValue={settings.defaultCity}
 placeholder="e.g. Nagpur, Mumbai, London"
 onSelect={(loc) => {
 const el = document.getElementById("defaultCity") as HTMLInputElement;
 if (el) el.value = loc.city || loc.displayName.split(',')[0];
 }}
 />
 </Field>
 <Field label="Country">
 <LocationAutocomplete
 id="defaultCountry"
 className={inputClass}
 defaultValue={settings.defaultCountry}
 placeholder="e.g. India, United Kingdom"
 onSelect={(loc) => {
 const el = document.getElementById("defaultCountry") as HTMLInputElement;
 if (el) el.value = loc.country || loc.displayName.split(',').pop()?.trim() || "";
 }}
 />
 </Field>
 </div>
 <Field label="Depot / Office Name" note="Search to automatically fill Lat/Lng, City, and Country">
 <LocationAutocomplete
 id="depotName"
 className={inputClass}
 defaultValue={settings.depotName}
 placeholder="Type address or landmark..."
 onSelect={(loc) => {
 const elCity = document.getElementById("defaultCity") as HTMLInputElement;
 const elCountry = document.getElementById("defaultCountry") as HTMLInputElement;
 const elLat = document.getElementById("defaultDepotLat") as HTMLInputElement;
 const elLng = document.getElementById("defaultDepotLng") as HTMLInputElement;
 const elName = document.getElementById("depotName") as HTMLInputElement;
 
 if (elLat) elLat.value = loc.lat.toString();
 if (elLng) elLng.value = loc.lon.toString();
 // Only overwrite city/country if the result contains them
 if (elCity && loc.city) elCity.value = loc.city;
 if (elCountry && loc.country) elCountry.value = loc.country;
 }}
 />
 </Field>
 {/* Hidden inputs to store the fetched coordinates */}
 <input type="hidden" id="defaultDepotLat" defaultValue={settings.defaultDepotLat} />
 <input type="hidden" id="defaultDepotLng" defaultValue={settings.defaultDepotLng} />
 <Field
 label={`Max Pickup Radius: ${settings.maxPickupRadiusKm} km`}
 note="Employees beyond this radius are treated as outliers and excluded from routing."
 >
 <input
 type="range"
 min={10}
 max={150}
 step={5}
 defaultValue={settings.maxPickupRadiusKm}
 id="maxPickupRadiusKm"
 className="w-full accent-slate-900"
 onChange={(e) =>
 setSettings((s) => s ? { ...s, maxPickupRadiusKm: Number(e.target.value) } : s)
 }
 />
 <div className="flex justify-between text-[10px] text-[#9a9a9a] font-bold mt-0.5">
 <span>10 km</span>
 <span className="text-[#4a4a4a] font-black">{settings.maxPickupRadiusKm} km selected</span>
 <span>150 km</span>
 </div>
 </Field>
 <div className="flex justify-end">
 <button
 onClick={() =>
 saveSection("location", {
 defaultCity: (document.getElementById("defaultCity") as HTMLInputElement)?.value,
 defaultCountry: (document.getElementById("defaultCountry") as HTMLInputElement)?.value,
 depotName: (document.getElementById("depotName") as HTMLInputElement)?.value,
 defaultDepotLat: Number((document.getElementById("defaultDepotLat") as HTMLInputElement)?.value),
 defaultDepotLng: Number((document.getElementById("defaultDepotLng") as HTMLInputElement)?.value),
 maxPickupRadiusKm: settings.maxPickupRadiusKm,
 })
 }
 disabled={saving === "location"}
 className="flex items-center gap-2 px-5 py-2.5 bg-[#1c1b1f] hover:bg-black text-white text-xs font-bold rounded-none transition disabled:opacity-50 shadow-none"
 >
 {saving === "location" ? <Loader2 className="w-3.5 h-3.5 animate-spin-fast" /> : <Save className="w-3.5 h-3.5" />}
 Save Location Settings
 </button>
 </div>
 </Panel>

 {/* Panel 2 — Approval Workflows */}
 <Panel title="Approval Workflows" icon={CheckSquare}>
 <div className="space-y-4">
 <div className="flex items-center justify-between p-4 bg-[#f7f7f7] rounded-none border border-slate-100">
 <div>
 <p className="text-sm font-bold text-[#1c1b1f]">Leave Approval Required</p>
 <p className="text-xs text-[#6b6b6b] mt-0.5">
 Managers must approve leave requests before they take effect.
 </p>
 </div>
 <button
 onClick={() =>
 saveSection("approvals", { leaveApprovalRequired: !settings.leaveApprovalRequired })
 }
 className={`relative w-11 h-6 rounded-none transition-colors ${
 settings.leaveApprovalRequired ? "bg-[#1c1b1f]" : "bg-slate-300"
 }`}
 >
 <span
 className={`absolute top-1 left-1 w-4 h-4 rounded-none bg-white shadow transition-transform ${
 settings.leaveApprovalRequired ? "translate-x-5" : "translate-x-0"
 }`}
 />
 </button>
 </div>

 <div className="flex items-center justify-between p-4 bg-[#f7f7f7] rounded-none border border-slate-100">
 <div>
 <p className="text-sm font-bold text-[#1c1b1f]">Timing Change Approval Required</p>
 <p className="text-xs text-[#6b6b6b] mt-0.5">
 Employee pickup/drop time change requests need manager sign-off.
 </p>
 </div>
 <button
 onClick={() =>
 saveSection("approvals", {
 timingChangeApprovalRequired: !settings.timingChangeApprovalRequired,
 })
 }
 className={`relative w-11 h-6 rounded-none transition-colors ${
 settings.timingChangeApprovalRequired ? "bg-[#1c1b1f]" : "bg-slate-300"
 }`}
 >
 <span
 className={`absolute top-1 left-1 w-4 h-4 rounded-none bg-white shadow transition-transform ${
 settings.timingChangeApprovalRequired ? "translate-x-5" : "translate-x-0"
 }`}
 />
 </button>
 </div>
 </div>
 </Panel>

 {/* Panel 3 — Financial */}
 <Panel title="Financial & ROI Parameters" icon={DollarSign}>
 <div className="grid grid-cols-3 gap-4">
 <Field label="Currency Symbol" note="Displayed in analytics (e.g. ₹, $, €)">
 <input
 className={inputClass}
 defaultValue={settings.currencySymbol}
 id="currencySymbol"
 placeholder="₹"
 maxLength={3}
 />
 </Field>
 <Field label="Fuel Price / Litre" note="Used for cost savings calculation">
 <input
 className={inputClass}
 type="number"
 step="0.01"
 defaultValue={settings.fuelPricePerLitre}
 id="fuelPricePerLitre"
 />
 </Field>
 <Field label="Avg. Mileage (km/L)" note="Vehicle fuel efficiency">
 <input
 className={inputClass}
 type="number"
 step="0.1"
 defaultValue={settings.avgFuelMileageKmL}
 id="avgFuelMileageKmL"
 />
 </Field>
 </div>
 <div className="flex justify-end">
 <button
 onClick={() =>
 saveSection("financial", {
 currencySymbol: (document.getElementById("currencySymbol") as HTMLInputElement)?.value,
 fuelPricePerLitre: Number((document.getElementById("fuelPricePerLitre") as HTMLInputElement)?.value),
 avgFuelMileageKmL: Number((document.getElementById("avgFuelMileageKmL") as HTMLInputElement)?.value),
 })
 }
 disabled={saving === "financial"}
 className="flex items-center gap-2 px-5 py-2.5 bg-[#1c1b1f] hover:bg-black text-white text-xs font-bold rounded-none transition disabled:opacity-50 shadow-none"
 >
 {saving === "financial" ? <Loader2 className="w-3.5 h-3.5 animate-spin-fast" /> : <Save className="w-3.5 h-3.5" />}
 Save Financial Settings
 </button>
 </div>
 </Panel>
 </div>
 );
}
