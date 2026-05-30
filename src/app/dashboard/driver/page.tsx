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

  const routesToRender = activeTab === "ACTIVE" ? activeRoutes : historyRoutes;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Driver Portal</h1>
          <p className="text-sm text-slate-500 mt-1">
            Access your active shift worksheets and log sheets.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white">
          <button
            onClick={() => setActiveTab("ACTIVE")}
            className={`px-4 py-2 text-xs font-bold rounded-md cursor-pointer transition ${
              activeTab === "ACTIVE"
                ? "bg-slate-950 text-white shadow-xs"
                : "text-slate-650 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Today's Assignments
          </button>
          <button
            onClick={() => setActiveTab("HISTORY")}
            className={`px-4 py-2 text-xs font-bold rounded-md cursor-pointer transition ${
              activeTab === "HISTORY"
                ? "bg-slate-950 text-white shadow-xs"
                : "text-slate-650 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Route History
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
            {activeTab === "ACTIVE" ? "Current Assignments" : "Historical Commute Records"}
          </h2>
        </div>
        <div className="p-6">
          {sessionError ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-amber-200 bg-amber-50 text-center px-4">
              <span className="text-amber-700 mb-2 font-bold uppercase tracking-widest text-xs">Session Mismatch</span>
              <p className="text-xs text-amber-700 max-w-xs leading-relaxed">
                This page requires a Driver account. You appear to be logged in with a different role. Please sign out and log in with a Driver account.
              </p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin"></div>
            </div>
          ) : routesToRender.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-slate-100 border-dashed text-center px-4">
              <span className="text-slate-400 mb-2 font-bold uppercase tracking-widest text-xs">No Routes Recorded</span>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                {activeTab === "ACTIVE" 
                  ? "You do not have any active routes assigned for today's shifts."
                  : "No historical commute route entries found in your driver profile."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {routesToRender.map((route: any) => (
                <div key={route.id} className="border border-slate-200 rounded-xl p-5 hover:border-slate-350 transition duration-200">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex flex-shrink-0 items-center justify-center ${
                        route.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' :
                        route.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-600' :
                        'bg-slate-100 text-slate-655'
                      }`}>
                        {route.status === 'COMPLETED' ? <CheckCircle size={20} /> :
                         route.status === 'IN_PROGRESS' ? <PlayCircle size={20} /> :
                         <Map size={20} />}
                      </div>
                      <div className="space-y-0.5">
                        <h3 className="font-bold text-slate-900 text-sm">
                          {route.isPickup ? "Morning Pickup (To Office)" : "Evening Drop (To Home)"}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 font-semibold">
                          <span className="flex items-center gap-1"><Users size={12} /> {route.stops.length} Stops</span>
                          <span>•</span>
                          <span>{route.totalDistance.toFixed(1)} km</span>
                          {route.shift && (
                            <>
                              <span>•</span>
                              <span className="bg-slate-100 border border-slate-150 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
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
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        route.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                        route.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-150 text-slate-700'
                      }`}>
                        {route.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-100 pt-4 mt-4 gap-4">
                    <div className="text-xs text-slate-600 leading-relaxed max-w-xl">
                      <strong className="text-slate-800 font-bold block sm:inline">Manifest sequence:</strong>{" "}
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
                            className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-850 transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <PlayCircle size={15} /> Start Route
                          </button>
                        ) : route.status === "IN_PROGRESS" ? (
                          <button 
                            onClick={() => router.push(`/dashboard/driver/routes`)}
                            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            Resume Execution
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Archived</span>
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
