"use client";

import { useState, useEffect } from "react";
import { Map, Clock, Navigation, CheckCircle, Car } from "lucide-react";

export default function EmployeeRoutePage() {
  const [routeData, setRouteData] = useState<any>(null);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoute();
    const interval = setInterval(() => {
      fetchRoute();
    }, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  async function fetchRoute() {
    const res = await fetch("/api/employee/route");
    if (res.ok) {
      const data = await res.json();
      setRouteData(data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <span className="text-slate-400">Loading your route...</span>
      </div>
    );
  }

  if (!routeData?.route) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">My Route</h1>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs h-[500px] flex items-center justify-center">
          <div className="text-center">
            <span className="text-slate-400 block mb-2 font-bold uppercase tracking-widest text-xs">No Active Route</span>
            <p className="text-sm text-slate-500">You do not have a route scheduled or in progress for today.</p>
          </div>
        </div>
      </div>
    );
  }

  const { route, myStop } = routeData;
  const isInProgress = route.status === "IN_PROGRESS";
  
  // Find current stop driver is heading to
  const nextStopIndex = route.stops.findIndex((s: any) => s.status === "PENDING" || s.status === "REACHED");
  const currentStop = nextStopIndex >= 0 ? route.stops[nextStopIndex] : null;
  const stopsAway = currentStop ? (myStop.stopOrder - currentStop.stopOrder) : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Route Progress</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track your assigned cab and estimated arrival time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status Card */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 flex-1">
            <div className="flex items-center justify-between mb-8">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase ${
                isInProgress ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
              }`}>
                {route.status.replace("_", " ")}
              </span>
              <span className="text-xs font-bold text-slate-500">
                {route.isPickup ? "Home to Office" : "Office to Home"}
              </span>
            </div>

            <div className="text-center py-6">
              <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                {myStop.status === "BOARDED" ? "You are on board" :
                 myStop.status === "SKIPPED" ? "You were skipped" :
                 !isInProgress ? "Waiting for driver..." :
                 myStop.status === "REACHED" ? "Driver has arrived!" :
                 stopsAway === 0 ? "Driver is arriving now!" :
                 `${stopsAway} stop${stopsAway > 1 ? 's' : ''} away`}
              </h2>
              {myStop.expectedTime && !["BOARDED", "SKIPPED"].includes(myStop.status) && (
                <div className="mt-4 flex flex-col items-center gap-1">
                  <p className="text-slate-500 font-medium">
                    Scheduled: {new Date(myStop.expectedTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 border-t border-slate-200">
            {/* Minimal Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2 overflow-hidden flex">
              {route.stops.map((s: any) => {
                let color = "bg-slate-200";
                if (s.status === "BOARDED") color = "bg-emerald-500";
                if (s.status === "SKIPPED") color = "bg-red-500";
                if (s.status === "REACHED") color = "bg-blue-400";
                
                return (
                  <div key={s.id} className={`h-2.5 flex-1 border-r border-white/50 last:border-0 ${color}`} />
                );
              })}
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-400 px-1">
              <span>Start</span>
              <span>Destination</span>
            </div>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Car size={14} /> Vehicle Details
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500">Cab Registration</p>
                <p className="font-bold text-slate-900">{route.cab?.vehicleNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Driver Name</p>
                <p className="font-bold text-slate-900">{route.cab?.driver?.name || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Driver Phone</p>
                <p className="font-bold text-slate-900">{route.cab?.driver?.phone || "N/A"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
