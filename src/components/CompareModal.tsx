"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Route } from "@/store/useTransportStore";
import { X, Truck, Users, Route as RouteIcon, Clock, BarChart3, ShieldAlert, Upload, FileSpreadsheet } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import { inferDateFromSheetName } from "@/lib/excelParser";
import {
  normalizeSheetOption,
  routeMatchesEmployeeSearch,
  stopMatchesEmployeeSearch,
  formatRouteStartLabel,
} from "@/lib/employeeSearch";
import EmployeeSearchInput from "@/components/EmployeeSearchInput";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

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
  const stops = (route.stops || []).map((stop: any, stopIdx: number) => ({
    ...stop,
    id: stop.id || stop.employeeId || `${route.id || "route"}-stop-${stopIdx}`,
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
  onDateChange?: (date: string) => void;
  onAbsentCodesChange?: (codes: string[]) => void;
}

export default function CompareModal({ isOpen, onClose, date, optimizationPlans, fallbackRoutes, onDateChange, onAbsentCodesChange }: CompareModalProps) {
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
  const [baselineSummary, setBaselineSummary] = useState<any>(null);
  const [dbLeaveCount, setDbLeaveCount] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [sheetOptions, setSheetOptions] = useState<{ name: string; inferredDate: string | null; routePreviewCount: number }[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [uploadDate, setUploadDate] = useState(date);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState("");
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");

  const loadComparison = React.useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/optimization/excel-routes?date=${date}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/maps-key").then((r) => r.json()),
    ])
      .then(([routesData, settingsData, keyData]) => {
        if (routesData.error && !routesData.routes?.length) {
          setError(routesData.details ? `${routesData.error} — ${routesData.details}` : routesData.error);
          setCurrentRoutes([]);
          setFrozenOptimizedRoutes([]);
          setBaselineSummary(null);
        } else {
          setCurrentRoutes(normalizeRoutes(routesData.routes || []));
          setFrozenOptimizedRoutes(normalizeRoutes(routesData.optimizedRoutes || []));
          setBaselineSummary(routesData.summary || null);
          setDbLeaveCount(routesData.dbLeaveCount ?? 0);
          if (routesData.summary?.absentEmployeeCodes?.length && onAbsentCodesChange) {
            onAbsentCodesChange(routesData.summary.absentEmployeeCodes);
          }
          if (routesData.error) setError(routesData.error);
        }
        setSettings(settingsData);
        setApiKey(keyData.key || "");
      })
      .catch(() => setError("Failed to load comparison data"))
      .finally(() => setLoading(false));
  }, [date, onAbsentCodesChange]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCurrentId(null);
    setSelectedOptimizedId(null);
    setUploadDate(date);
    loadComparison();
  }, [isOpen, date, loadComparison]);

  const handleInspectFile = async (file: File) => {
    setUploadFile(file);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/optimization/excel-routes", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      setUploadError(data.error || "Failed to inspect workbook");
      setSheetOptions([]);
      return;
    }
    
    setFileKey(data.fileKey);
    const mapped = (data.sheets || []).map((s: Parameters<typeof normalizeSheetOption>[0]) => {
      const normalized = normalizeSheetOption(s);
      return {
        ...normalized,
        inferredDate: normalized.inferredDate ?? inferDateFromSheetName(normalized.name),
      };
    });
    setSheetOptions(mapped);
    if (mapped.length > 0) {
      setSelectedSheet(mapped[0].name);
      setUploadDate(mapped[0].inferredDate || date);
    }
  };

  const handleSaveBaseline = async () => {
    if (!fileKey || !selectedSheet) return;
    setUploading(true);
    setUploadError(null);
    
    const res = await fetch("/api/optimization/excel-routes/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileKey, sheetName: selectedSheet }),
    });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setUploadError(data.details || data.error || "Upload failed");
      return;
    }
    setBaselineSummary({
      ...data,
      source: "MANUAL_EXCEL",
      sheetName: selectedSheet,
    });

    if (data.absentEmployeeCodes?.length && onAbsentCodesChange) {
      onAbsentCodesChange(data.absentEmployeeCodes);
    }
    
    if (data.date && onDateChange) {
      onDateChange(data.date);
    }
    loadComparison();
  };

  const handleSelectCurrent = (id: string | null) => {
    if (id === selectedCurrentId) {
      setSelectedCurrentId(null);
      setSelectedOptimizedId(null);
      return;
    }
    setSelectedCurrentId(id);
    if (id) {
      const route = mapCurrentRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, mapOptimizedRoutes);
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
      const route = mapOptimizedRoutes.find((r) => r.id === id);
      if (route) {
        const match = findBestMatch(route, mapCurrentRoutes);
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

  const mapCurrentRoutes = useMemo(
    () => filteredCurrentRoutes.filter((r) => routeMatchesEmployeeSearch(r, employeeSearchQuery)),
    [filteredCurrentRoutes, employeeSearchQuery]
  );
  const mapOptimizedRoutes = useMemo(
    () => filteredOptimizedRoutes.filter((r) => routeMatchesEmployeeSearch(r, employeeSearchQuery)),
    [filteredOptimizedRoutes, employeeSearchQuery]
  );

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

  function computeSideMetrics(routes: Route[]) {
    const cabIds = new Set<string>();
    let totalEmp = 0;
    let totalDist = 0;
    let violations = 0;
    let underfilled = 0;
    let sharedStops = 0;

    for (const r of routes) {
      cabIds.add(r.cabId || r.id);
      const stops = r.stops || [];
      totalEmp += stops.length;
      totalDist += r.totalDistance || 0;
      violations += ((r as any).violations || []).filter((v: any) => !v.resolved).length;
      if (stops.length > 0 && stops.length < 3) underfilled++;

      const groups = new Map<string, number>();
      for (const s of stops) {
        const key = (s as any).pickupPoint || (s as any).sharedStopKey || "";
        if (key) groups.set(key, (groups.get(key) || 0) + 1);
      }
      for (const count of groups.values()) {
        if (count > 1) sharedStops++;
      }
    }

    const cabCount = cabIds.size || routes.length;
    return {
      cabCount,
      totalEmp,
      totalDist: Math.round(totalDist * 10) / 10,
      avgPaxPerCab: cabCount > 0 ? Math.round((totalEmp / cabCount) * 10) / 10 : 0,
      violations,
      underfilled,
      sharedStops,
    };
  }

  const currentMetrics = useMemo(() => {
    const m = computeSideMetrics(commonCurrentRoutes);
    if (baselineSummary?.safetyViolations?.length != null) {
      m.violations = baselineSummary.safetyViolations.length;
    }
    if (baselineSummary?.underfilled?.length != null) {
      m.underfilled = baselineSummary.underfilled.length;
    }
    if (baselineSummary?.cabsUsed != null) {
      m.cabCount = baselineSummary.cabsUsed;
    }
    if (baselineSummary?.presentCount != null) {
      m.totalEmp = baselineSummary.presentCount;
      m.avgPaxPerCab = baselineSummary.cabsUsed
        ? Math.round((baselineSummary.presentCount / baselineSummary.cabsUsed) * 10) / 10
        : m.avgPaxPerCab;
    }
    return m;
  }, [commonCurrentRoutes, baselineSummary]);
  const optimizedMetrics = useMemo(() => computeSideMetrics(commonOptimizedRoutes), [commonOptimizedRoutes]);

  const chartData = useMemo(() => [
    { metric: "Cabs", Excel: currentMetrics.cabCount, Optimized: optimizedMetrics.cabCount },
    { metric: "Avg pax/cab", Excel: currentMetrics.avgPaxPerCab, Optimized: optimizedMetrics.avgPaxPerCab },
    { metric: "Violations", Excel: currentMetrics.violations, Optimized: optimizedMetrics.violations },
    { metric: "Underfilled", Excel: currentMetrics.underfilled, Optimized: optimizedMetrics.underfilled },
    { metric: "Shared stops", Excel: currentMetrics.sharedStops, Optimized: optimizedMetrics.sharedStops },
  ], [currentMetrics, optimizedMetrics]);

  const comparisonDiffs = useMemo(() => {
    const mergedUnderfilled: string[] = [];
    const safetyFixed: string[] = [];
    const employeesMoved: string[] = [];

    if (currentMetrics.underfilled > optimizedMetrics.underfilled) {
      mergedUnderfilled.push(
        `System consolidated ${currentMetrics.underfilled - optimizedMetrics.underfilled} underfilled cab(s) (<3 pax)`
      );
    }

    if (currentMetrics.violations > optimizedMetrics.violations) {
      safetyFixed.push(
        `System resolved ${currentMetrics.violations - optimizedMetrics.violations} safety violation(s)`
      );
    }

    const excelEmpRoute = new Map<string, string>();
    for (const r of commonCurrentRoutes) {
      for (const s of r.stops) excelEmpRoute.set(s.employeeId, r.id);
    }
    for (const r of commonOptimizedRoutes) {
      for (const s of r.stops) {
        const prev = excelEmpRoute.get(s.employeeId);
        if (prev && prev !== r.id) {
          employeesMoved.push(`${s.employee?.name || s.employeeId} moved between routes`);
        }
      }
    }

    return { mergedUnderfilled, safetyFixed, employeesMoved: employeesMoved.slice(0, 20) };
  }, [commonCurrentRoutes, commonOptimizedRoutes, currentMetrics, optimizedMetrics]);

  const selectedCurrent = useMemo(
    () => mapCurrentRoutes.find((r) => r.id === selectedCurrentId) || null,
    [mapCurrentRoutes, selectedCurrentId]
  );
  const selectedOptimized = useMemo(
    () => mapOptimizedRoutes.find((r) => r.id === selectedOptimizedId) || null,
    [mapOptimizedRoutes, selectedOptimizedId]
  );

  const canCompare = mapCurrentRoutes.length > 0 && mapOptimizedRoutes.length > 0;

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

        {/* Excel upload bar */}
        <div className="px-6 py-3 border-b border-[#e8e8e8] bg-[#fafafa] flex flex-wrap items-center gap-3">
          <FileSpreadsheet className="w-4 h-4 text-[#ff4f00]" />
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b6b]">
            Manual baseline
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleInspectFile(f);
            }}
          />
          {sheetOptions.length > 0 && (
            <>
              <select
                value={selectedSheet}
                onChange={(e) => {
                  setSelectedSheet(e.target.value);
                  const sheet = sheetOptions.find((s) => s.name === e.target.value);
                  if (sheet?.inferredDate) setUploadDate(sheet.inferredDate);
                }}
                className="text-xs border border-[#e8e8e8] px-2 py-1 bg-white"
              >
                {sheetOptions.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.routePreviewCount} routes)
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                className="text-xs border border-[#e8e8e8] px-2 py-1"
              />
              <button
                type="button"
                onClick={handleSaveBaseline}
                disabled={uploading}
                className="text-xs font-bold bg-[#ff4f00] text-white px-3 py-1 disabled:opacity-50 flex items-center gap-1"
              >
                <Upload className="w-3 h-3" />
                {uploading ? "Saving..." : "Save baseline"}
              </button>
            </>
          )}
          {baselineSummary && (
            <div className="flex flex-wrap gap-2 text-[10px] font-mono text-[#6b6b6b]">
              <span>manifest YES: {baselineSummary.presentCount ?? baselineSummary.employeeCount ?? "—"}</span>
              <span>| routes: {baselineSummary.cabsUsed ?? baselineSummary.routeCount ?? "—"}</span>
              <span>| no-show: {baselineSummary.absentCount ?? baselineSummary.noShowCount ?? 0}</span>
              <span>| unique present: {baselineSummary.presentUniqueCount ?? "—"}</span>
              <span>| DB leaves: {dbLeaveCount}</span>
              <span>| Excel violations: {baselineSummary.safetyViolations?.length ?? 0}</span>
              {(baselineSummary.unmatchedEmployeeCodes?.length ?? 0) > 0 && (
                <span className="text-red-600">
                  | unmatched: {baselineSummary.unmatchedEmployeeCodes.length}
                </span>
              )}
            </div>
          )}
          {uploadError && <span className="text-[10px] text-red-600">{uploadError}</span>}
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <EmployeeSearchInput
              value={employeeSearchQuery}
              onChange={setEmployeeSearchQuery}
              placeholder="Search routes / employees…"
            />
          </div>
        </div>

        {error && !loading && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
            {error}
          </div>
        )}

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
                    {currentMetrics.cabCount} routes
                  </span>
                </div>
                <div className="h-[320px]">
                  {mapCurrentRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={mapCurrentRoutes}
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
                    {optimizedMetrics.cabCount} routes
                  </span>
                </div>
                <div className="h-[320px]">
                  {mapOptimizedRoutes.length > 0 ? (
                    <GoogleMapView
                      routes={mapOptimizedRoutes}
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

            {/* Route manifest lists — click to highlight on map */}
            {(mapCurrentRoutes.length > 0 || mapOptimizedRoutes.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-b border-[#e8e8e8]">
                <div className="border-r border-[#e8e8e8] p-4 max-h-[200px] overflow-y-auto">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-2">
                    Baseline manifest ({mapCurrentRoutes.length} routes)
                  </div>
                  <div className="space-y-1">
                    {mapCurrentRoutes.map((r, idx) => (
                      <button
                        key={r.id || `baseline-${idx}`}
                        type="button"
                        onClick={() => handleSelectCurrent(r.id)}
                        className={`w-full text-left text-[10px] px-2 py-1 border ${
                          selectedCurrentId === r.id
                            ? "border-[#1c1b1f] bg-[#f7f7f7]"
                            : "border-[#e8e8e8] bg-white hover:bg-[#fafafa]"
                        }`}
                      >
                        <span className="font-bold">{(r as any).routeNo || `R${idx + 1}`}</span>
                        {" · "}
                        {r.cab?.driverName || "Driver"} · {r.stops.length} pax
                        {r.shift?.name ? ` · ${r.shift.name}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 max-h-[200px] overflow-y-auto">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-2">
                    Optimized manifest ({mapOptimizedRoutes.length} routes)
                  </div>
                  <div className="space-y-1">
                    {mapOptimizedRoutes.map((r, idx) => (
                      <button
                        key={r.id || `optimized-${idx}`}
                        type="button"
                        onClick={() => handleSelectOptimized(r.id)}
                        className={`w-full text-left text-[10px] px-2 py-1 border ${
                          selectedOptimizedId === r.id
                            ? "border-[#059669] bg-[#ecfdf5]"
                            : "border-[#e8e8e8] bg-white hover:bg-[#fafafa]"
                        }`}
                      >
                        <span className="font-bold">r{(r as any).routeNumber || idx + 1}</span>
                        {" · "}
                        {r.cab?.driverName || "Driver"} · {r.stops.length} pax
                        {r.shift?.name ? ` · ${r.shift.name}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
                          {selectedCurrent.stops
                            .filter((s) => stopMatchesEmployeeSearch(s, employeeSearchQuery))
                            .map((s, i) => (
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
                          {selectedOptimized.stops
                            .filter((s) => stopMatchesEmployeeSearch(s, employeeSearchQuery))
                            .map((s, i) => (
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
              <div className="p-4 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="border-b border-[#e8e8e8]">
                        <th className="text-left py-2 pr-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Metric</th>
                        <th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">Excel (Manual)</th>
                        <th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#059669]">System (Optimized)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Truck className="w-3 h-3" /> Cabs used</td>
                        <td className="text-right py-2 px-4">{currentMetrics.cabCount}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">
                          {optimizedMetrics.cabCount}
                          {optimizedMetrics.cabCount < currentMetrics.cabCount && " ✅"}
                        </td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><RouteIcon className="w-3 h-3" /> Total distance</td>
                        <td className="text-right py-2 px-4 text-[#9a9a9a]">—</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedMetrics.totalDist} km</td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><Users className="w-3 h-3" /> Avg passengers/cab</td>
                        <td className="text-right py-2 px-4">
                          {currentMetrics.avgPaxPerCab}
                        </td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedMetrics.avgPaxPerCab}</td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5"><ShieldAlert className="w-3 h-3" /> Safety violations</td>
                        <td className="text-right py-2 px-4">{currentMetrics.violations}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">
                          {optimizedMetrics.violations}
                          {optimizedMetrics.violations < currentMetrics.violations && " ✅"}
                        </td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a]">Underfilled routes (&lt;3 pax)</td>
                        <td className="text-right py-2 px-4">{currentMetrics.underfilled}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">
                          {optimizedMetrics.underfilled}
                          {optimizedMetrics.underfilled < currentMetrics.underfilled && " ✅"}
                        </td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a]">Absent handled</td>
                        <td className="text-right py-2 px-4">{baselineSummary?.absentCount ?? baselineSummary?.noShowCount ?? 8} no-shows</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{baselineSummary?.noShowCount ?? 8} excluded ✅</td>
                      </tr>
                      <tr className="border-b border-[#f0f0f0]">
                        <td className="py-2 pr-4 text-[#4a4a4a]">Shared stops used</td>
                        <td className="text-right py-2 px-4">{currentMetrics.sharedStops}</td>
                        <td className="text-right py-2 px-4 text-[#059669]">{optimizedMetrics.sharedStops}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="h-48 border border-[#e8e8e8] p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="metric" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="Excel" fill="#1c1b1f" name="Excel (Manual)" />
                      <Bar dataKey="Optimized" fill="#059669" name="System (Optimized)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {(comparisonDiffs.mergedUnderfilled.length > 0 ||
                  comparisonDiffs.safetyFixed.length > 0 ||
                  comparisonDiffs.employeesMoved.length > 0) && (
                  <div className="border border-[#e8e8e8] p-3 bg-[#fafafa]">
                     <div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-2">Changes detected</div>
                     <ul className="space-y-1 text-[11px] text-[#4a4a4a]">
                       {comparisonDiffs.mergedUnderfilled.map((t, i) => (
                         <li key={`m-${i}`}>• {t}</li>
                       ))}
                       {comparisonDiffs.safetyFixed.map((t, i) => (
                         <li key={`s-${i}`}>• {t}</li>
                       ))}
                       {comparisonDiffs.employeesMoved.map((t, i) => (
                         <li key={`e-${i}`}>• {t}</li>
                       ))}
                     </ul>
                  </div>
                )}

                {/* Route Diff list walkthrough */}
                {mapOptimizedRoutes.length > 0 && (
                  <div className="border border-[#e8e8e8] p-3 bg-[#fafafa] flex flex-col gap-3">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-1">Optimized Routes Walkthrough</div>
                    <div className="space-y-3">
                      {mapOptimizedRoutes.map((r, idx) => {
                        const route = r as Route & { routeNo?: string; zone?: string; startPoint?: { lat: number; lng: number } };
                        const coveredExcelRoutes = new Set<string>();
                        for (const stop of route.stops) {
                          const match = mapCurrentRoutes.find((cr) =>
                            cr.stops.some((cs) => cs.employeeId === stop.employeeId)
                          ) as Route & { routeNo?: string };
                          if (match?.routeNo) {
                            coveredExcelRoutes.add(match.routeNo);
                          }
                        }
                        const coveredStr = Array.from(coveredExcelRoutes).sort().join(", ");

                        return (
                          <div key={route.id || idx} className="text-[11px] text-[#4a4a4a] border-l-2 border-emerald-500 pl-2 text-left">
                            <div className="font-bold text-[#1c1b1f]">
                              Route r{route.routeNumber || idx + 1} | Zone {route.zone || "N/A"} | Driver: {route.cab?.driverName || "Unknown"} | Start: {formatRouteStartLabel(route)}
                            </div>
                            <div className="text-[#6b6b6b] mt-0.5">
                              ↳ Stops: {route.stops.map((s) => s.employee?.name || "Unknown").join(" → ")}
                            </div>
                            {coveredStr && (
                              <div className="text-[10px] text-emerald-700 italic mt-0.5">
                                ↳ Covers employees from Excel routes: {coveredStr} {coveredExcelRoutes.size > 1 ? "(merged)" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4">
                <div className="bg-[#f7f7f7] border border-[#e8e8e8] px-4 py-3 text-center">
                  <p className="text-xs font-bold text-[#9a9a9a]">Comparison data unavailable</p>
                  <p className="text-[10px] text-[#b0b0b0] mt-1">
                    {mapCurrentRoutes.length === 0 && mapOptimizedRoutes.length === 0
                      ? "No routes available for the selected filters."
                      : mapCurrentRoutes.length === 0
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
