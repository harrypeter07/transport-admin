"use client";

import { useState, useEffect } from "react";
import { Car, Clock, Navigation, CheckCircle, Calendar, User, Phone, MapPin, AlertCircle } from "lucide-react";
import CalendarWidget from "@/components/CalendarWidget";

export default function EmployeeDashboardPage() {
  const [routeData, setRouteData] = useState<any>(null);
  const [calendarData, setCalendarData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

 useEffect(() => {
 fetchDashboardData();
 const interval = setInterval(fetchDashboardData, 30000); // refresh every 30s
 return () => clearInterval(interval);
 }, []);

 async function fetchDashboardData() {
 try {
 const routeRes = await fetch("/api/employee/route");
 if (routeRes.ok) {
 const data = await routeRes.json();
 setRouteData(data);
 }

 const calRes = await fetch("/api/calendar");
 if (calRes.ok) {
 const data = await calRes.json();
 setCalendarData(data);
 }
  } catch (e) {
  setLoadError("Failed to load dashboard data");
  console.error("Error fetching employee dashboard data:", e);
  } finally {
 setLoading(false);
 }
 }

 const todayStr = new Date().toISOString().split("T")[0];
 
 // Check if user is on leave today
 const isOnLeaveToday = calendarData?.leaves?.some((l: any) => 
 l.startDate <= todayStr && l.endDate >= todayStr
 );

 const route = routeData?.route;
 const myStop = routeData?.myStop;
 const isInProgress = route?.status === "IN_PROGRESS";

 // Calculate stops away
 const nextStopIndex = route?.stops?.findIndex((s: any) => s.status === "PENDING" || s.status === "REACHED") ?? -1;
 const currentStop = nextStopIndex >= 0 ? route.stops[nextStopIndex] : null;
 const stopsAway = currentStop && myStop ? (myStop.stopOrder - currentStop.stopOrder) : 0;

 // Filter upcoming holidays
 const upcomingHolidays = calendarData?.holidays
 ?.filter((h: any) => h.date >= todayStr)
 ?.sort((a: any, b: any) => a.date.localeCompare(b.date))
 ?.slice(0, 3) || [];

 return (
  <div className="space-y-6">
  {loadError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">{loadError}</div>}
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
  <div>
  <h1 className="text-2xl font-bold text-[#1c1b1f]">Employee Portal</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">
 Welcome to your transportation hub.
 </p>
 </div>
 </div>

 {isOnLeaveToday && (
 <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-none p-4 flex items-center gap-3 animate-fadeIn">
 <AlertCircle className="w-5 h-5 text-[#6b6b6b] flex-shrink-0" />
 <div className="text-sm text-amber-850">
 <span className="font-bold">Out of Office: </span>
 You are scheduled on approved leave today. You will be automatically excluded from the optimization roster.
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 {/* Main Column */}
 <div className="lg:col-span-2 space-y-6">
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs">
 <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest">
 Next Commute {route ? `(${route.date})` : `(${todayStr})`}
 </h2>
 {route && (
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ${
 isInProgress ? 'bg-[#f7f7f7] text-[#1c1b1f]' : 'bg-slate-150 text-slate-650'
 }`}>
 {route.status}
 </span>
 )}
 </div>

 {loading ? (
 <div className="py-10 text-center text-slate-450 text-xs">Loading route data...</div>
 ) : !route ? (
 <div className="flex flex-col items-center justify-center py-12 bg-[#f7f7f7] rounded-none border border-slate-100 border-dashed text-center px-4">
 <span className="text-[#9a9a9a] mb-2 font-bold uppercase tracking-widest text-xs">No Published Route</span>
 <p className="text-xs text-[#6b6b6b] max-w-xs leading-relaxed">
 You are not assigned to a published route for today. Check back later once administration publishes the fleet plan.
 </p>
 </div>
 ) : (
 <div className="space-y-6">
 <div className="text-center py-4 bg-[#f7f7f7] border border-slate-100 rounded-none">
 <h3 className="text-3xl font-black text-[#1c1b1f] tracking-tight">
 {myStop?.status === "BOARDED" ? "On Board" :
 myStop?.status === "SKIPPED" ? "Skipped" :
 !isInProgress ? "Driver Dispatch Pending" :
 myStop?.status === "REACHED" ? "Cab Arrived!" :
 stopsAway === 0 ? "Cab Arriving Now!" :
 `${stopsAway} Stop${stopsAway > 1 ? 's' : ''} Away`}
 </h3>
 {myStop?.expectedTime && !["BOARDED", "SKIPPED"].includes(myStop?.status) && (
 <p className="text-[#6b6b6b] text-xs font-semibold mt-2 flex items-center justify-center gap-1">
 <Clock size={12} /> Expected Pickup: {new Date(myStop.expectedTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
 </p>
 )}
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {/* Cab & Driver details */}
 <div className="border border-slate-150 rounded-none p-4 flex gap-3 items-start">
 <Car className="text-[#9a9a9a] mt-0.5 flex-shrink-0" size={18} />
 <div className="text-xs space-y-1">
 <span className="font-bold text-[#9a9a9a] uppercase tracking-widest text-[9px] block">Vehicle Details</span>
 <p className="text-sm font-bold text-[#1c1b1f]">{route.cab?.vehicleNumber || "No vehicle assigned"}</p>
 <p className="text-[#6b6b6b]">{route.cab?.vendor || "Vendor details N/A"}</p>
 </div>
 </div>

 <div className="border border-slate-150 rounded-none p-4 flex gap-3 items-start">
 <User className="text-[#9a9a9a] mt-0.5 flex-shrink-0" size={18} />
 <div className="text-xs space-y-1">
 <span className="font-bold text-[#9a9a9a] uppercase tracking-widest text-[9px] block">Driver Details</span>
 <p className="text-sm font-bold text-[#1c1b1f]">{route.cab?.driverName || "Driver details N/A"}</p>
 <p className="text-[#6b6b6b] font-semibold flex items-center gap-1 mt-0.5">
 <Phone size={11} /> {route.cab?.driverPhone || "—"}
 </p>
 </div>
 </div>
 </div>

 {/* Progress bar */}
 <div className="bg-[#f7f7f7] p-4 border border-slate-150 rounded-none">
 <span className="text-[10px] font-black text-[#6b6b6b] uppercase tracking-widest block mb-3">Manifest Progress</span>
 <div className="w-full bg-slate-200 rounded-none h-2 overflow-hidden flex">
 {route.stops.map((s: any) => {
 let color = "bg-slate-200";
 if (s.status === "BOARDED") color = "bg-[#1c1b1f]";
 if (s.status === "SKIPPED") color = "bg-[#1c1b1f]";
 if (s.status === "REACHED") color = "bg-[#1c1b1f]";
 
 return (
 <div key={s.id} className={`h-2 flex-1 border-r border-white last:border-0 ${color}`} />
 );
 })}
 </div>
 <div className="flex justify-between text-[10px] font-bold text-[#9a9a9a] mt-1 px-0.5 uppercase tracking-wide">
 <span>Departure</span>
 <span>MIHAN Depot</span>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Sidebar Column */}
 <div className="space-y-6">
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4">
 Quick Actions
 </h2>
 <div className="flex flex-col gap-2">
 <a href="/dashboard/employee/requests" className="w-full text-center px-4 py-3 rounded-none border border-[#e8e8e8] hover:border-slate-350 hover:bg-[#f7f7f7] transition text-xs font-bold text-[#4a4a4a] block">
 Apply for Leave
 </a>
 <a href="/dashboard/employee/requests" className="w-full text-center px-4 py-3 rounded-none border border-[#e8e8e8] hover:border-slate-350 hover:bg-[#f7f7f7] transition text-xs font-bold text-[#4a4a4a] block">
 Request Time Change
 </a>
 </div>
 </div>

 {/* Upcoming Holidays */}
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 shadow-xs">
 <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest mb-4 flex items-center gap-1.5">
 <Calendar size={15} className="text-[#6b6b6b]" /> Upcoming Holidays
 </h2>
 {upcomingHolidays.length === 0 ? (
 <p className="text-xs text-[#9a9a9a]">No upcoming holidays scheduled.</p>
 ) : (
 <div className="space-y-3">
 {upcomingHolidays.map((h: any) => (
 <div key={h.id} className="flex justify-between items-center text-xs p-2 bg-[#f7f7f7] rounded border border-slate-100">
 <span className="font-bold text-[#1c1b1f]">{h.name}</span>
 <span className="text-[10px] text-[#9a9a9a] font-bold font-mono">{h.date}</span>
 </div>
 ))}
 </div>
 )}
 </div>

 <div className="h-64">
 <CalendarWidget />
 </div>
 </div>
 </div>
 </div>
 );
}
