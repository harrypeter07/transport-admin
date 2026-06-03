"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Route, useTransportStore } from "@/store/useTransportStore";
import { X, Truck, Users, Route as RouteIcon, Clock, BarChart3 } from "lucide-react";

const GoogleMapView = dynamic(() => import("./GoogleMapView"), { ssr: false });

function findBestMatch(
  currentRoute: Route,
  optimizedRoutes: Route[]
): Route | null {
  if (currentRoute.stops.length === 0 || optimizedRoutes.length === 0) return null;
  const empIds = new Set(currentRoute.stops.map((s) => s.employeeId));
  if (empIds.size === 0) return null;

  let best: Route | null = null;
  let bestOverlap = 0;

  for (const opt of optimizedRoutes) {
    const overlap = opt.stops.filter((s) => empIds.has(s.employeeId)).length;
    if (overlap > bestOverlap && overlap > 0) {
      bestOverlap = overlap;
      best = opt;
    }
  }
  return best;
}

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  optimizedRoutes: Route[];
}

export default function CompareModal({ isOpen, onClose, date, optimizedRoutes }: CompareModalProps) {
  const [currentRoutes, setCurrentRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurrentId, setSelectedCurrentId] = useState<string | null>(null);
  const [selectedOptimizedId, setSelectedOptimizedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSelectedCurrentId(null);
    setSelectedOptimizedId(null);

    Promise.all([
      fetch(`/api/optimization/excel-routes?date=${date}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/maps-key").then((r) => r.json()),
    ])
      .then(([routesData, settingsData, keyData]) => {
        if (routesData.error) {
          setError(routesData.details ? `${routesData.error} — ${routesData.details}` : routesData.error);
          setCurrentRoutes([]);
        } else {
          setCurrentRoutes(routesData.routes || []);
        }
        setSettings(settingsData);
        setApiKey(keyData.key || "");
      })
      .catch(() => {
        setError("Failed to load comparison data");
      })
      .finally(() => setLoading(false));
  }, [isOpen, date]);

  const handleSelectCurrent = (id: string | null) => {
    if (id === selectedCurrentId) {
      setSelectedCurrentId(null);
      setSelectedOptimizedId(null);
      return;
    }
    setSelectedCurrentId(id);
    if (id) {
      const route = currentRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, optimizedRoutes);
        setSelectedOptimizedId(match?.id || null);
      }
    } else {
      setSelectedOptimizedId(null);
    }
  };

  const handleSelectOptimized = (id: string | null) => {
    if (id === selectedOptimizedId) {
      setSelectedOptimizedId(null);
      setSelectedCurrentId(null);
      return;
    }
    setSelectedOptimizedId(id);
    if (id) {
      const route = optimizedRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, currentRoutes);
        setSelectedCurrentId(match?.id || null);
      }
    } else {
      setSelectedCurrentId(null);
    }
  };

  const depotLat = settings?.defaultDepotLat ?? 21.0625;
  const depotLng = settings?.defaultDepotLng ?? 79.0526;
  const depotName = settings?.depotName ?? "Depot";

  const currentStats = useMemo(() => {
    const routeCount = currentRoutes.length;
    const cabCount = routeCount;
    const empCount = currentRoutes.reduce((s, r) => s + r.stops.length, 0);
    const totalDist = Math.round(currentRoutes.reduce((s, r) => s + (r.totalDistance || 0), 0) * 10) / 10;
    const totalDur = currentRoutes.reduce((s, r) => s + (r.totalDuration || 0), 0);
    return { routeCount, cabCount, empCount, totalDist, totalDur };
  }, [currentRoutes]);

  const optimizedStats = useMemo(() => {
    const routeCount = optimizedRoutes.length;
    const cabCount = routeCount;
    const empCount = optimizedRoutes.reduce((s, r) => s + r.stops.length, 0);
    const totalDist = Math.round(optimizedRoutes.reduce((s, r) => s + (r.totalDistance || 0), 0) * 10) / 10;
    const totalDur = optimizedRoutes.reduce((s, r) => s + (r.totalDuration || 0), 0);
    return { routeCount, cabCount, empCount, totalDist, totalDur };
  }, [optimizedRoutes]);

  const savings = useMemo(() => {
    return {
      cabs: optimizedStats.cabCount - currentStats.cabCount,
      distance: Math.round((currentStats.totalDist - optimizedStats.totalDist) * 10) / 10,
      duration: optimizedStats.totalDur - currentStats.totalDur,
    };
  }, [currentStats, optimizedStats]);

  const selectedCurrent = useMemo(
    () => currentRoutes.find((r) => r.id === selectedCurrentId) || null,
    [currentRoutes, selectedCurrentId]
  );
  const selectedOptimized = useMemo(
    () => optimizedRoutes.find((r) => r.id === selectedOptimizedId) || null,
    [optimizedRoutes, selectedOptimizedId]
  );

  const canCompare = currentRoutes.length > 0 && optimizedRoutes.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl border border-[#e8e8e8]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#e8e8e8] bg-white">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1c1b1f]" />
            <h2 className="text-sm font-bold text-[#1c1b1f] tracking-tight">
              Compare: Current vs Optimized Routes
            </h2>
            <span className="text-[9px] text-[#9a9a9a] font-mono ml-2">{date}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#f7f7f7] transition-colors border border-transparent hover:border-[#e8e8e8]"
          >
            <X className="w-4 h-4 text-[#6b6b6b]" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs font-bold text-[#9a9a9a]">
            Loading comparison data...
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Maps Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-b border-[#e8e8e8]">
              {/* LEFT: Current Routes */}
              <div className="flex flex-col border-r border-[#e8e8e8]">
                <div className="px-4 py-2 bg-[#fafafa] border-b border-[#e8e8e8] flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#1c1b1f] rounded-full" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a4a4a]">
                    Current Routes
                  </span>
                  <span className="text-[10px] text-[#9a9a9a] ml-auto font-mono">
                    {currentStats.routeCount} routes
                  </span>
                </div>
                <div className="h-[320px]">
                  {currentRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={currentRoutes}
                      selectedRouteId={selectedCurrentId}
                      onSelectRoute={handleSelectCurrent}
                      mode="OPTIMIZER"
                      depotLat={depotLat}
                      depotLng={depotLng}
                      depotName={depotName}
                      apiKey={apiKey}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#f7f7f7] flex-col gap-2 px-6 text-center">
                      <div className="text-xs font-bold text-[#9a9a9a]">No current routes for {date}</div>
                      <div className="text-[10px] text-[#b0b0b0]">Run optimization and apply results to create a baseline.</div>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Optimized Routes */}
              <div className="flex flex-col">
                <div className="px-4 py-2 bg-[#fafafa] border-b border-[#e8e8e8] flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#059669] rounded-full" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a4a4a]">
                    Optimized Routes
                  </span>
                  <span className="text-[10px] text-[#9a9a9a] ml-auto font-mono">
                    {optimizedStats.routeCount} routes
                  </span>
                </div>
                <div className="h-[320px]">
                  {optimizedRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={optimizedRoutes}
                      selectedRouteId={selectedOptimizedId}
                      onSelectRoute={handleSelectOptimized}
                      mode="OPTIMIZER"
                      depotLat={depotLat}
                      depotLng={depotLng}
                      depotName={depotName}
                      apiKey={apiKey}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#f7f7f7] text-xs text-[#9a9a9a] font-medium">
                      Run optimization first to see optimized routes
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Selected Route Detail */}
            {(selectedCurrent || selectedOptimized) && (
              <div className="px-4 py-3 bg-[#fafafa] border-b border-[#e8e8e8]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Current Route</span>
                      {selectedCurrent && (
                        <button
                          onClick={() => { setSelectedCurrentId(null); setSelectedOptimizedId(null); }}
                          className="text-[11px] px-2 py-0.5 border border-[#d0d0d0] text-[#9a9a9a] hover:text-[#dc2626] hover:border-[#dc2626] uppercase font-bold tracking-wider cursor-pointer bg-white"
                        >
                          × Clear
                        </button>
                      )}
                    </div>
                    {selectedCurrent ? (
                      <div className="mt-1 text-xs text-[#4a4a4a] font-mono">
                        <div className="flex items-center gap-2">
                          <span>{selectedCurrent.cab?.vehicleNumber} — {selectedCurrent.stops.length} stops</span>
                        </div>
                        <div>{Math.round(selectedCurrent.totalDistance)} km · {selectedCurrent.totalDuration} min</div>
                        <div className="mt-1.5 space-y-0.5 max-h-[120px] overflow-y-auto">
                          {selectedCurrent.stops.map((s, i) => (
                            <div key={s.id} className="flex items-start gap-1.5 text-[10px] text-[#6b6b6b]">
                              <span className="text-[#9a9a9a] mt-0.5 shrink-0">{i + 1}.</span>
                              <span className="truncate">{s.employee?.name || s.employee?.email}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-[#9a9a9a] italic">No equivalent current route found</div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Optimized Route</span>
                      {selectedOptimized && (
                        <button
                          onClick={() => { setSelectedOptimizedId(null); setSelectedCurrentId(null); }}
                          className="text-[11px] px-2 py-0.5 border border-[#d0d0d0] text-[#9a9a9a] hover:text-[#dc2626] hover:border-[#dc2626] uppercase font-bold tracking-wider cursor-pointer bg-white"
                        >
                          × Clear
                        </button>
                      )}
                    </div>
                    {selectedOptimized ? (
                      <div className="mt-1 text-xs text-[#4a4a4a] font-mono">
                        <div className="flex items-center gap-2">
                          <span>{selectedOptimized.cab?.vehicleNumber} — {selectedOptimized.stops.length} stops</span>
                        </div>
                        <div>{Math.round(selectedOptimized.totalDistance)} km · {selectedOptimized.totalDuration} min</div>
                        <div className="mt-1.5 space-y-0.5 max-h-[120px] overflow-y-auto">
                          {selectedOptimized.stops.map((s, i) => (
                            <div key={s.id} className="flex items-start gap-1.5 text-[10px] text-[#6b6b6b]">
                              <span className="text-[#9a9a9a] mt-0.5 shrink-0">{i + 1}.</span>
                              <span className="truncate">{s.employee?.name || s.employee?.email}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-[#9a9a9a] italic">No equivalent optimized route found</div>
                    )}
                  </div>
                </div>
                {selectedCurrent && selectedOptimized && (
                  <div className="mt-2 pt-2 border-t border-[#e8e8e8] flex gap-4 text-[11px] font-mono">
                    <span className={selectedOptimized.totalDistance < selectedCurrent.totalDistance ? "text-[#059669]" : "text-[#dc2626]"}>
                      Dist: {Math.round((selectedCurrent.totalDistance - selectedOptimized.totalDistance) * 10) / 10} km
                    </span>
                    <span className={selectedOptimized.totalDuration < selectedCurrent.totalDuration ? "text-[#059669]" : "text-[#dc2626]"}>
                      Dur: {selectedCurrent.totalDuration - selectedOptimized.totalDuration} min
                    </span>
                    <span className={selectedOptimized.stops.length >= selectedCurrent.stops.length ? "text-[#059669]" : "text-[#dc2626]"}>
                      Stops: {selectedOptimized.stops.length - selectedCurrent.stops.length}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Stats Section — only when both sides have data */}
            {canCompare ? (
              <div className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="border-b border-[#e8e8e8]">
                        <th className="text-left py-2 pr-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Metric</th>
                        <th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Current</th>
                        <th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#059669]">Optimized</th>
                        <th className="text-right py-2 pl-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Savings</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Truck className="w-3 h-3" /> Routes / Cabs</td>
                        <td className="text-right py-2 px-4">{currentStats.routeCount}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.routeCount}</td>
                        <td className={`text-right py-2 pl-4 ${savings.cabs <= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>
                          {savings.cabs === 0 ? "—" : `${savings.cabs > 0 ? "+" : ""}${savings.cabs}`}
                        </td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Users className="w-3 h-3" /> Employees</td>
                        <td className="text-right py-2 px-4">{currentStats.empCount}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.empCount}</td>
                        <td className="text-right py-2 pl-4 text-[#9a9a9a]">—</td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><RouteIcon className="w-3 h-3" /> Total Distance</td>
                        <td className="text-right py-2 px-4">{currentStats.totalDist} km</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.totalDist} km</td>
                        <td className={`text-right py-2 pl-4 ${savings.distance >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>
                          {savings.distance === 0 ? "—" : `${savings.distance > 0 ? "-" : "+"}${Math.abs(savings.distance)} km`}
                        </td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Clock className="w-3 h-3" /> Total Duration</td>
                        <td className="text-right py-2 px-4">{currentStats.totalDur} min</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.totalDur} min</td>
                        <td className={`text-right py-2 pl-4 ${savings.duration <= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>
                          {savings.duration === 0 ? "—" : `${savings.duration < 0 ? "-" : "+"}${Math.abs(savings.duration)} min`}
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="bg-[#f7f7f7] border border-[#e8e8e8] px-4 py-3 text-center">
                  <p className="text-xs font-bold text-[#9a9a9a]">Comparison data unavailable</p>
                  <p className="text-[10px] text-[#b0b0b0] mt-1">
                    {currentRoutes.length === 0 && optimizedRoutes.length === 0
                      ? "No current routes or optimized preview for this date."
                      : currentRoutes.length === 0
                        ? "No current routes for this date. Apply optimization results first."
                        : "No optimized preview for this date. Run optimization first."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="px-4 py-2 bg-[#fff7ed] border-t border-[#e8e8e8] text-[10px] text-[#9a3412] font-medium">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
