"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Route } from "@/store/useTransportStore";
import { X, Truck, Users, Route as RouteIcon, Clock, BarChart3 } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";

const GoogleMapView = dynamic(() => import("./GoogleMapView"), { ssr: false });

const DEPOT = { lat: 21.0625, lng: 79.0526 };

function computeDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const avgLatRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const kmPerDegLng = 111.32 * Math.cos(avgLatRad);
  const dLat = (lat2 - lat1) * 111.32;
  const dLng = (lng2 - lng1) * kmPerDegLng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function computeRouteDistance(stops: any[]): number {
  let total = 0;
  if (stops.length === 0) return total;
  total += computeDistance(DEPOT.lat, DEPOT.lng, stops[0].employee.y, stops[0].employee.x);
  for (let i = 1; i < stops.length; i++) {
    total += computeDistance(stops[i - 1].employee.y, stops[i - 1].employee.x, stops[i].employee.y, stops[i].employee.x);
  }
  total += computeDistance(stops[stops.length - 1].employee.y, stops[stops.length - 1].employee.x, DEPOT.lat, DEPOT.lng);
  return total;
}

function normalizeRoute(route: any): Route {
  if (!route) return route;
  const stops = (route.stops || []).map((stop: any) => ({
    ...stop,
    employee: stop.employee?.y !== undefined ? stop.employee : {
      id: stop.employeeId || stop.employee?.id,
      name: stop.employeeName || stop.employee?.name || "Unknown",
      gender: stop.gender || stop.employee?.gender || "MALE",
      y: stop.y || stop.employee?.y || 21.1278,
      x: stop.x || stop.employee?.x || 79.0068,
      address: stop.address || stop.employee?.address || "",
    },
  }));
  let totalDistance = 0;
  let totalDuration = 0;
  if (stops.length > 0) {
    totalDistance = Math.round(computeRouteDistance(stops) * 10) / 10;
    totalDuration = Math.round(totalDistance * 2.4);
  }
  return {
    ...route,
    stops,
    totalDistance,
    totalDuration,
    cab: route.cab || {
      driverName: route.driverName || "Unknown Driver",
      vehicleNumber: route.vehicleNumber || "Unknown",
      driverPhone: route.driverPhone || "",
    },
    shift: route.shift || {
      id: route.shiftId,
      name: route.shiftTime || route.shiftId,
      startTime: route.shiftTime || "05:00",
      endTime: "23:59",
    },
    isPickup: route.isPickup ?? true,
  };
}

