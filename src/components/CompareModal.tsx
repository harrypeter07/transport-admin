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
  optimizationPlans?: any | null;
  fallbackRoutes: Route[];
}

export default function CompareModal({ isOpen, onClose, date, optimizationPlans, fallbackRoutes }: CompareModalProps) {
  const [currentRoutes, setCurrentRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurrentId, setSelectedCurrentId] = useState<string | null>(null);
  const [selectedOptimizedId, setSelectedOptimizedId] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState<string>("ALL");
  const [selectedMode, setSelectedMode] = useState<"PICKUP" | "DROP" | "AUTO">("AUTO");
  const [selectedStrategy, setSelectedStrategy] = useState<"MAXIMIZE_UTILIZATION" | "MINIMIZE_TIME" | "BALANCED">("BALANCED");
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
      const route = filteredCurrentRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, filteredOptimizedRoutes);
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
      const route = filteredOptimizedRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, filteredCurrentRoutes);
        setSelectedCurrentId(match?.id || null);
      }
    } else {
      setSelectedCurrentId(null);
    }
  };

  const depotLat = settings?.defaultDepotLat ?? 21.0625;
  const depotLng = settings?.defaultDepotLng ?? 79.0526;
  const depotName = settings?.depotName ?? "Depot";

  const optimizedRoutes = useMemo((): Route[] => {
    if (optimizationPlans && optimizationPlans[selectedStrategy]) {
      return optimizationPlans[selectedStrategy].routes || fallbackRoutes;
    }
    return fallbackRoutes;
  }, [optimizationPlans, selectedStrategy, fallbackRoutes]);

  // Auto-detect direction from optimized routes, then filter Excel baseline to match
  const autoPickupMode = useMemo(() => {
    if (optimizedRoutes.length === 0) return true;
    const pickupCount = optimizedRoutes.filter((r) => r.isPickup).length;
    return pickupCount >= optimizedRoutes.length / 2;
  }, [optimizedRoutes]);

  const activeIsPickup = selectedMode === "AUTO" ? autoPickupMode : selectedMode === "PICKUP";

  const allShifts = useMemo(() => {
    const shiftMap = new Map<string, string>();
    currentRoutes.forEach(r => { if (r.shift) shiftMap.set(r.shiftId || r.shift.id, r.shift.name); });
    optimizedRoutes.forEach(r => { if (r.shift) shiftMap.set(r.shiftId || r.shift.id, r.shift.name); });
    return Array.from(shiftMap.entries()).map(([id, name]) => ({ id, name }));
  }, [currentRoutes, optimizedRoutes]);

  const filteredCurrentRoutes = useMemo(() => {
    if (currentRoutes.length === 0) return [];
    return currentRoutes.filter((r) => 
      r.isPickup === activeIsPickup &&
      (selectedShift === "ALL" || r.shiftId === selectedShift || r.shift?.id === selectedShift)
    );
  }, [currentRoutes, activeIsPickup, selectedShift]);

  const filteredOptimizedRoutes = useMemo(() => {
    if (optimizedRoutes.length === 0) return [];
    return optimizedRoutes.filter((r) => 
      r.isPickup === activeIsPickup &&
      (selectedShift === "ALL" || r.shiftId === selectedShift || r.shift?.id === selectedShift)
    );
  }, [optimizedRoutes, activeIsPickup, selectedShift]);

  const currentStats = useMemo(() => {
    const routeCount = filteredCurrentRoutes.length;
    const cabCount = routeCount;
    const empCount = filteredCurrentRoutes.reduce((s, r) => s + r.stops.length, 0);
    const totalDist = Math.round(filteredCurrentRoutes.reduce((s, r) => s + (r.totalDistance || 0), 0) * 10) / 10;
    const totalDur = filteredCurrentRoutes.reduce((s, r) => s + (r.totalDuration || 0), 0);
    return { routeCount, cabCount, empCount, totalDist, totalDur };
  }, [filteredCurrentRoutes]);

  const optimizedStats = useMemo(() => {
    const routeCount = filteredOptimizedRoutes.length;
    const cabCount = routeCount;
    const empCount = filteredOptimizedRoutes.reduce((s, r) => s + r.stops.length, 0);
    const totalDist = Math.round(filteredOptimizedRoutes.reduce((s, r) => s + (r.totalDistance || 0), 0) * 10) / 10;
    const totalDur = filteredOptimizedRoutes.reduce((s, r) => s + (r.totalDuration || 0), 0);
    return { routeCount, cabCount, empCount, totalDist, totalDur };
  }, [filteredOptimizedRoutes]);

  const savings = useMemo(() => {
    return {
      cabs: optimizedStats.cabCount - currentStats.cabCount,
      distance: Math.round((currentStats.totalDist - optimizedStats.totalDist) * 10) / 10,
      duration: optimizedStats.totalDur - currentStats.totalDur,
    };
  }, [currentStats, optimizedStats]);

  const selectedCurrent = useMemo(
    () => filteredCurrentRoutes.find((r) => r.id === selectedCurrentId) || null,
    [filteredCurrentRoutes, selectedCurrentId]
  );
  const selectedOptimized = useMemo(
    () => filteredOptimizedRoutes.find((r) => r.id === selectedOptimizedId) || null,
    [filteredOptimizedRoutes, selectedOptimizedId]
  );

  const canCompare = filteredCurrentRoutes.length > 0 && filteredOptimizedRoutes.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl border border-[#e8e8e8]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#e8e8e8] bg-white">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1c1b1f]" />
            <h2 className="text-sm font-bold text-[#1c1b1f] tracking-tight">
              Compare: Excel Baseline vs Optimized Routes
            </h2>
            <span className="text-[9px] text-[#9a9a9a] font-mono ml-2 mr-2">{date}</span>
            <div className="h-4 w-px bg-[#e8e8e8] mx-1" />
            {optimizationPlans && (
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value as any)}
                className="text-xs font-bold text-[#059669] bg-[#ecfdf5] border border-[#a7f3d0] rounded-none px-2 py-0.5 ml-2 cursor-pointer outline-none focus:border-[#34d399]"
              >
                <option value="MAXIMIZE_UTILIZATION">Max Utilization</option>
                <option value="MINIMIZE_TIME">Min Time</option>
                <option value="BALANCED">Balanced</option>
              </select>
            )}
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="text-xs font-medium text-[#4a4a4a] bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-2 py-0.5 ml-2 cursor-pointer outline-none focus:border-slate-400"
            >
              <option value="ALL">All Shifts</option>
              {allShifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value as "AUTO" | "PICKUP" | "DROP")}
              className="text-xs font-medium text-[#4a4a4a] bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-2 py-0.5 ml-1 cursor-pointer outline-none focus:border-slate-400"
            >
              <option value="AUTO">Auto Mode</option>
              <option value="PICKUP">Pickup Only</option>
              <option value="DROP">Drop Only</option>
            </select>
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
                    Excel Baseline
                  </span>
                  <span className="text-[10px] text-[#9a9a9a] font-mono ml-1">
                    ({activeIsPickup ? "Pickup" : "Drop"})
                  </span>
                  <span className="text-[10px] text-[#9a9a9a] ml-auto font-mono">
                    {currentStats.routeCount} routes
                  </span>
                </div>
                <div className="h-[320px]">
                  {filteredCurrentRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={filteredCurrentRoutes}
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
                      <div className="text-xs font-bold text-[#9a9a9a]">No Excel baseline routes available</div>
                      <div className="text-[10px] text-[#b0b0b0]">The Excel baseline could not be loaded. Check data/excel_routes.json.</div>
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
                  {filteredOptimizedRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={filteredOptimizedRoutes}
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
                      <span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Excel Route</span>
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
                        <th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Excel Baseline</th>
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
                    {filteredCurrentRoutes.length === 0 && filteredOptimizedRoutes.length === 0
                      ? "No routes available for the selected filters."
                      : filteredCurrentRoutes.length === 0
                        ? "Excel baseline not loaded or no baseline for this shift."
                        : "No optimized routes for this shift/mode. Run optimization first."}
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
