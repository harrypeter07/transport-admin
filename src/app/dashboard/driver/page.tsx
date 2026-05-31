"use client";

import { useState, useEffect } from "react";
import { Map, Clock, PlayCircle, CheckCircle, Calendar, Users, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DriverDashboardPage() {
 const [activeRoutes, setActiveRoutes] = useState<any[]>([]);
 const [historyRoutes, setHistoryRoutes] = useState<any[]>([]);
 const [activeTab, setActiveTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
 const [loading, setLoading] = useState(true);
 const router = useRouter();

 useEffect(() => {
 fetchRoutes();
 }, [activeTab]);

 const [sessionError, setSessionError] = useState(false);

 async function fetchRoutes() {
 setLoading(true);
 try {
 const isHistory = activeTab === "HISTORY";
 const res = await fetch(`/api/driver/routes${isHistory ? "?history=true" : ""}`);
 if (res.status === 401) {
 setSessionError(true);
 return;
 }
 if (res.ok) {
 const data = await res.json();
 if (isHistory) {
 setHistoryRoutes(data.routes || []);
 } else {
 setActiveRoutes(data.routes || []);
 }
 }
 } catch (e) {
 console.error("Failed to fetch driver routes", e);
 } finally {
 setLoading(false);
 }
 }

 async function startRoute(routeId: string) {
 if (!confirm("Start this route now?")) return;
 const res = await fetch("/api/execution/route", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ routeId, action: "START_ROUTE" }),
 });
 if (res.ok) {
 router.push(`/dashboard/driver/routes`);
 } else {
 alert("Failed to start route");
 }
 }

 async function endTrip(routeId: string) {
 if (!confirm("Are you sure you want to end this trip?")) return;
 const res = await fetch("/api/execution/route", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ routeId, action: "COMPLETE_ROUTE" }),
 });
 if (res.ok) {
 fetchRoutes();
 } else {
 alert("Failed to end trip");
 }
 }

 const routesToRender = activeTab === "ACTIVE" ? activeRoutes : historyRoutes;

 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">Driver Portal</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Access your active shift worksheets and log sheets.
 </p>
 </div>
 <div className="inline-flex rounded-none border border-[#e8e8e8] p-0.5 bg-white">
 <button
 onClick={() => setActiveTab("ACTIVE")}
 className={`px-4 py-2 text-xs font-bold rounded-none cursor-pointer transition ${
 activeTab === "ACTIVE"
 ? "bg-black text-white shadow-xs"
 : "text-slate-650 hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
 }`}
 >
 Today's Assignments
 </button>
 <button
 onClick={() => setActiveTab("HISTORY")}
 className={`px-4 py-2 text-xs font-bold rounded-none cursor-pointer transition ${
 activeTab === "HISTORY"
 ? "bg-black text-white shadow-xs"
 : "text-slate-650 hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
 }`}
 >
 Route History
 </button>
 </div>
 </div>

 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-6 border-b border-[#e8e8e8] bg-[#f7f7f7]">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest flex items-center gap-2">
 {activeTab === "ACTIVE" ? "Current Assignments" : "Historical Commute Records"}
 </h2>
 </div>
 <div className="p-6">
 {sessionError ? (
 <div className="flex flex-col items-center justify-center py-12 rounded-none border border-[#e8e8e8] bg-[#f7f7f7] text-center px-4">
 <span className="text-[#1c1b1f] mb-2 font-bold uppercase tracking-widest text-xs">Session Mismatch</span>
 <p className="text-xs text-[#1c1b1f] max-w-xs leading-relaxed">
 This page requires a Driver account. You appear to be logged in with a different role. Please sign out and log in with a Driver account.
 </p>
 </div>
 ) : loading ? (
 <div className="flex flex-col items-center justify-center py-10">
 <div className="w-8 h-8 rounded-full border-4 border-[#e8e8e8] border-t-slate-800 animate-spin-fast"></div>
 </div>
 ) : routesToRender.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-12 rounded-none border border-slate-100 border-dashed text-center px-4">
 <span className="text-[#9a9a9a] mb-2 font-bold uppercase tracking-widest text-xs">No Routes Recorded</span>
 <p className="text-xs text-[#6b6b6b] max-w-xs leading-relaxed">
 {activeTab === "ACTIVE" 
 ? "You do not have any active routes assigned for today's shifts."
 : "No historical commute route entries found in your driver profile."}
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {routesToRender.map((route: any) => (
 <div key={route.id} className="border border-[#e8e8e8] rounded-none p-5 hover:border-slate-350 transition duration-200">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
 <div className="flex items-start sm:items-center gap-3">
 <div className={`w-10 h-10 rounded-none flex flex-shrink-0 items-center justify-center ${
 route.status === 'COMPLETED' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
 route.status === 'IN_PROGRESS' ? 'bg-[#f7f7f7] text-[#ff4f00]' :
 'bg-[#f7f7f7] text-slate-655'
 }`}>
 {route.status === 'COMPLETED' ? <CheckCircle size={20} /> :
 route.status === 'IN_PROGRESS' ? <PlayCircle size={20} /> :
 <Map size={20} />}
 </div>
 <div className="space-y-0.5">
 <h3 className="font-bold text-[#1c1b1f] text-sm">
 {route.isPickup ? "Morning Pickup (To Office)" : "Evening Drop (To Home)"}
 </h3>
 <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6b6b6b] font-semibold">
 <span className="flex items-center gap-1"><Users size={12} /> {route.stops.length} Stops</span>
 <span>•</span>
 <span>{route.totalDistance.toFixed(1)} km</span>
 {route.shift && (
 <>
 <span>•</span>
 <span className="bg-[#f7f7f7] border border-slate-150 rounded px-1.5 py-0.5 text-[10px] font-bold text-[#6b6b6b] uppercase">
 {route.shift.name} ({route.shift.startTime} - {route.shift.endTime})
 </span>
 </>
 )}
 </div>
 </div>
 </div>
 <div className="flex items-center justify-between md:justify-end gap-4 border-t border-slate-100 pt-4 md:border-0 md:pt-0">
 {activeTab === "HISTORY" && (
 <span className="text-xs font-bold text-slate-450 flex items-center gap-1">
 <Calendar size={13} /> {route.date}
 </span>
 )}
 <span className={`inline-flex items-center px-2.5 py-0.5 rounded-none text-[10px] font-black uppercase tracking-widest ${
 route.status === 'COMPLETED' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
 route.status === 'IN_PROGRESS' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
 'bg-slate-150 text-[#4a4a4a]'
 }`}>
 {route.status.replace("_", " ")}
 </span>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-100 pt-4 mt-4 gap-4">
 <div className="text-xs text-[#6b6b6b] leading-relaxed max-w-xl">
 <strong className="text-[#1c1b1f] font-bold block sm:inline">Manifest sequence:</strong>{" "}
 {route.stops.map((s: any, idx: number) => (
 <span key={s.id}>
 {s.employee?.name} {idx !== route.stops.length - 1 ? "→ " : ""}
 </span>
 ))}
 </div>
 
 {activeTab === "ACTIVE" && (
 <div className="flex-shrink-0">
 {route.status === "PLANNED" || route.status === "ASSIGNED" || route.status === "PENDING" ? (
 <button 
 onClick={() => startRoute(route.id)}
 className="w-full sm:w-auto px-4 py-2 bg-[#1c1b1f] text-white text-xs font-bold rounded-none hover:bg-slate-850 transition cursor-pointer flex items-center justify-center gap-1.5"
 >
 <PlayCircle size={15} /> Start Route
 </button>
 ) : route.status === "IN_PROGRESS" ? (
 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
 <button 
 onClick={() => router.push(`/dashboard/driver/routes`)}
 className="w-full sm:w-auto px-4 py-2 bg-[#ff4f00] text-white text-xs font-bold rounded-none hover:bg-[#e64500] transition cursor-pointer flex items-center justify-center gap-1.5"
 >
 Resume Execution
 </button>
 <button 
 onClick={() => endTrip(route.id)}
 className="w-full sm:w-auto px-4 py-2 bg-[#1c1b1f] text-white text-xs font-bold rounded-none hover:bg-[#1c1b1f] transition cursor-pointer flex items-center justify-center gap-1.5"
 >
 <CheckCircle size={15} /> End Trip
 </button>
 </div>
 ) : (
 <span className="text-xs font-bold text-[#9a9a9a]">Archived</span>
 )}
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 );
}
