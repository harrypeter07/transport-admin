"use client";

import { useState, useEffect } from "react";
import { Map, Clock, PlayCircle, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DriverDashboardPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchRoutes();
  }, []);

  async function fetchRoutes() {
    const res = await fetch("/api/driver/routes");
    if (res.ok) {
      const data = await res.json();
      setRoutes(data.routes || []);
    }
    setLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Driver Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            View your upcoming shifts and assigned routes for today.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">
            Today's Assigned Routes
          </h2>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10">
              <span className="text-slate-400">Loading routes...</span>
            </div>
          ) : routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-lg border border-slate-100 border-dashed">
              <span className="text-slate-400 mb-2">No assigned routes</span>
              <p className="text-sm text-slate-500">Your assigned routes will appear here once dispatched.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {routes.map((route: any) => (
                <div key={route.id} className="border border-slate-200 rounded-lg p-5 hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        route.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' :
                        route.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-600' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {route.status === 'COMPLETED' ? <CheckCircle size={20} /> :
                         route.status === 'IN_PROGRESS' ? <PlayCircle size={20} /> :
                         <Map size={20} />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">
                          {route.isPickup ? "Pickup Route" : "Drop Route"}
                        </h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock size={12} /> {route.stops.length} Stops • {route.totalDistance.toFixed(1)} km
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        route.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' :
                        route.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {route.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
                    <div className="text-sm text-slate-600">
                      <strong>First Stop:</strong> {route.stops[0]?.employee?.address?.substring(0, 30)}...
                    </div>
                    
                    {route.status === "PLANNED" || route.status === "ASSIGNED" || route.status === "PENDING" ? (
                      <button 
                        onClick={() => startRoute(route.id)}
                        className="px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2"
                      >
                        <PlayCircle size={16} /> Start Route
                      </button>
                    ) : route.status === "IN_PROGRESS" ? (
                      <button 
                        onClick={() => router.push(`/dashboard/driver/routes`)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                      >
                        Resume Execution
                      </button>
                    ) : (
                      <span className="text-sm font-bold text-slate-400">Completed</span>
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