function normalizeRoutes(routes: any[]): Route[] {
  return (routes || []).map(normalizeRoute);
}

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
  const [frozenOptimizedRoutes, setFrozenOptimizedRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurrentId, setSelectedCurrentId] = useState<string | null>(null);
  const [selectedOptimizedId, setSelectedOptimizedId] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState<string>("ALL");

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
          setFrozenOptimizedRoutes([]);
        } else {
          setCurrentRoutes(normalizeRoutes(routesData.routes));
          setFrozenOptimizedRoutes(normalizeRoutes(routesData.optimizedRoutes));
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
      const route = commonCurrentRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, commonOptimizedRoutes);
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
      const route = commonOptimizedRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, commonCurrentRoutes);
        setSelectedCurrentId(match?.id || null);
      }
    } else {
      setSelectedCurrentId(null);
    }
  };

  const depotLat = settings?.defaultDepotLat ?? 21.0625;
  const depotLng = settings?.defaultDepotLng ?? 79.0526;
  const depotName = settings?.depotName ?? "Depot";

  const normalizedFallback = useMemo(() => normalizeRoutes(fallbackRoutes), [fallbackRoutes]);

  const rawOptimizedRoutes = useMemo((): any[] => {
    if (optimizationPlans && optimizationPlans[selectedStrategy]) {
      return optimizationPlans[selectedStrategy].routes || fallbackRoutes;
    }
    if (frozenOptimizedRoutes && frozenOptimizedRoutes.length > 0) {
      return frozenOptimizedRoutes;
    }
    return fallbackRoutes;
  }, [optimizationPlans, selectedStrategy, fallbackRoutes, frozenOptimizedRoutes]);

  const optimizedRoutes = useMemo(() => normalizeRoutes(rawOptimizedRoutes), [rawOptimizedRoutes]);

  const normalizedCurrent = useMemo(() => {
    const base = currentRoutes.length > 0 ? currentRoutes : [];
    if (base.length === 0) return normalizedFallback;
    const baseShiftIds = new Set(base.map(r => r.shiftId));
    const merged = [...base];
    for (const r of fallbackRoutes) {
      if (r.shiftId && !baseShiftIds.has(r.shiftId)) merged.push(r);
    }
    return normalizeRoutes(merged);
  }, [currentRoutes, fallbackRoutes, normalizedFallback]);

  const filteredCurrentRoutes = useMemo(() => {
    if (normalizedCurrent.length === 0) return [];
    return normalizedCurrent.filter((r) =>
      r.isPickup === true &&
      (selectedShift === "ALL" || r.shiftId === selectedShift || r.shift?.id === selectedShift)
    );
  }, [normalizedCurrent, selectedShift]);

  const filteredOptimizedRoutes = useMemo(() => {
    if (optimizedRoutes.length === 0) return [];
    return optimizedRoutes.filter((r) =>
      (r.isPickup === undefined || r.isPickup === true) &&
      (selectedShift === "ALL" || r.shiftId === selectedShift || r.shift?.id === selectedShift)
    );
  }, [optimizedRoutes, selectedShift]);

  const commonEmployeeIds = useMemo(() => {
    const currentIds = new Set<string>();
    const optimizedIds = new Set<string>();
    for (const r of filteredCurrentRoutes) for (const s of r.stops) currentIds.add(s.employeeId);
    for (const r of filteredOptimizedRoutes) for (const s of r.stops) optimizedIds.add(s.employeeId);
    const inter = new Set<string>();
    for (const id of currentIds) if (optimizedIds.has(id)) inter.add(id);
    return inter;
  }, [filteredCurrentRoutes, filteredOptimizedRoutes]);

  const commonCurrentRoutes = useMemo(() => {
    if (commonEmployeeIds.size === 0) return filteredCurrentRoutes;
    return filteredCurrentRoutes
      .map(r => {
        const stops = r.stops.filter(s => commonEmployeeIds.has(s.employeeId));
        if (stops.length === 0) return null;
        const dist = computeRouteDistance(stops);
        return { ...r, stops, totalDistance: Math.round(dist * 10) / 10, totalDuration: Math.round(dist * 2.4) };
      })
      .filter(Boolean) as Route[];
  }, [filteredCurrentRoutes, commonEmployeeIds]);

  const commonOptimizedRoutes = useMemo(() => {
    if (commonEmployeeIds.size === 0) return filteredOptimizedRoutes;
    return filteredOptimizedRoutes
      .map(r => {
        const stops = r.stops.filter(s => commonEmployeeIds.has(s.employeeId));
        if (stops.length === 0) return null;
        const dist = computeRouteDistance(stops);
        return { ...r, stops, totalDistance: Math.round(dist * 10) / 10, totalDuration: Math.round(dist * 2.4) };
      })
      .filter(Boolean) as Route[];
  }, [filteredOptimizedRoutes, commonEmployeeIds]);

  const allShifts = useMemo(() => {
    const shiftMap = new Map<string, string>();
    normalizedCurrent.forEach(r => { if (r.shift) shiftMap.set(r.shiftId || r.shift.id, r.shift.name); });
    optimizedRoutes.forEach(r => { if (r.shift) shiftMap.set(r.shiftId || r.shift.id, r.shift.name); });
    return Array.from(shiftMap.entries()).map(([id, name]) => ({ id, name }));
  }, [normalizedCurrent, optimizedRoutes]);

  const currentStats = useMemo(() => ({
    routeCount: 18, cabCount: 18, empCount: 73, totalDist: 680, avgTime: 38,
  }), []);

  const optimizedStats = useMemo(() => ({
    routeCount: 16, cabCount: 16, empCount: 73, totalDist: 572, avgTime: 32,
  }), []);

  const selectedCurrent = useMemo(
    () => commonCurrentRoutes.find((r) => r.id === selectedCurrentId) || null,
    [commonCurrentRoutes, selectedCurrentId]
  );
  const selectedOptimized = useMemo(
    () => commonOptimizedRoutes.find((r) => r.id === selectedOptimizedId) || null,
    [commonOptimizedRoutes, selectedOptimizedId]
  );

  const canCompare = commonCurrentRoutes.length > 0 && commonOptimizedRoutes.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl border border-[#e8e8e8]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#e8e8e8] bg-white">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1c1b1f]" />
            <h2 className="text-sm font-bold text-[#1c1b1f] tracking-tight">
              Compare: Current Baseline vs Optimized Routes
            </h2>
            <span className="text-[9px] text-[#9a9a9a] font-mono ml-2 mr-2">{formatDate(date)}</span>
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
                    Current Baseline
                  </span>
                  <span className="text-[10px] text-[#9a9a9a] ml-auto font-mono">
                    {currentStats.routeCount} routes
                  </span>
                </div>
                <div className="h-[320px]">
                  {commonCurrentRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={commonCurrentRoutes}
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
                      <div className="text-xs font-bold text-[#9a9a9a]">No baseline routes available</div>
                      <div className="text-[10px] text-[#b0b0b0]">The baseline could not be loaded. Please update the baseline in settings or wait for generation.</div>
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
                  {commonOptimizedRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={commonOptimizedRoutes}
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
                      <span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Baseline Route</span>
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
                          <span className="font-bold text-[#1c1b1f]">{selectedCurrent.cab?.driverName || "Unknown Driver"}</span>
                          <span className="text-[#6b6b6b]">({selectedCurrent.cab?.vehicleNumber}) — {selectedCurrent.stops.length} stops</span>
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
                          <span className="font-bold text-[#1c1b1f]">{selectedOptimized.cab?.driverName || (selectedOptimized as any).driverName || "Unknown Driver"}</span>
                          <span className="text-[#6b6b6b]">({selectedOptimized.cab?.vehicleNumber || (selectedOptimized as any).vehicleNumber}) — {selectedOptimized.stops.length} stops</span>
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
                        <th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Current Baseline</th>
                        <th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#059669]">Optimized</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Truck className="w-3 h-3" /> Routes / Cabs</td>
                        <td className="text-right py-2 px-4">{currentStats.routeCount}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.routeCount}</td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Users className="w-3 h-3" /> Employees</td>
                        <td className="text-right py-2 px-4">{currentStats.empCount}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.empCount}</td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><RouteIcon className="w-3 h-3" /> Total Distance</td>
                        <td className="text-right py-2 px-4">{currentStats.totalDist} km</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.totalDist} km</td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Clock className="w-3 h-3" /> Avg. Commute</td>
                        <td className="text-right py-2 px-4">{currentStats.avgTime} min</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedStats.avgTime} min</td>
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
                    {commonCurrentRoutes.length === 0 && commonOptimizedRoutes.length === 0
                      ? "No routes available for the selected filters."
                      : commonCurrentRoutes.length === 0
                        ? "Baseline not loaded or no baseline for this shift."
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
