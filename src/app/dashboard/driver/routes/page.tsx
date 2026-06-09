"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPin, UserCheck, XCircle, CheckCircle, Navigation } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";

export default function DriverRoutesExecutionPage() {
 const [route, setRoute] = useState<any>(null);
 const [loading, setLoading] = useState(true);
 const router = useRouter();
 const [isExecuting, setIsExecuting] = useState(false);
 const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  useEffect(() => {
  fetchActiveRoute();
  const interval = setInterval(fetchActiveRoute, 15000);
  return () => clearInterval(interval);
  }, []);

 async function fetchActiveRoute() {
 setLoading(true);
 const res = await fetch("/api/driver/routes");
 if (res.ok) {
 const data = await res.json();
  const activeRoute = data.routes?.find((r: any) => r.status === "IN_PROGRESS");
  setRoute(activeRoute || null);
 }
 setLoading(false);
 }

  async function handleStopAction(stopId: string, action: "REACH_STOP" | "BOARD_EMPLOYEE" | "SKIP_STOP") {
    if (isExecuting) return;
    setIsExecuting(true);
    try {
      const res = await fetch("/api/execution/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchActiveRoute();
      } else {
        alert(data.error || "Unable to update stop status.");
      }
    } catch (e) {
      alert("Network connection lost. Please try again.");
    } finally {
      setIsExecuting(false);
    }
  }

  async function completeRoute(routeId: string) {
    if (isExecuting) return;
    setIsExecuting(true);
    try {
      const res = await fetch("/api/execution/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId, action: "COMPLETE_ROUTE" }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard/driver");
      } else {
        alert(data.error || "Unable to complete route.");
      }
    } catch (e) {
      alert("Network connection lost. Please try again.");
    } finally {
      setIsExecuting(false);
    }
  }

  async function startRoute(routeId: string) {
    if (isExecuting) return;
    setIsExecuting(true);
    try {
      const res = await fetch("/api/execution/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId, action: "START_ROUTE" }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchActiveRoute();
      } else {
        alert(data.error || "Unable to start route.");
      }
    } catch (e) {
      alert("Network connection lost. Please try again.");
    } finally {
      setIsExecuting(false);
    }
  }

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-[280px] md:h-[400px] lg:h-[500px]">
 <span className="text-[#9a9a9a]">Loading active route...</span>
 </div>
 );
 }

 if (!route) {
 return (
 <div className="space-y-6">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">Active Route</h1>
 <p className="text-sm text-[#6b6b6b] mt-1">You currently have no active route in progress.</p>
 </div>
 <button 
 onClick={() => router.push("/dashboard/driver")}
 className="px-4 py-2 border border-[#e8e8e8] text-[#6b6b6b] text-sm font-bold rounded-none hover:bg-[#f7f7f7] transition-colors bg-white"
 >
 Go Back
 </button>
 </div>
 </div>
 );
 }

 const allStopsCompleted = route.stops.every((s: any) => s.status === "BOARDED" || s.status === "SKIPPED");

 return (
 <div className="space-y-6 max-w-4xl mx-auto">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div>
 <h1 className="text-2xl font-bold text-[#1c1b1f]">Route Execution</h1>
 <p className="text-sm text-[#6b6b6b] mt-1 flex items-center gap-2">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase ${route.status === 'IN_PROGRESS' ? 'bg-[#f7f7f7] text-[#1c1b1f]' : 'bg-orange-100 text-orange-800'}`}>
 {route.status.replace("_", " ")}
 </span>
 </p>
 </div>
 <div className="flex items-center gap-3">
 {route.status === "IN_PROGRESS" && allStopsCompleted && (
 <button 
 onClick={() => setShowCompleteConfirm(true)}
 className="px-4 py-2 bg-[#1c1b1f] text-white text-sm font-bold rounded-none hover:bg-[#1c1b1f] transition-colors flex items-center gap-2 shadow-xs"
 >
 <CheckCircle size={16} /> End Trip
 </button>
 )}
 </div>
 </div>

 <div className="bg-white border border-[#e8e8e8] rounded-none shadow-xs overflow-hidden">
 <div className="p-4 border-b border-[#e8e8e8] bg-[#f7f7f7]">
 <h2 className="text-xs font-black text-[#6b6b6b] uppercase tracking-widest">
 Passenger Sequence
 </h2>
 </div>
 <div className="p-0">
 <ul className="divide-y divide-slate-100">
 {route.stops.map((stop: any, idx: number) => {
 const isPending = stop.status === "PENDING";
 const isReached = stop.status === "REACHED";
 const isCompleted = stop.status === "BOARDED" || stop.status === "SKIPPED";
 
 return (
 <li key={stop.id} className={`p-6 transition-colors ${isCompleted ? 'bg-[#f7f7f7]/50' : 'bg-white'}`}>
 <div className="flex items-start gap-4">
 <div className="flex flex-col items-center mt-1">
 <div className={`w-8 h-8 rounded-none flex items-center justify-center text-sm font-bold shadow-xs ${
 isCompleted ? 'bg-slate-200 text-[#6b6b6b]' : 
 isReached ? 'bg-[#f7f7f7] text-[#1c1b1f] border-2 border-[#1c1b1f]' : 
 'bg-[#1c1b1f] text-white'
 }`}>
 {stop.stopOrder}
 </div>
 {idx !== route.stops.length - 1 && (
 <div className={`w-0.5 h-16 my-1 ${isCompleted ? 'bg-slate-200' : 'bg-slate-200'}`} />
 )}
 </div>

 <div className="flex-1">
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
 <div>
 <h3 className={`text-lg font-bold ${isCompleted ? 'text-[#6b6b6b] line-through decoration-slate-300' : 'text-[#1c1b1f]'}`}>
 {stop.employee?.name}
 </h3>
 <p className="text-sm text-[#6b6b6b] mt-1 flex items-start gap-1">
 <MapPin size={14} className="mt-0.5 flex-shrink-0" />
 <span>{stop.employee?.address}</span>
 </p>
 <p className="text-sm font-medium text-[#6b6b6b] mt-1">
 📞 {stop.employee?.phone}
 </p>
 </div>
 
 <div className="text-right flex flex-col items-end gap-2">
 <span className={`inline-flex items-center px-2.5 py-0.5 rounded-none text-[10px] font-black tracking-widest uppercase ${
 stop.status === 'BOARDED' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
 stop.status === 'SKIPPED' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
 stop.status === 'REACHED' ? 'bg-[#f7f7f7] text-[#1c1b1f]' :
 'bg-[#f7f7f7] text-[#6b6b6b]'
 }`}>
 {stop.status}
 </span>
 
 {stop.expectedTime && !isCompleted && (
 <span className="text-xs font-semibold text-[#9a9a9a]">
 Expected: {new Date(stop.expectedTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
 </span>
 )}
 
 {stop.driverDelayMins > 0 && (
 <span className="text-xs font-bold text-[#1c1b1f]">
 Driver Late: {stop.driverDelayMins}m
 </span>
 )}
 {stop.employeeDelayMins > 0 && (
 <span className="text-xs font-bold text-[#1c1b1f]">
 Emp Late: {stop.employeeDelayMins}m
 </span>
 )}
 </div>
 </div>

 {/* Action Buttons */}
 {!isCompleted && route.status === "IN_PROGRESS" && (
 <div className="mt-5 flex items-center gap-3 bg-[#f7f7f7] p-3 rounded-none border border-slate-100">
 <button
 onClick={() => handleStopAction(stop.id, "BOARD_EMPLOYEE")}
 className="px-4 py-2 bg-[#1c1b1f] text-white text-sm font-bold rounded-none hover:bg-[#1c1b1f] transition-all flex items-center gap-2"
 >
 <UserCheck size={16} /> Mark Boarded
 </button>
 <button
 onClick={() => handleStopAction(stop.id, "SKIP_STOP")}
 className="px-4 py-2 bg-white border border-[#e8e8e8] text-[#1c1b1f] text-sm font-bold rounded-none hover:bg-[#f7f7f7] transition-all flex items-center gap-2 ml-auto"
 >
 <XCircle size={16} /> Skip Passenger
 </button>
 </div>
 )}
 </div>
 </div>
 </li>
 );
 })}
 </ul>
 </div>
 </div>

 <ConfirmModal
  isOpen={showCompleteConfirm}
  onClose={() => setShowCompleteConfirm(false)}
  onConfirm={() => {
    setShowCompleteConfirm(false);
    completeRoute(route.id);
  }}
  title="Complete Route"
  message="Are you sure you want to complete this route?"
  confirmText="Complete Route"
 />
 </div>
 );
}
