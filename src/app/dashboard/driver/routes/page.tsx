"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPin, UserCheck, XCircle, CheckCircle, Navigation } from "lucide-react";

export default function DriverRoutesExecutionPage() {
  const [route, setRoute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchActiveRoute();
  }, []);

  async function fetchActiveRoute() {
    setLoading(true);
    const res = await fetch("/api/driver/routes");
    if (res.ok) {
      const data = await res.json();
      const inProgress = data.routes?.find((r: any) => r.status === "IN_PROGRESS");
      setRoute(inProgress || null);
    }
    setLoading(false);
  }

  async function handleStopAction(stopId: string, action: "REACH_STOP" | "BOARD_EMPLOYEE" | "SKIP_STOP") {
    const res = await fetch("/api/execution/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stopId, action }),
    });
    if (res.ok) {
      fetchActiveRoute();
    } else {
      alert("Failed to update stop status");
    }
  }

  async function completeRoute(routeId: string) {
    if (!confirm("Are you sure you want to complete this route?")) return;
    const res = await fetch("/api/execution/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeId, action: "COMPLETE_ROUTE" }),
    });
    if (res.ok) {
      router.push("/dashboard/driver");
    } else {
      alert("Failed to complete route");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <span className="text-slate-400">Loading active route...</span>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Active Route</h1>
            <p className="text-sm text-slate-500 mt-1">You currently have no active route in progress.</p>
          </div>
          <button 
            onClick={() => router.push("/dashboard/driver")}
            className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors bg-white"
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Route Execution</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-700 tracking-widest uppercase">
              In Progress
            </span>
            Started at {new Date(route.startedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {allStopsCompleted && (
            <button 
              onClick={() => completeRoute(route.id)}
              className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 shadow-xs"
            >
              <CheckCircle size={16} /> End Trip
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
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
                <li key={stop.id} className={`p-6 transition-colors ${isCompleted ? 'bg-slate-50/50' : 'bg-white'}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center mt-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-xs ${
                        isCompleted ? 'bg-slate-200 text-slate-500' : 
                        isReached ? 'bg-blue-100 text-blue-700 border-2 border-blue-500' : 
                        'bg-slate-900 text-white'
                      }`}>
                        {stop.stopOrder}
                      </div>
                      {idx !== route.stops.length - 1 && (
                        <div className={`w-0.5 h-16 my-1 ${isCompleted ? 'bg-slate-200' : 'bg-slate-200'}`} />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className={`text-lg font-bold ${isCompleted ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>
                            {stop.employee?.name}
                          </h3>
                          <p className="text-sm text-slate-500 mt-1 flex items-start gap-1">
                            <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{stop.employee?.address}</span>
                          </p>
                          <p className="text-sm font-medium text-slate-600 mt-1">
                            📞 {stop.employee?.phone}
                          </p>
                        </div>
                        
                        <div className="text-right flex flex-col items-end gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase ${
                            stop.status === 'BOARDED' ? 'bg-emerald-100 text-emerald-700' :
                            stop.status === 'SKIPPED' ? 'bg-red-100 text-red-700' :
                            stop.status === 'REACHED' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {stop.status}
                          </span>
                          
                          {stop.expectedTime && !isCompleted && (
                            <span className="text-xs font-semibold text-slate-400">
                              Expected: {new Date(stop.expectedTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          )}
                          
                          {stop.driverDelayMins > 0 && (
                            <span className="text-xs font-bold text-amber-600">
                              Driver Late: {stop.driverDelayMins}m
                            </span>
                          )}
                          {stop.employeeDelayMins > 0 && (
                            <span className="text-xs font-bold text-red-600">
                              Emp Late: {stop.employeeDelayMins}m
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {!isCompleted && (
                        <div className="mt-5 flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                          {isPending && (
                            <button
                              onClick={() => handleStopAction(stop.id, "REACH_STOP")}
                              className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-all flex items-center gap-2"
                            >
                              <Navigation size={16} /> Reached Stop
                            </button>
                          )}

                          {(isPending || isReached) && (
                            <>
                              <button
                                onClick={() => handleStopAction(stop.id, "BOARD_EMPLOYEE")}
                                className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-2"
                              >
                                <UserCheck size={16} /> Mark Boarded
                              </button>
                              <button
                                onClick={() => handleStopAction(stop.id, "SKIP_STOP")}
                                className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-lg hover:bg-red-50 transition-all flex items-center gap-2 ml-auto"
                              >
                                <XCircle size={16} /> Skip Passenger
                              </button>
                            </>
                          )}
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
    </div>
  );
}
