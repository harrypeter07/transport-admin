/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
 ResponsiveContainer,
 BarChart,
 Bar,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 Legend,
 AreaChart,
 Area,
} from "recharts";
import { useTransportStore, Route, RouteStop } from "@/store/useTransportStore";
import { useRouter } from "next/navigation";
import RouteVisualizer from "@/components/RouteVisualizer";
import CompareModal from "@/components/CompareModal";
import ConfirmModal from "@/components/ConfirmModal";

import {
 Compass,
 Users,
 Truck,
 ShieldAlert,
 Calendar,
 AlertTriangle,
 RotateCw,
 Printer,
 Plus,
 Trash,
  AlertCircle,
 RefreshCw,
 ArrowUp,
 ArrowDown,
 Phone,
 CheckCircle2,
 ShieldOff,
 MessageSquare,
 Sparkles,
 Info,
  Search,
  GitCompare,
  ChevronDown,
  ChevronUp,
  X,
  FileSpreadsheet,
  Upload
} from "lucide-react";

import { formatDate } from "@/lib/dateFormat";

export default function TransitAdminSPA() {
 const {
  employees,
  cabs,
  shifts,
  routes,
  activeShiftId,
  selectedDate,
  setSelectedDate,
  selectedRouteId,
  loading,
  fetchInitialData,
  setActiveShiftId,
 setSelectedRouteId,
 runOptimization,
 previewOptimization,
 applyOptimizationPlan,
 clearOptimizationPreview,
 optimizationPlans,
 previewing,
 updateStopStatus,
 reorderRouteStops,
 overrideViolation,
 addEmployee,
 updateEmployee,
 deleteEmployee,
 addCab,
 updateCab,
  deleteCab,
   applyRouteSequence,
   swapRouteCab,
   assignShiftsToAllCabs,
   manualRoutes,
   setManualRoutes,
   excelMetrics,
   setExcelMetrics,
  } = useTransportStore();

 const router = useRouter();

  const [activeDesk, setActiveDesk] = useState<"OPTIMIZER" | "COMPLIANCE" | "ANALYSIS" | "MANUAL_ROUTING">("OPTIMIZER");
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [publishingManual, setPublishingManual] = useState(false);
  const [publishManualSuccess, setPublishManualSuccess] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
 const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [addressChanged, setAddressChanged] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [publishCount, setPublishCount] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmPublishDraft, setConfirmPublishDraft] = useState(false);
  const [confirmPublishExisting, setConfirmPublishExisting] = useState(false);
  const [isPublishManualModalOpen, setIsPublishManualModalOpen] = useState(false);

  const handlePublishManualRoutes = async () => {
    setPublishingManual(true);
    try {
      // Group routes by shiftId
      const shiftsSet = new Set<string>();
      manualRoutes.forEach((r: any) => {
        if (r.shiftId) shiftsSet.add(r.shiftId);
      });
      
      const shiftIds = shiftsSet.size > 0 ? Array.from(shiftsSet) : [activeShiftId];

      for (const sId of shiftIds) {
        const shiftRoutes = manualRoutes.filter((r: any) => (r.shiftId || activeShiftId) === sId);
        
        const previewRoutes = shiftRoutes.map((route: any) => ({
          cabId: route.cabId,
          vehicleNumber: route.vehicleNumber,
          shiftId: sId,
          isPickup: true,
          totalDistance: route.totalDistance,
          totalDuration: route.totalDuration,
          optimizationScore: route.optimizationScore,
          tripSequence: route.tripSequence || 1,
          stops: (route.stops || [])
            .filter((stop: any) => !stop.employeeId.startsWith("excel_"))
            .map((stop: any, index: number) => ({
              employeeId: stop.employeeId,
              stopOrder: index + 1, // Re-index after filtering
              etaMinutes: stop.etaMinutes || 0,
            })),
          violations: [],
        })).filter((r: any) => r.stops.length > 0 && r.cabId && !r.cabId.startsWith("manual_"));

        if (previewRoutes.length === 0) continue; // skip empty shifts

        const saveRes = await fetch("/api/optimization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shiftId: sId,
            isPickup: true,
            date: selectedDate,
            mode: "APPLY",
            selectedStrategy: "MANUAL_EXCEL",
            previewRoutes,
          }),
        });
        if (!saveRes.ok) throw new Error(`Failed to save draft routes for shift ${sId}.`);

        const pubRes = await fetch("/api/optimization/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDate,
            shiftId: sId,
          }),
        });
        if (!pubRes.ok) throw new Error(`Failed to publish routes for shift ${sId}.`);
      }

      setPublishManualSuccess(true);
      fetchAnalysisData();
    } catch (err: any) {
      alert("Failed to publish manual routes: " + err.message);
    } finally {
      setPublishingManual(false);
      setIsPublishManualModalOpen(false);
    }
  };

  // Analysis Dashboard State
 const [analysisData, setAnalysisData] = useState<any>(null);
 const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
 const [analysisError, setAnalysisError] = useState<string | null>(null);
 const [isMounted, setIsMounted] = useState(false);
 const [selectedCabsForChart, setSelectedCabsForChart] = useState<string[]>([]);
 const [projectionPeriod, setProjectionPeriod] = useState<"DAILY" | "MONTHLY" | "YEARLY">("DAILY");
 const [ledgerCabFilter, setLedgerCabFilter] = useState<string>("ALL");

 const fetchAnalysisData = async () => {
 setAnalysisLoading(true);
 setAnalysisError(null);
 try {
 const params = new URLSearchParams();
 if (selectedDate) params.append("date", selectedDate);
 
 const res = await fetch(`/api/analysis?${params.toString()}`);
 if (!res.ok) throw new Error("Failed to fetch analysis data");
 const json = await res.json();
 setAnalysisData(json);
 if (json.routeBreakdowns && json.routeBreakdowns.length > 0) {
 const plates = Array.from(new Set(json.routeBreakdowns.map((r: any) => r.cabPlate))) as string[];
 setSelectedCabsForChart(plates);
 } else {
 setSelectedCabsForChart([]);
 }
 } catch (err: any) {
 setAnalysisError(err.message || "Failed to load analysis data");
 } finally {
 setAnalysisLoading(false);
 }
 };

 useEffect(() => {
 setIsMounted(true);
 }, []);

 useEffect(() => {
 if (activeDesk === "ANALYSIS") {
 fetchAnalysisData();
 }
 }, [activeDesk]);

 // State for commute routing
 const [isPickup, setIsPickup] = useState(true);
 const [optimizeError, setOptimizeError] = useState<string | null>(null);
 const [optimizing, setOptimizing] = useState(false);
 const [hasOptimized, setHasOptimized] = useState(false);
  const [previewedStrategy, setPreviewedStrategy] = useState<"MAXIMIZE_UTILIZATION" | "MINIMIZE_TIME" | "BALANCED" | null>(null);
  const [applyingStrategy, setApplyingStrategy] = useState<string | null>(null);
  const [routeViewModes, setRouteViewModes] = useState<Record<string, "pickup" | "drop">>({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

 // Settings/Diagnostics states
 const [showSettings, setShowSettings] = useState(false);

 // View modes: TABLE (manifest table) vs CARDS (large route cards)
 const [activeViewMode, setActiveViewMode] = useState<"TABLE" | "CARDS">("CARDS");

 // Shift UI filters and states
 const [compareShiftFilter, setCompareShiftFilter] = useState<string>("ALL");
 const [mapShiftFilter, setMapShiftFilter] = useState<string>("ALL");
 const [expandedShifts, setExpandedShifts] = useState<Record<string, boolean>>({});

 // Local variations caching for Google Maps preview
 interface RouteVariation {
 strategy: "DISTANCE" | "TIME" | "BALANCED" | "NORMAL";
 stops: any[];
 totalDistance: number;
 totalDuration: number;
 optimizationScore: number;
 violations: any[];
 hasEscort: boolean;
 }
 const [variations, setVariations] = useState<Record<string, RouteVariation[]>>({});
 const [loadingVariations, setLoadingVariations] = useState<Record<string, boolean>>({});
  const [activeVarIndices, setActiveVarIndices] = useState<Record<string, number>>({});

  // Modals for editing and swapping
 const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
 const [editingCab, setEditingCab] = useState<any | null>(null);
 const [compareOpen, setCompareOpen] = useState(false);
 const [swappingCabRouteId, setSwappingCabRouteId] = useState<string | null>(null);
 const [dispatchCab, setDispatchCab] = useState<any | null>(null);
 const [dispatchMode, setDispatchMode] = useState("FULL_DAY");
 const [dispatchLoading, setDispatchLoading] = useState(false);
 const [dispatchResult, setDispatchResult] = useState<any>(null);
 const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
 const [temporaryReplacements, setTemporaryReplacements] = useState<Record<string, string>>({});
 const [dispatchReplacementCabId, setDispatchReplacementCabId] = useState<string>("");

 // Sidebar attendance checklist toggle
 const [showAttendanceChecklist, setShowAttendanceChecklist] = useState(false);
 const [attendanceSearchQuery, setAttendanceSearchQuery] = useState("");

 // Forms states
 const [employeeForm, setEmployeeForm] = useState({
 employeeCode: "",
 name: "",
 gender: "MALE" as "MALE" | "FEMALE",
 phone: "",
 email: "",
 address: "Sadar, Nagpur", // Neighborhood name
 department: "Engineering",
 shiftId: "",
 });

 const [cabForm, setCabForm] = useState({
 vehicleNumber: "",
 capacity: "4",
 vendor: "Maharaja Transport",
 driverName: "",
 driverPhone: "",
 licenseNumber: "",
 driverAddress: "",
 });

  useEffect(() => {
    let isActive = true;

    const loadInitialData = async () => {
      await fetchInitialData();
      if (isActive) {
        setInitialDataLoaded(true);

        // Restore optimizationPlans from sessionStorage if Zustand lost it (tab switch / remount)
        if (!useTransportStore.getState().optimizationPlans) {
          try {
            const saved = sessionStorage.getItem("opencode-opt-plans");
            if (saved) {
              const parsed = JSON.parse(saved);
              useTransportStore.setState({ optimizationPlans: parsed });
              setHasOptimized(true);
            }
          } catch {}
        } else {
          // Plans already in Zustand store (in-session navigation) — mark hasOptimized
          setHasOptimized(true);
        }

        // Restore last previewed strategy
        try {
          const savedStrategy = sessionStorage.getItem("opencode-opt-strategy") as
            | "MAXIMIZE_UTILIZATION" | "MINIMIZE_TIME" | "BALANCED" | null;
          if (savedStrategy && ["MAXIMIZE_UTILIZATION", "MINIMIZE_TIME", "BALANCED"].includes(savedStrategy)) {
            setPreviewedStrategy(savedStrategy);
          }
        } catch {}
      }
    };

    loadInitialData();

    return () => {
      isActive = false;
    };
  }, []);

 useEffect(() => {
 if (shifts.length > 0 && !employeeForm.shiftId) {
 setEmployeeForm((prev) => ({ ...prev, shiftId: shifts[0].id }));
 }
  }, [shifts]);

  // Detect if route stop coords differ from current employee data (address was changed)
  useEffect(() => {
    let changed = false;
    for (const route of routes) {
      for (const stop of route.stops) {
        const emp = employees.find(e => e.id === stop.employeeId);
        if (emp && (emp.x !== stop.employee.x || emp.y !== stop.employee.y)) {
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    setAddressChanged(changed);
  }, [employees, routes]);

   const handleGeneratePlans = async () => {
  setOptimizing(true);
  setOptimizeError(null);
  setApplySuccess(false);
   try {
  await fetchInitialData();
  const result = await previewOptimization(isPickup);
 if (!result.success) {
 setOptimizeError(result.error || "Failed to generate plans. Check you have employees and cabs registered.");
  } else {
  setPreviewedStrategy("BALANCED"); // Default preview
  try { sessionStorage.setItem("opencode-opt-strategy", "BALANCED"); } catch {}
  setHasOptimized(true);
  }
  } catch (err: any) {
  setOptimizeError(err.message || "Unexpected error generating plans.");
 } finally {
 setOptimizing(false);
 }
 };

  const handleApplyPlan = async (strategy: "MAXIMIZE_UTILIZATION" | "MINIMIZE_TIME" | "BALANCED") => {
  setApplyingStrategy(strategy);
  setOptimizeError(null);
  setApplySuccess(false);
  try {
  const result = await applyOptimizationPlan(strategy, isPickup);
   if (!result.success) {
   setOptimizeError(result.error || "Failed to apply plan.");
   } else {
   setVariations({});
   setActiveVarIndices({});
   clearOptimizationPreview();
   setPreviewedStrategy(null);
   setApplySuccess(true);
   try { sessionStorage.removeItem("opencode-opt-strategy"); } catch {}
   }
  } catch (err: any) {
  setOptimizeError(err.message || "Unexpected error applying plan.");
  } finally {
  setApplyingStrategy(null);
  }
  };

 // Legacy single-strategy handler (kept for backward compat with "Optimize Routing" button)
 const handleRunOptimization = async () => {
 setOptimizing(true);
 setOptimizeError(null);
 try {
 const result = await runOptimization(isPickup, "", "FASTEST_TRAVEL");
 if (!result.success) {
 setOptimizeError(result.error || "Optimization failed. Please check you have employees and cabs registered.");
 } else {
 setVariations({});
 setActiveVarIndices({});
 }
 } catch (err: any) {
 setOptimizeError(err.message || "Unexpected error during optimization.");
 } finally {
 setOptimizing(false);
 }
 };

 const handleEmpInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
 setEmployeeForm({ ...employeeForm, [e.target.name]: e.target.value });
 };

 const handleCabInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
 setCabForm({ ...cabForm, [e.target.name]: e.target.value });
 };

 const [employeeFormError, setEmployeeFormError] = useState<string | null>(null);

 const handleAddEmployee = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!employeeForm.employeeCode || !employeeForm.name) return;

 setEmployeeFormError(null);
 const result = await addEmployee(employeeForm);

 if (result.success) {
 setEmployeeForm({
 employeeCode: "",
 name: "",
 gender: "MALE",
 phone: "",
 email: "",
 address: "Sadar, Nagpur",
 department: "Engineering",
 shiftId: shifts[0]?.id || "",
 });
 } else {
 setEmployeeFormError(result.error || "Failed to register employee.");
 }
 };

 const handleAddCab = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!cabForm.vehicleNumber || !cabForm.driverName) return;

 await addCab(cabForm);

 setCabForm({
 vehicleNumber: "",
 capacity: "4",
 vendor: "Maharaja Transport",
 driverName: "",
 driverPhone: "",
 licenseNumber: "",
 driverAddress: "",
 });
 };





  const fetchVariations = async (routeId: string) => {
 setLoadingVariations((prev) => ({ ...prev, [routeId]: true }));
 try {
 const res = await fetch(`/api/routes/${routeId}/variations`);
 if (res.ok) {
 const data = await res.json();
 setVariations((prev) => ({ ...prev, [routeId]: data }));
 // Select Balanced strategy as active preview index by default (index 2 in result list)
 const balancedIdx = data.findIndex((v: any) => v.strategy === "BALANCED");
 setActiveVarIndices((prev) => ({ ...prev, [routeId]: balancedIdx !== -1 ? balancedIdx : 0 }));
 }
 } catch (e) {
 console.error("Failed to load route variations:", e);
 } finally {
 setLoadingVariations((prev) => ({ ...prev, [routeId]: false }));
 }
 };

 const handleToggleStopStatus = async (stop: RouteStop) => {
 let newStatus: "PENDING" | "REACHED" | "BOARDED" | "SKIPPED";
 if (stop.status === "PENDING") {
 newStatus = "BOARDED";
 } else if (stop.status === "BOARDED") {
 newStatus = "SKIPPED";
 } else if (stop.status === "SKIPPED") {
 newStatus = "PENDING";
 } else {
 newStatus = "PENDING";
 }
 await updateStopStatus(stop.routeId, stop.id, newStatus);
 };

 // Calculations for selected and active items
 const dbActiveRoutes = [...routes].sort((a, b) => {
 const timeA = a.shift?.startTime || "";
 const timeB = b.shift?.startTime || "";
 if (timeA !== timeB) return timeA.localeCompare(timeB);
 return a.cab.vehicleNumber.localeCompare(b.cab.vehicleNumber);
 });
 
 // If previewing a generated plan, show the generated routes for every optimized shift.
 const previewRoutes = (optimizationPlans && previewedStrategy)
 ? optimizationPlans[previewedStrategy].routes.map((r: any, idx: number) => {
 const routeShiftId = r.shiftId || activeShiftId;
 const routeShift = r.shift || shifts.find((shift) => shift.id === routeShiftId);

 return ({
 ...r,
 id: `preview-${routeShiftId || "shift"}-${idx}`,
 shiftId: routeShiftId,
 shift: routeShift,
 cab: {
 vehicleNumber: r.vehicleNumber,
 driverName: r.driverName,
 driverPhone: r.driverPhone,
    driverAddress: r.startPoint ? (cabs.find((c: any) => c.id === r.cabId)?.driverAddress ?? "Configured cab start") : undefined,
 driverX: r.startPoint?.x,
 driverY: r.startPoint?.y,
 },
 stops: r.stops.map((s: any) => ({
 ...s,
 id: `preview-stop-${routeShiftId || "shift"}-${s.employeeId}`,
 employee: {
 id: s.employeeId,
 name: s.employeeName,
 gender: s.gender,
 x: s.x,
 y: s.y,
 address: s.address,
 phone: "N/A"
 }
 }))
 });
 })
 : null;
 const activeRoutesRaw = (hasOptimized || previewRoutes)
 ? (previewRoutes
   ? [...previewRoutes].sort((a, b) => {
       const timeA = a.shift?.startTime || "";
       const timeB = b.shift?.startTime || "";
       if (timeA !== timeB) return timeA.localeCompare(timeB);
       return a.cab.vehicleNumber.localeCompare(b.cab.vehicleNumber);
     })
    : dbActiveRoutes.map(r => {
        const replacementCabId = temporaryReplacements[r.cabId];
        if (replacementCabId) {
          const repCab = cabs.find(c => c.id === replacementCabId);
          if (repCab) return { ...r, cabId: repCab.id, cab: repCab };
        }
        return r;
      }))
 : [];
 const activeRoutes = activeRoutesRaw as Route[];
  const manifestRoutes = activeRoutes.filter(r => (r.stops || []).length > 0);
  
  const getDriverTripCount = (cabId: string) => {
    if (!cabId) return 0;
    return manifestRoutes.filter(r => r.cabId === cabId && r.status !== "CANCELLED").length;
  };
  const getRouteShiftLabel = (route: any) =>
  route.shift?.name || route.shiftName || shifts.find((shift) => shift.id === route.shiftId)?.name || "Shift";

  const getEffectiveMode = (route: Route): "pickup" | "drop" =>
    routeViewModes[route.id] || "pickup";

  const getRouteStartAddress = (route: Route): string => {
    const cab = route.cab;
    if ((route.tripSequence || 1) > 1) return "MIHAN Depot";
    if (cab?.driverAddress?.trim()) return cab.driverAddress;
    if (typeof cab?.driverX === "number" && typeof cab?.driverY === "number") return "Driver Location";
    return "MIHAN Depot";
  };

  const cabMaxTripSequence: Record<string, number> = {};
  for (const r of activeRoutes) {
    const ts = r.tripSequence || 1;
    if (r.cabId && ts > (cabMaxTripSequence[r.cabId] || 0)) {
      cabMaxTripSequence[r.cabId] = ts;
    }
  }

  const isLastTripForCab = (route: Route): boolean => {
    const maxTs = cabMaxTripSequence[route.cabId] || 1;
    return (route.tripSequence || 1) >= maxTs;
  };

  const getRouteEndAddress = (route: Route): string => {
    if (isLastTripForCab(route)) return getRouteStartAddress(route);
    return "MIHAN Depot";
  };

  const getDisplayStops = (stops: any[], routeId: string, effectiveIsPickup: boolean): any[] => {
    const sorted = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
    return effectiveIsPickup ? sorted : [...sorted].reverse();
  };

  // Group manifest routes by shiftId, sorted by shift startTime ascending
 const shiftGroups: { shiftId: string; shiftLabel: string; shiftTime: string; routes: typeof manifestRoutes }[] = [];
 const seenShiftIds = new Set<string>();
 const sortedManifest = [...manifestRoutes].sort((a, b) => {
   const tA = (a as any).shift?.startTime || "";
   const tB = (b as any).shift?.startTime || "";
   return tA.localeCompare(tB);
 });
 for (const route of sortedManifest) {
   const sid = route.shiftId || "unknown";
   if (!seenShiftIds.has(sid)) {
     seenShiftIds.add(sid);
     shiftGroups.push({
       shiftId: sid,
       shiftLabel: getRouteShiftLabel(route),
       shiftTime: (route as any).shift?.startTime || "",
       routes: [],
     });
   }
   shiftGroups[shiftGroups.findIndex(g => g.shiftId === sid)].routes.push(route);
  }

  // Apply known canonical sequences to specific routes
  useEffect(() => {
    if (manifestRoutes.length === 0) return;
    const sorted = [...manifestRoutes].sort((a, b) => {
      const tA = (a as any).shift?.startTime || "";
      const tB = (b as any).shift?.startTime || "";
      return tA.localeCompare(tB);
    });
    const seen = new Set<string>();
    for (const route of sorted) {
      const sid = route.shiftId || "unknown";
      if (seen.has(sid)) continue;
      seen.add(sid);
    }
  }, [manifestRoutes]);

  const isInitialOptimizerDataLoading = !initialDataLoaded || (loading && cabs.length === 0);

 const displayOptimizationPlans = useMemo(() => {
   if (!optimizationPlans) return null;
   if (compareShiftFilter === "ALL") return optimizationPlans;

   const filterPlan = (plan: any) => {
     if (!plan) return plan;
     const routes = plan.routes.filter((r: any) => r.shiftId === compareShiftFilter);
     const allDurations = routes.flatMap((route: any) =>
       (route.stops || []).map((stop: any) => stop.etaMinutes).filter((mins: any) => typeof mins === "number")
     );
     
     return {
       ...plan,
       routes,
       totalCabsUsed: routes.length,
       totalEmployeesCovered: new Set(routes.flatMap((route: any) => (route.stops || []).map((stop: any) => stop.employeeId))).size,
       totalDistance: Math.round(routes.reduce((sum: number, route: any) => sum + (route.totalDistance || 0), 0) * 10) / 10,
       avgCommuteMins: allDurations.length
         ? Math.round(allDurations.reduce((sum: number, mins: number) => sum + mins, 0) / allDurations.length)
         : 0,
       totalViolations: routes.reduce(
         (sum: number, route: any) => sum + (route.violations || []).filter((v: any) => !v.resolved).length,
         0
       )
     };
   };

   return {
     ...optimizationPlans,
     MAXIMIZE_UTILIZATION: filterPlan(optimizationPlans.MAXIMIZE_UTILIZATION),
     MINIMIZE_TIME: filterPlan(optimizationPlans.MINIMIZE_TIME),
     BALANCED: filterPlan(optimizationPlans.BALANCED),
     totalEmployees: employees.filter((e: any) => e.shiftId === compareShiftFilter).length
   };
 }, [optimizationPlans, compareShiftFilter, employees]);

 const selectedRoute = activeRoutes.find((r: any) => r.id === selectedRouteId);
 const totalViolations = activeRoutes.reduce(
 (acc, r) => acc + (r.violations || []).filter((v: any) => !v.resolved).length,
 0
 );

 // Calculate unassigned employees — only meaningful after an optimization run
 const activeEmployees = employees.filter((emp) => emp.status === "ACTIVE");
 const assignedEmployeeIds = new Set(activeRoutes.flatMap((r) => r.stops.map((s) => s.employeeId)));
 const unassignedEmployees = (hasOptimized || optimizationPlans !== null)
   ? activeEmployees.filter((emp) => !assignedEmployeeIds.has(emp.id))
   : [];

 // Filter lists
 const filteredEmployees = employees.filter((emp) =>
 emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 emp.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
 emp.address.toLowerCase().includes(searchQuery.toLowerCase())
 );

 const filteredCabs = cabs.filter((cab) =>
 cab.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (cab.driverName || "").toLowerCase().includes(searchQuery.toLowerCase())
 );

 const activeViolationsList = routes.flatMap((r) =>
 r.violations.map((v) => ({
 ...v,
 routeId: r.id,
 vehicleNumber: r.cab.vehicleNumber,
 driverName: r.cab.driverName || "N/A",
 driverPhone: r.cab.driverPhone || "N/A",
 totalStops: r.stops.length,
 }))
 );
 const getViolationKey = (violation: any, index: number, routeId?: string) =>
 violation.id ||
 `${routeId || violation.routeId || "route"}-${violation.type || "violation"}-${violation.severity || "severity"}-${index}`;

 return (
 <div className="flex flex-col min-h-0 bg-[#f7f7f7] text-[#1c1b1f] selection:bg-[#1c1b1f] selection:text-white font-sans antialiased">

  {/* Module Tab Bar — embedded inside platform shell */}
 <div className="sticky top-14 z-40 w-full border-b border-[#e8e8e8] bg-white/95 backdrop-blur-md">
 <div className="px-4 md:px-6 min-h-[44px] flex items-center justify-between overflow-x-auto no-scrollbar">
 <nav className="flex items-center gap-1 w-max flex-nowrap py-1.5">
 <button
 onClick={() => setActiveDesk("OPTIMIZER")}
 className={`px-3.5 py-1.5 rounded-none text-xs font-bold tracking-wide transition-all
 ${
 activeDesk === "OPTIMIZER"
 ? "bg-[#1c1b1f] text-white"
 : "text-[#6b6b6b] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
 }
 `}
 >
 Route Optimizer
 </button>
 <button
 onClick={() => setActiveDesk("COMPLIANCE")}
 className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-none text-xs font-bold tracking-wide transition-all
 ${
 activeDesk === "COMPLIANCE"
 ? "bg-[#1c1b1f] text-white"
 : "text-[#6b6b6b] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
 }
 `}
 >
 Compliance Warnings
 {totalViolations > 0 && (
 <span className="bg-[#f7f7f7] border border-[#e8e8e8] text-[#1c1b1f] text-[9px] font-bold px-1.5 py-0.5 rounded-none">
 {totalViolations}
 </span>
 )}
 </button>
 <div className="w-px h-4 bg-slate-200 mx-1"></div>
 <button
 onClick={() => setActiveDesk("ANALYSIS")}
 className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-none text-xs font-bold tracking-wide transition-all
 ${
 activeDesk === "ANALYSIS"
 ? "bg-[#1c1b1f] text-white"
 : "text-[#6b6b6b] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
 }
 `}
 >
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
 <path fillRule="evenodd" d="M17.753 14.544a.75.75 0 0 0 .153-.82l-3-6a.75.75 0 0 0-1.282-.1l-2.484 3.727-2.673-3.055a.75.75 0 0 0-1.047-.075L2.92 12.221a.75.75 0 0 0 .961 1.157l3.963-3.292 2.766 3.161a.75.75 0 0 0 1.077.065l2.672-4.009 2.527 5.054a.75.75 0 0 0 .867.188Z" clipRule="evenodd" />
 </svg>
 Route ROI & Savings Analytics
 </button>
  <div className="w-px h-4 bg-slate-200 mx-1"></div>
  <button
  onClick={() => setActiveDesk("MANUAL_ROUTING")}
  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-none text-xs font-bold tracking-wide transition-all
  ${
  activeDesk === "MANUAL_ROUTING"
  ? "bg-[#1c1b1f] text-white"
  : "text-[#6b6b6b] hover:text-[#1c1b1f] hover:bg-[#f7f7f7]"
  }
  `}
  >
  <FileSpreadsheet className="w-3.5 h-3.5" />
  Manual Routing
  </button>
 </nav>

  <div className="flex items-center gap-2 ml-auto">
    <button
    onClick={async () => {
    setHasOptimized(false);
    await fetchInitialData();
    }}
    className="p-1.5 border border-[#e8e8e8] bg-white rounded-none hover:bg-[#f7f7f7] text-[#6b6b6b] transition"
    title="Sync Database"
    >
    <RefreshCw className="w-3.5 h-3.5" />
    </button>
    <button
    onClick={async () => {
    const result = await assignShiftsToAllCabs();
    if (result.fixed > 0) {
    alert(`Fixed ${result.fixed} cab(s) that were missing shift assignments.`);
    } else if (result.total > 0) {
    alert("All cabs already have shifts assigned.");
    } else {
    alert("No cabs found to fix.");
    }
    }}
    className="px-2.5 py-1.5 text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800 rounded-none hover:bg-amber-100 transition cursor-pointer"
    title="Assign all shifts to cabs missing them"
    >
    Fix Cab Shifts
    </button>
  </div>
  </div>
  </div>

 {/* Module Content */}
 <main className="flex-grow w-full px-6 py-6 flex flex-col gap-6">
 
  {/* DESK 1: ROUTE OPTIMIZER */}
  <div className={`flex flex-col gap-6 text-left ${activeDesk === "OPTIMIZER" ? "" : "hidden"}`}>
 {/* Top Workspace Bar */}
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-[100px] z-30 bg-[#f7f7f7] py-2 -mx-2 px-2">
 <div>
 <h1 className="text-lg font-bold text-[#1c1b1f]">Transit Optimization Workspace</h1>
 <p className="text-xs text-[#6b6b6b]">
 Select the date and direction to map routes for all active employees.
 </p>
 </div>

  {/* Controls bar */}
  <div className="flex flex-wrap items-center gap-3 bg-white p-2 border border-[#e8e8e8] rounded-none shadow-xs">
  {/* Compare Button */}
  <button
    onClick={() => setCompareOpen(true)}
    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f7f7f7] border border-[#e8e8e8] hover:border-slate-350 transition shadow-2xs text-[11px] font-bold text-[#4a4a4a] cursor-pointer"
  >
    <GitCompare className="w-3.5 h-3.5" />
    Compare Current vs Optimized
  </button>

  {/* Date Dropdown */}
  <div className="flex items-center gap-1.5 px-1">
  <div className="flex items-center gap-1.5 px-2 py-1 bg-[#f7f7f7] border border-[#e8e8e8] rounded-none hover:border-slate-350 transition shadow-2xs">
  <Calendar className="w-3.5 h-3.5 text-slate-550" />
  <input
 type="date"
 value={selectedDate}
 onChange={(e) => {
 const newDate = e.target.value;
 setSelectedDate(newDate);
 fetchInitialData({ date: newDate });
 }}
 className="bg-transparent border-none text-xs font-bold text-[#4a4a4a] outline-none cursor-pointer focus:ring-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 transition-opacity"
 />
 </div>
 </div>

 <div className="h-4 w-px bg-slate-200"></div>

  {optimizationPlans ? (
  <div className="flex items-center gap-1.5 px-2 py-1 bg-white border border-[#e8e8e8] rounded-none shadow-2xs">
  <span className="text-xs font-bold text-[#6b6b6b]">Preview:</span>
  <select
  value={previewedStrategy || "BALANCED"}
   onChange={(e) => {
   setPreviewedStrategy(e.target.value as any);
   try { sessionStorage.setItem("opencode-opt-strategy", e.target.value); } catch {}
   }}
  className="bg-transparent border-none text-xs font-bold text-[#1c1b1f] outline-none cursor-pointer focus:ring-0"
  >
  <option value="MAXIMIZE_UTILIZATION">Maximize Utilization</option>
  <option value="MINIMIZE_TIME">Minimize Commute</option>
  <option value="BALANCED">Balanced</option>
  </select>
  </div>
  ) : (
  <div className="flex items-center gap-2">
  <button
  onClick={handleGeneratePlans}
  disabled={optimizing || previewing || loading}
  className="flex items-center gap-1.5 bg-slate-800 text-white px-4 py-1.5 rounded-none text-xs font-bold hover:bg-[#1c1b1f] transition disabled:opacity-50 shadow-2xs cursor-pointer"
  >
  <RotateCw className={`w-3.5 h-3.5 ${optimizing || previewing ? "animate-spin-fast" : ""}`} />
   {optimizing || previewing ? "Solving..." : "Optimize Routing"}
   </button>

   {addressChanged && (
     <div className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 flex items-center gap-1.5 animate-fadeIn">
       <AlertTriangle className="w-3 h-3 flex-shrink-0" />
       <span>Addresses changed — re-optimize to update routes</span>
     </div>
   )}
  </div>
  )}

  {optimizationPlans && (
  <div className="flex flex-wrap items-center gap-2">
  <button
  onClick={() => previewedStrategy && handleApplyPlan(previewedStrategy)}
  disabled={!previewedStrategy || applyingStrategy === previewedStrategy || loading}
  className="flex items-center gap-1.5 bg-white border border-[#e8e8e8] text-[#1c1b1f] px-3 py-1.5 rounded-none text-xs font-bold hover:bg-[#f7f7f7] transition disabled:opacity-50 shadow-2xs cursor-pointer"
  >
  {applyingStrategy ? (
  <><RotateCw className="w-3.5 h-3.5 animate-spin-fast" /> Saving...</>
  ) : (
  <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Save Draft</>
  )}
  </button>
  
  <button
  onClick={async () => {
    if (!previewedStrategy) return;
    if (!confirmPublishDraft) {
      setConfirmPublishDraft(true);
      setTimeout(() => setConfirmPublishDraft(false), 3000);
      return;
    }
    setConfirmPublishDraft(false);
    
    setPublishError(null);
    setApplyingStrategy("PUBLISHING");
    
    try {
      // 1. Apply Plan
      const applyRes = await applyOptimizationPlan(previewedStrategy, isPickup);
      if (!applyRes.success) {
        setPublishError(applyRes.error || "Failed to apply plan.");
        setApplyingStrategy(null);
        return;
      }
      
      // 2. Publish Plan
      const res = await fetch("/api/optimization/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setVariations({});
        setActiveVarIndices({});
        clearOptimizationPreview();
        setPreviewedStrategy(null);
        try { sessionStorage.removeItem("opencode-opt-strategy"); } catch {}
        
        setApplySuccess(false);
        setPublishCount(data.count || 0);
        setTimeout(() => setPublishCount(null), 8000);
        fetchInitialData({ date: selectedDate, shiftId: "" });
      } else {
        const err = await res.json().catch(() => ({}));
        setPublishError(err.error || "Failed to publish routes.");
      }
    } catch (e) {
      setPublishError("Network error while publishing routes.");
    } finally {
      setApplyingStrategy(null);
    }
  }}
  disabled={!previewedStrategy || applyingStrategy !== null || loading}
  className="flex items-center gap-1.5 bg-[#ff4f00] text-white px-4 py-1.5 rounded-none text-xs font-bold hover:bg-[#e64500] transition disabled:opacity-50 shadow-2xs cursor-pointer"
  >
  {applyingStrategy === "PUBLISHING" ? (
  <><RotateCw className="w-3.5 h-3.5 animate-spin-fast" /> Publishing...</>
  ) : confirmPublishDraft ? (
  <>Click to Confirm</>
  ) : (
  <>Publish Fleet</>
  )}
  </button>

  <button
   onClick={() => {
   clearOptimizationPreview();
   setPreviewedStrategy(null);
   setHasOptimized(false);
   try { sessionStorage.removeItem("opencode-opt-strategy"); } catch {}
   }}
  className="flex items-center gap-1.5 bg-white text-[#6b6b6b] border border-[#e8e8e8] px-3 py-1.5 rounded-none text-xs font-bold hover:bg-[#f7f7f7] transition shadow-2xs cursor-pointer ml-auto"
  >
  Cancel
  </button>
  </div>
  )}

  {applySuccess && (
  <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-800 font-semibold flex items-center gap-2 animate-fadeIn">
  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
  <span>Routes saved as draft! You can review them below and click <strong>Publish Fleet</strong> when ready.</span>
  </div>
  )}

  {publishCount !== null && (
  <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-800 font-semibold flex items-center gap-2 animate-fadeIn">
  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
  <span className="flex-1">Successfully published {publishCount} routes to the fleet! ({formatDate(selectedDate)})</span>
  <button onClick={() => setPublishCount(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
  <X className="w-3.5 h-3.5" />
  </button>
  </div>
  )}

  {publishError && (
  <div className="bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700 font-semibold flex items-center gap-2 animate-fadeIn">
  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
  <span className="flex-1">{publishError}</span>
  <button onClick={() => setPublishError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
  <X className="w-3.5 h-3.5" />
  </button>
  </div>
  )}

  {!optimizationPlans && routes.some(r => r.status === "PLANNED" || r.status === "PENDING") && (
  <button
  onClick={async () => {
  if (!confirmPublishExisting) {
    setConfirmPublishExisting(true);
    setTimeout(() => setConfirmPublishExisting(false), 3000);
    return;
  }
  setConfirmPublishExisting(false);
  
  setPublishError(null);
  setApplyingStrategy("PUBLISHING");
  try {
  const res = await fetch("/api/optimization/publish", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ date: selectedDate }),
  });
  if (res.ok) {
  const data = await res.json();
  setApplySuccess(false);
  setPublishCount(data.count || 0);
  setTimeout(() => setPublishCount(null), 8000);
  fetchInitialData({ date: selectedDate, shiftId: "" });
  } else {
  const err = await res.json().catch(() => ({}));
  setPublishError(err.error || "Failed to publish routes.");
  }
  } catch (e) {
  setPublishError("Network error while publishing routes.");
  } finally {
  setApplyingStrategy(null);
  }
  }}
  disabled={applyingStrategy !== null || loading}
  className="flex items-center gap-1.5 bg-[#ff4f00] text-white px-4 py-1.5 rounded-none text-xs font-bold hover:bg-[#e64500] transition disabled:opacity-50 shadow-2xs cursor-pointer"
  >
  {applyingStrategy === "PUBLISHING" ? (
  <><RotateCw className="w-3.5 h-3.5 animate-spin-fast" /> Publishing...</>
  ) : confirmPublishExisting ? (
  <>Click to Confirm</>
  ) : (
  <>Publish Fleet</>
  )}
  </button>
  )}

  <button
 onClick={() => setShowAttendanceChecklist(!showAttendanceChecklist)}
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-bold transition border border-[#e8e8e8] cursor-pointer shadow-2xs
 ${showAttendanceChecklist ? "bg-[#1c1b1f] border-slate-900 text-white" : "bg-white text-[#4a4a4a] hover:bg-[#f7f7f7]"}
 `}
 >
 <Users className="w-3.5 h-3.5" />
 Attendance Checklist
 </button>
 </div>
 </div>
 
 {optimizeError && (
 <div className="p-4 bg-[#f7f7f7] border border-[#e8e8e8] rounded-none text-[#1c1b1f] text-xs font-bold animate-fadeIn">
 {optimizeError}
 </div>
 )}

 {/* ── Active Preview Stats Banner ─────────────────────────── */}
 {optimizationPlans && previewedStrategy && (
 <div className="bg-white border border-[#e8e8e8] rounded-none p-4 shadow-none flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn">
 <div>
 <h3 className="text-sm font-black text-[#1c1b1f]">
 Previewing: {previewedStrategy.replace("_", " ")}
 </h3>
 </div>
 <div className="flex flex-wrap items-center gap-3">
 <div className="bg-[#f7f7f7] border border-slate-100 rounded-none px-3 py-1.5 text-center">
 <div className="font-black text-sm text-[#1c1b1f]">{optimizationPlans[previewedStrategy].totalCabsUsed}</div>
 <div className="text-[#6b6b6b] text-[9px] font-bold uppercase tracking-wide">Cabs Used</div>
 </div>
 <div className="bg-[#f7f7f7] border border-slate-100 rounded-none px-3 py-1.5 text-center">
 <div className="font-black text-sm text-[#1c1b1f]">{optimizationPlans[previewedStrategy].totalDistance} km</div>
 <div className="text-[#6b6b6b] text-[9px] font-bold uppercase tracking-wide">Total Dist.</div>
 </div>
 <div className="bg-[#f7f7f7] border border-slate-100 rounded-none px-3 py-1.5 text-center">
 <div className="font-black text-sm text-[#1c1b1f]">{optimizationPlans[previewedStrategy].avgCommuteMins} min</div>
 <div className="text-[#6b6b6b] text-[9px] font-bold uppercase tracking-wide">Avg Commute</div>
 </div>
  {optimizationPlans[previewedStrategy].totalViolations > 0 ? (
  <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-1.5 text-center text-[#1c1b1f]">
  <div className="font-black text-sm">{optimizationPlans[previewedStrategy].totalViolations}</div>
  <div className="text-[9px] font-bold uppercase tracking-wide">Violations</div>
  </div>
  ) : (
  <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-none px-3 py-1.5 text-center text-[#1c1b1f]">
  <div className="font-black text-sm flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> 0</div>
  <div className="text-[9px] font-bold uppercase tracking-wide">Violations</div>
  </div>
  )}
   <div className="bg-[#f7f7f7] border border-slate-100 rounded-none px-3 py-1.5 text-center">
   <div className="font-black text-sm text-[#1c1b1f]">{optimizationPlans[previewedStrategy].totalEmployeesCovered} / {optimizationPlans.totalEmployees}</div>
   <div className="text-[#6b6b6b] text-[9px] font-bold uppercase tracking-wide">Covered</div>
   </div>
   </div>
   </div>
  )}

  {/* ── Strategy Comparison Table ─────────────────────────── */}
  {displayOptimizationPlans && previewedStrategy && (
  <div className="bg-white border border-[#e8e8e8] rounded-none p-4 shadow-none flex flex-col gap-3 animate-fadeIn">
  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#1c1b1f] uppercase tracking-wider">
  <div className="flex items-center gap-2">
  <GitCompare className="w-3.5 h-3.5 text-[#6b6b6b]" />
  Strategy Comparison
  </div>
  <select
    value={compareShiftFilter}
    onChange={(e) => setCompareShiftFilter(e.target.value)}
    className="bg-[#f7f7f7] border border-[#e8e8e8] text-xs font-bold text-[#1c1b1f] outline-none cursor-pointer focus:ring-0 px-2 py-1 rounded-none uppercase"
  >
    <option value="ALL">Overall</option>
    {shifts.map((shift) => (
      <option key={shift.id} value={shift.id}>{shift.name}</option>
    ))}
  </select>
  </div>
  <div className="overflow-x-auto">
  <table className="w-full text-xs">
  <thead>
  <tr className="border-b border-slate-100">
  <th className="text-left py-2 pr-4 font-bold text-[#6b6b6b]">Metric</th>
  <th className="text-center py-2 px-2 font-bold">MAX UTILIZATION</th>
  <th className="text-center py-2 px-2 font-bold">MINIMIZE TIME</th>
  <th className="text-center py-2 px-2 font-bold">BALANCED</th>
  <th className="text-center py-2 px-2 font-bold text-green-700">Best</th>
  </tr>
  </thead>
  <tbody>
  {[
  {
  label: "Cabs Used",
  values: [
  displayOptimizationPlans.MAXIMIZE_UTILIZATION?.totalCabsUsed ?? "-",
  displayOptimizationPlans.MINIMIZE_TIME?.totalCabsUsed ?? "-",
  displayOptimizationPlans.BALANCED?.totalCabsUsed ?? "-",
  ],
  lowerBetter: true,
  suffix: "",
  },
  {
  label: "Total Distance",
  values: [
  displayOptimizationPlans.MAXIMIZE_UTILIZATION?.totalDistance ?? "-",
  displayOptimizationPlans.MINIMIZE_TIME?.totalDistance ?? "-",
  displayOptimizationPlans.BALANCED?.totalDistance ?? "-",
  ],
  lowerBetter: true,
  suffix: " km",
  },
  {
  label: "Avg Commute",
  values: [
  displayOptimizationPlans.MAXIMIZE_UTILIZATION?.avgCommuteMins ?? "-",
  displayOptimizationPlans.MINIMIZE_TIME?.avgCommuteMins ?? "-",
  displayOptimizationPlans.BALANCED?.avgCommuteMins ?? "-",
  ],
  lowerBetter: true,
  suffix: " min",
  },
  {
  label: "Violations",
  values: [
  displayOptimizationPlans.MAXIMIZE_UTILIZATION?.totalViolations ?? "-",
  displayOptimizationPlans.MINIMIZE_TIME?.totalViolations ?? "-",
  displayOptimizationPlans.BALANCED?.totalViolations ?? "-",
  ],
  lowerBetter: true,
  suffix: "",
  },
  {
  label: "Covered",
  values: [
  displayOptimizationPlans.MAXIMIZE_UTILIZATION?.totalEmployeesCovered ?? "-",
  displayOptimizationPlans.MINIMIZE_TIME?.totalEmployeesCovered ?? "-",
  displayOptimizationPlans.BALANCED?.totalEmployeesCovered ?? "-",
  ],
  lowerBetter: false,
  suffix: ` / ${displayOptimizationPlans.totalEmployees}`,
  },
  ].map((row) => {
  const best = row.lowerBetter
  ? Math.min(...row.values)
  : Math.max(...row.values);
  const allSame = row.values.every(v => v === row.values[0]);
  return (
  <tr key={row.label} className="border-b border-slate-50">
  <td className="py-2 pr-4 font-medium text-[#4a4a4a]">{row.label}</td>
  {row.values.map((v, i) => {
  const isBest = !allSame && v === best;
  return (
  <td
  key={i}
  className={`text-center py-2 px-2 ${isBest ? "font-bold text-green-700" : ""}`}
  >
  {v}{row.suffix}
  </td>
  );
  })}
  <td className="text-center py-2 px-2">
  {allSame ? (
  <span className="text-[#9a9a9a]">—</span>
  ) : (
  <span className="text-green-700 font-bold flex items-center justify-center gap-1">
  <CheckCircle2 className="w-3 h-3" />
  {best}{row.suffix}
  </span>
  )}
  </td>
  </tr>
  );
  })}
  </tbody>
  </table>
  </div>
  </div>
  )}
 
 {/* System Configuration & Diagnostics Panel */}
 <div className="p-4 rounded-none bg-white border border-[#e8e8e8] shadow-xs flex flex-col gap-3">
 <button
 onClick={() => setShowSettings(!showSettings)}
 className="flex items-center justify-between text-xs font-bold text-[#1c1b1f] uppercase tracking-wider cursor-pointer"
 >
 <span className="flex items-center gap-2">
 <Compass className="w-4 h-4 text-[#6b6b6b]" />
 System Configuration & Diagnostics
 </span>
 </button>
 {showSettings && (
 <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 animate-fadeIn">
 <div className="flex flex-col gap-1 text-left bg-[#f7f7f7] p-3 rounded-none border border-[#e8e8e8]">
 <span className="text-[10px] font-bold text-[#4a4a4a] uppercase">Routing API Key Status</span>
 <p className="text-[11px] text-[#6b6b6b] leading-relaxed mt-1">
  The API key is configured securely on the server via <code>.env.local</code>. Route distance matrices use OSRM (open-source road network data) with automatic Haversine fallback. Geocoding and route preview maps continue using Google Maps Platform.
 </p>
 </div>
 </div>
 )}
  </div>

  {/* Cabs Availability & Capacity Edge Cases Alert Banners */}
 {isInitialOptimizerDataLoading ? (
 <div className="p-4 bg-white border border-[#e8e8e8] rounded-none flex items-start gap-2.5 text-xs text-[#1c1b1f] animate-fadeIn">
 <RotateCw className="w-5 h-5 text-[#6b6b6b] flex-shrink-0 mt-0.5 animate-spin-fast" />
 <div className="flex flex-col text-left">
 <span className="font-bold text-[#1c1b1f]">Loading Optimizer Data</span>
 <span className="mt-0.5 text-[#6b6b6b] font-medium">
 Fetching employees, cabs, shifts, and existing routes for the selected date.
 </span>
 </div>
 </div>
 ) : cabs.filter(c => c.status === "AVAILABLE").length === 0 ? (
 <div className="p-4 bg-[#f7f7f7] border border-[#e8e8e8] rounded-none flex items-start gap-2.5 text-xs text-[#1c1b1f] animate-fadeIn">
 <AlertCircle className="w-5 h-5 text-[#6b6b6b] flex-shrink-0 mt-0.5" />
 <div className="flex flex-col text-left">
 <span className="font-bold text-[#1c1b1f]">No Vehicles Available</span>
 <span className="mt-0.5 text-[#1c1b1f] font-medium">
 There are no cabs marked as AVAILABLE in the registry. Please go to <button onClick={() => router.push('/dashboard/admin/operations/cabs')} className="text-[#ff4f00] font-bold hover:underline">Operations &gt; Cabs</button> to add and register vehicles.
 </span>
 </div>
 </div>
 ) : (unassignedEmployees.length > 0) ? (
 <div className="p-4 bg-[#f7f7f7] border border-[#e8e8e8] rounded-none flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-[#1c1b1f] animate-fadeIn">
 <div className="flex items-start gap-2.5">
 <AlertTriangle className="w-5 h-5 text-[#6b6b6b] flex-shrink-0 mt-0.5 animate-pulse" />
 <div className="flex flex-col text-left">
 <span className="font-bold text-[#1c1b1f]">Fleet Capacity Exceeded — Overflow Alert</span>
 <span className="mt-0.5 text-[#1c1b1f] font-medium">
 {unassignedEmployees.length} employee(s) could not be accommodated due to routing constraints or insufficient available cab capacity.</span>
 <span className="mt-1.5 text-[10px] text-[#1c1b1f] font-mono font-bold">
 Waitlisted: {unassignedEmployees.map((emp) => `${emp.name} (${emp.address.split(",")[0]} — ${emp.shift?.name || "No Shift"})`).join(", ")}
 </span>
 </div>
 </div>
 <button
 onClick={() => {
 router.push('/dashboard/admin/operations/cabs');
 }}
 className="whitespace-nowrap px-3 py-1.5 bg-[#1c1b1f] text-white rounded-none text-[10px] font-bold hover:bg-[#1c1b1f] transition self-start md:self-auto cursor-pointer"
 >
 Register More Cabs
 </button>
 </div>
 ) : null}

 {/* Split View Map + Sidebar */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
 {/* Map */}
 <div className={`flex flex-col gap-4 transition-all duration-250
 ${showAttendanceChecklist ? "lg:col-span-5" : "lg:col-span-8"}
 `}>
 <div className="flex justify-between items-center bg-white border border-[#e8e8e8] rounded-none px-3 py-2 shadow-xs">
    <div className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider">Map View</div>
    <select
      value={mapShiftFilter}
      onChange={(e) => setMapShiftFilter(e.target.value)}
      className="bg-[#f7f7f7] border border-[#e8e8e8] text-xs font-bold text-[#1c1b1f] outline-none cursor-pointer focus:ring-0 px-2 py-1 rounded-none uppercase"
    >
      <option value="ALL">All Shifts</option>
      {shifts.map((shift) => (
        <option key={shift.id} value={shift.id}>{shift.name}</option>
      ))}
    </select>
  </div>
  <RouteVisualizer
  routes={mapShiftFilter === "ALL" ? activeRoutes : activeRoutes.filter(r => (r as any).shiftId === mapShiftFilter)}
  selectedRouteId={selectedRouteId}
  onSelectRoute={setSelectedRouteId}
  routeViewModes={routeViewModes}
  selectedEmployeeId={selectedEmployeeId}
  onSelectEmployee={setSelectedEmployeeId}
  />
 </div>

 {/* Attendance Checklist Sidebar */}
 {showAttendanceChecklist && (
 <div className="lg:col-span-3 p-5 rounded-none bg-white border border-[#e8e8e8] shadow-xs flex flex-col gap-4 max-h-[280px] md:h-[400px] lg:h-[500px] overflow-y-auto animate-fadeIn">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <h3 className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider flex items-center gap-1.5">
 <Users className="w-4 h-4 text-[#6b6b6b]" />
 Attendance Panel
 </h3>
 <button
 onClick={() => setShowAttendanceChecklist(false)}
 className="text-[#9a9a9a] hover:text-[#6b6b6b] text-xs font-extrabold cursor-pointer"
 >
 Hide
 </button>
 </div>
 
 {/* Search box */}
 <input
 type="text"
 placeholder="Search employee..."
 value={attendanceSearchQuery}
 onChange={(e) => setAttendanceSearchQuery(e.target.value)}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-[11px] py-1.5 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />

 {/* List */}
 <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
 {employees
 .filter(emp => 
 emp.name.toLowerCase().includes(attendanceSearchQuery.toLowerCase()) || 
 emp.employeeCode.toLowerCase().includes(attendanceSearchQuery.toLowerCase())
 )
 .map((emp) => {
 const isPresent = emp.status === "ACTIVE";
 return (
 <div key={emp.id} className="flex justify-between items-center p-2 bg-[#f7f7f7] border border-slate-150 rounded-none text-xs">
 <div className="flex flex-col text-left gap-0.5 max-w-[120px]">
 <span className="font-bold text-[#1c1b1f] truncate" title={emp.name}>{emp.name}</span>
 <span className="text-[9px] text-[#9a9a9a] font-mono">{emp.employeeCode}</span>
 </div>
 <button
 onClick={async () => {
 const finalStatus = isPresent ? "INACTIVE" : "ACTIVE";
 await updateEmployee(emp.id, { status: finalStatus });
 // Sync stop status for this employee across today's routes
 const today = new Date().toISOString().split("T")[0];
 const matchingStops = routes
 .filter(r => r.date === today)
 .flatMap(r => r.stops.filter((s: any) => s.employeeId === emp.id));
 for (const stop of matchingStops) {
 const newStopStatus = finalStatus === "INACTIVE" ? "SKIPPED" : "PENDING";
 await updateStopStatus(stop.routeId, stop.id, newStopStatus as any);
 }
 }}
 className={`px-2.5 py-1 rounded-none text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer
 ${isPresent 
 ? "bg-[#f7f7f7] border-emerald-250 text-[#1c1b1f] " 
 : "bg-slate-150 border-[#e8e8e8] text-[#9a9a9a]"
 }
 `}
 >
 {isPresent ? "Present" : "Absent"}
 </button>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Sidebar stops timeline */}
 <div className="lg:col-span-4 p-5 rounded-none bg-white border border-[#e8e8e8] shadow-xs flex flex-col gap-5 justify-between">
 {!selectedRoute ? (
 <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-[#e8e8e8] rounded-none bg-[#f7f7f7]/50">
 <Compass className="w-8 h-8 text-[#9a9a9a] mb-1.5 animate-pulse" />
 <h3 className="text-xs font-bold text-[#6b6b6b] uppercase tracking-widest">
 No Path Selected
 </h3>
 <p className="text-[10px] text-[#9a9a9a] mt-1 max-w-[200px] leading-relaxed">
 Click on any route path in the Nagpur map visualizer to view stop sequences and driver manifest details.
 </p>
 </div>
 ) : (
 <div className="flex-grow flex flex-col gap-4">
 <div className="border-b border-slate-100 pb-3 flex justify-between items-start">
 <div className="flex flex-col text-left">
 <span className="text-[9px] uppercase font-bold tracking-widest text-[#9a9a9a]">
 Allocated Vehicle
 </span>
   <span className="text-sm font-bold text-[#1c1b1f] flex items-center gap-1.5 mt-0.5">
   <Truck className="w-4 h-4 text-[#9a9a9a]" />
   {selectedRoute.cab.vehicleNumber}
   <span className="text-[10px] font-mono font-bold text-[#6b6b6b] bg-[#f7f7f7] border border-[#e8e8e8] px-1.5 py-0.5">
     r{selectedRoute.routeNumber || activeRoutes.filter((r: any) => r.shiftId === selectedRoute.shiftId).indexOf(selectedRoute) + 1}
   </span>
   <span className="text-[9px] text-[#6b6b6b] bg-[#f0f0f0] px-1.5 py-0.5">
     {getRouteShiftLabel(selectedRoute)}
   </span>
   </span>
 </div>
  <div className="flex flex-col items-end">
  <button
  onClick={() => { setSelectedRouteId(null); setSelectedEmployeeId(null); }}
  className="text-[#9a9a9a] hover:text-[#6b6b6b] font-bold cursor-pointer text-xs leading-none mb-1"
  >
  ✕
  </button>
  <span className="text-[9px] uppercase font-bold tracking-widest text-[#9a9a9a]">
  Score
  </span>
  <span className="text-sm font-bold text-[#1c1b1f] mt-0.5 font-mono">
  {selectedRoute.optimizationScore}/100
  </span>
  </div>
 </div>

 <div className="grid grid-cols-2 gap-2 bg-[#f7f7f7] p-2.5 rounded-none border border-[#e8e8e8] text-center font-mono text-[11px] text-[#6b6b6b]">
 <div className="flex flex-col items-center border-r border-[#e8e8e8]/80">
 <span className="text-[8px] uppercase font-bold text-[#9a9a9a]">
 Total Distance
 </span>
 <span className="text-xs text-[#1c1b1f] font-semibold mt-0.5">
 {selectedRoute.totalDistance} km
 </span>
 </div>
 <div className="flex flex-col items-center">
 <span className="text-[8px] uppercase font-bold text-[#9a9a9a]">
 Est. Commute
 </span>
 <span className="text-xs text-[#1c1b1f] font-semibold mt-0.5">
 {selectedRoute.totalDuration} mins
 </span>
 </div>
 </div>

 <div className="text-[11px] text-[#6b6b6b] flex flex-col gap-1 text-left">
 <p>
 <span className="text-[#9a9a9a]">Driver:</span> {selectedRoute.cab.driverName || "N/A"}
 </p>
 <p>
 <span className="text-[#9a9a9a]">Cab Capacity:</span> {selectedRoute.stops.length} / {selectedRoute.cab.capacity} passengers
 </p>
 <p>
 <span className="text-[#9a9a9a]">Contact:</span> {selectedRoute.cab.driverPhone || "N/A"}
 </p>
 </div>

  <div className="flex flex-col gap-3">
  <div className="flex items-center justify-between">
  <div className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a] text-left">
  Commute Manifest Itinerary Timeline
  </div>
  {/* Pickup/Drop Toggle */}
  <div className="flex items-center gap-1 bg-[#f7f7f7] p-0.5 rounded-none border border-[#e8e8e8] print:hidden">
  <button
  type="button"
  onClick={(e) => {
  e.stopPropagation();
  setRouteViewModes(prev => ({ ...prev, [selectedRoute.id]: "pickup" }));
  }}
  className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
  getEffectiveMode(selectedRoute) === "pickup"
  ? "bg-white text-[#1c1b1f] shadow-xs"
  : "text-[#9a9a9a] hover:text-[#6b6b6b]"
  }`}
  >
  Pickup
  </button>
  <button
  type="button"
  onClick={(e) => {
  e.stopPropagation();
  setRouteViewModes(prev => ({ ...prev, [selectedRoute.id]: "drop" }));
  }}
  className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
  getEffectiveMode(selectedRoute) === "drop"
  ? "bg-white text-[#1c1b1f] shadow-xs"
  : "text-[#9a9a9a] hover:text-[#6b6b6b]"
  }`}
  >
   Drop
   </button>
   </div>
  </div>
  
  <div className="relative pl-6 flex flex-col gap-4 text-left max-h-[220px] overflow-y-auto pr-1 select-none scrollbar-thin">
 {/* Connecting Line */}
 <div className="absolute left-[10px] top-2 bottom-2 w-px border-l-2 border-dashed border-[#e8e8e8]"></div>

  {/* Origin Node — always shown */}
  <div className="relative flex items-start gap-3">
  <span className="absolute -left-6 w-5 h-5 rounded-none bg-[#1c1b1f] border border-slate-700 text-white flex items-center justify-center z-10">
  <Truck className="w-3 h-3" />
  </span>
  <div className="flex-1 p-2 bg-[#f7f7f7]/80 border border-[#e8e8e8] rounded-none text-[11px] font-semibold text-[#1c1b1f]">
  <div className="flex justify-between items-center">
  <span>
    {getEffectiveMode(selectedRoute) === "pickup" ? getRouteStartAddress(selectedRoute) : "MIHAN Depot"}
  </span>
  <span className="text-[8px] bg-slate-200 text-[#6b6b6b] px-1.5 py-0.2 rounded font-bold tracking-wider uppercase font-mono">
  Depart From
  </span>
  </div>
  <p className="text-[9px] text-[#9a9a9a] font-mono mt-0.5">
    {getEffectiveMode(selectedRoute) === "pickup" ? "Route Origin" : "Central Corporate Hub"}
  </p>
  </div>
  </div>

 {/* Stops */}
  {getDisplayStops([...selectedRoute.stops].sort((a, b) => a.stopOrder - b.stopOrder), selectedRoute.id, getEffectiveMode(selectedRoute) === "pickup").map((stop, idx) => {
  const isFirst = idx === 0;
  const isLast = idx === selectedRoute.stops.length - 1;
 const isFemale = stop.employee.gender === "FEMALE";

 return (
 <div key={stop.id} className="relative flex items-start gap-3">
 {/* Stop number Marker */}
 <span className={`absolute -left-6 w-5 h-5 rounded-none flex items-center justify-center font-mono font-black text-[9px] border z-10 transition-colors
 ${
 isFemale 
 ? "bg-[#1c1b1f] border-[#1c1b1f] text-white" 
 : "bg-white border-[#d0d0d0] text-[#6b6b6b]"
 }
 `}>
  {idx + 1}
 </span>

 <div className={`flex-1 p-2 border rounded-none flex items-center justify-between text-[11px] transition-all hover:bg-[#f7f7f7]/50
 ${
 stop.status === "SKIPPED"
 ? "bg-[#f7f7f7]/40 border-red-150 text-[#9a9a9a]"
 : "bg-[#f7f7f7] border-[#e8e8e8]"
 }
 `}>
  <div className="flex flex-col text-left">
  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedEmployeeId(stop.employee.id === selectedEmployeeId ? null : stop.employee.id); }} className="text-left cursor-pointer">
  <span className="font-bold text-[#1c1b1f] flex items-center gap-1">
  {stop.employee.name}
  {isFemale && <span className="text-[8px] bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8] px-1 rounded-none font-bold">F</span>}
  </span>
  </button>
  <span className="text-[9px] text-[#6b6b6b] font-medium truncate max-w-[120px]" title={stop.employee.address}>
  {stop.employee.address.split(" | ")[0]}
  </span>
 <span className="text-[8px] text-[#9a9a9a] font-mono mt-0.5">
 ETA: +{stop.etaMinutes} mins
 </span>
 </div>

 {/* Status and Reordering buttons */}
 <div className="flex items-center gap-1.5">
 <button
 onClick={async (e) => {
 e.stopPropagation();
 await handleToggleStopStatus(stop);
 }}
 className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border cursor-pointer transition-all
 ${
 stop.status === "PENDING" ? "bg-[#f7f7f7] border-slate-350 text-slate-650" :
 stop.status === "REACHED" ? "bg-[#f7f7f7] border-[#e8e8e8] text-[#1c1b1f]" :
 stop.status === "BOARDED" ? "bg-[#f7f7f7] border-emerald-250 text-[#1c1b1f]" :
 "bg-[#f7f7f7] border-[#e8e8e8] text-[#1c1b1f]"
 }
 `}
 >
 {stop.status === "PENDING" ? "PENDING" :
 stop.status === "REACHED" ? "REACHED" :
 stop.status === "BOARDED" ? "BOARDED" : "SKIPPED"}
 </button>

 <div className="flex items-center gap-0.5">
 <button
 onClick={() => reorderRouteStops(selectedRoute.id, stop.id, "up")}
 disabled={isFirst || stop.status === "SKIPPED" || selectedRoute.stops[idx - 1]?.status === "SKIPPED"}
 className="p-1 bg-white border border-[#e8e8e8] rounded hover:bg-[#f7f7f7] text-[#6b6b6b] disabled:opacity-30 transition cursor-pointer"
 >
 <ArrowUp className="w-3 h-3" />
 </button>
 <button
 onClick={() => reorderRouteStops(selectedRoute.id, stop.id, "down")}
 disabled={isLast || stop.status === "SKIPPED" || selectedRoute.stops[idx + 1]?.status === "SKIPPED"}
 className="p-1 bg-white border border-[#e8e8e8] rounded hover:bg-[#f7f7f7] text-[#6b6b6b] disabled:opacity-30 transition cursor-pointer"
 >
 <ArrowDown className="w-3 h-3" />
 </button>
 </div>
 </div>
 </div>
 </div>
    );
    })}

  {/* Destination Node — always shown */}
  <div className="relative flex items-start gap-3">
  <span className="absolute -left-6 w-5 h-5 rounded-none bg-[#1c1b1f] border border-slate-700 text-white flex items-center justify-center z-10">
  <Truck className="w-3 h-3" />
  </span>
  <div className="flex-1 p-2 bg-[#f7f7f7]/80 border border-[#e8e8e8] rounded-none text-[11px] font-semibold text-[#1c1b1f]">
  <div className="flex justify-between items-center">
   <span>
     {getEffectiveMode(selectedRoute) === "pickup" ? "MIHAN Depot" : getRouteEndAddress(selectedRoute)}
   </span>
   <span className="text-[8px] bg-slate-200 text-[#6b6b6b] px-1.5 py-0.2 rounded font-bold tracking-wider uppercase font-mono">
   Arrive At
   </span>
   </div>
   <p className="text-[9px] text-[#9a9a9a] font-mono mt-0.5">
    {getEffectiveMode(selectedRoute) === "pickup" ? "Central Corporate Hub" : (isLastTripForCab(selectedRoute) ? "Driver End Location" : "Central Corporate Hub")}
  </p>
  </div>
  </div>
 </div>
 </div>

 </div>
 )}
 </div>
 </div>

 {/* Print Manifest Section */}
 <div className="p-5 rounded-none bg-white border border-[#e8e8e8] shadow-xs flex flex-col gap-5 print:p-0 print:border-none print:shadow-none">
 <div className="flex flex-wrap justify-between items-center border-b border-slate-100 pb-3 gap-3">
 <div className="flex flex-col text-left">
 <h2 className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider flex items-center gap-2">
 <Truck className="w-4 h-4 text-[#9a9a9a]" />
 Commuter Manifest Scheduler Dashboard
 </h2>
 <p className="text-[10px] text-[#9a9a9a]">
 Calculated sequence for Nagpur suburbs pickup/drop schedules.
 </p>
 </div>
 <div className="flex items-center gap-3">
 {/* View Mode Toggle */}
 <div className="flex items-center gap-1 bg-[#f7f7f7] p-1 rounded-none border border-[#e8e8e8] print:hidden">
 <button
 onClick={() => setActiveViewMode("CARDS")}
 className={`px-3 py-1 rounded-none text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer
 ${activeViewMode === "CARDS" ? "bg-white text-slate-950 shadow-none font-black" : "text-[#6b6b6b] hover:text-slate-850"}
 `}
 >
 Route Cards View
 </button>
 <button
 onClick={() => setActiveViewMode("TABLE")}
 className={`px-3 py-1 rounded-none text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer
 ${activeViewMode === "TABLE" ? "bg-white text-slate-950 shadow-none font-black" : "text-[#6b6b6b] hover:text-slate-850"}
 `}
 >
 Manifest Table
 </button>
 </div>

 <button
 onClick={() => setIsDispatchModalOpen(true)}
 className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1c1b1f] text-white rounded-none text-[10px] font-bold tracking-wider uppercase hover:bg-slate-805 transition print:hidden cursor-pointer"
 title="Manage Driver Unavailability & dispatch reassignment"
 >
 Driver Dispatch
 </button>
 <button
 onClick={() => window.print()}
 className="flex items-center gap-1.5 bg-[#f7f7f7] border border-[#e8e8e8] hover:bg-[#f7f7f7] text-[#6b6b6b] px-3.5 py-1.5 rounded-none text-xs font-bold transition print:hidden cursor-pointer"
 >
 <Printer className="w-3.5 h-3.5" />
 Print Manifest
 </button>
 </div>
 </div>

 {manifestRoutes.length === 0 ? (
 <div className="p-8 text-center text-[#9a9a9a] bg-[#f7f7f7]/20 border border-dashed border-slate-250 rounded-none">
 No manifest generated yet. Click Optimize Routing to generate route cards for the selected date.
 </div>
 ) : (
 <div className="flex flex-col gap-10">
  {shiftGroups.map(group => {
    
    return (
      <div key={group.shiftId} className="flex flex-col gap-4">
        <div 
          className="flex items-center gap-3 border-b border-slate-200 pb-2 cursor-pointer select-none"
          onClick={() => setExpandedShifts(prev => ({ ...prev, [group.shiftId]: !prev[group.shiftId] }))}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-6 bg-[#1c1b1f] block" />
            <h3 className="text-sm font-black text-[#1c1b1f] uppercase tracking-wider">{group.shiftLabel}</h3>
          </div>
          {group.shiftTime && (
            <span className="bg-[#f7f7f7] border border-[#e8e8e8] text-[#6b6b6b] px-2 py-0.5 text-[10px] font-bold font-mono">
              {group.shiftTime}
            </span>
          )}
          <span className="text-[#9a9a9a] text-[10px] font-bold uppercase ml-auto">
            {group.routes.length} Route{group.routes.length !== 1 ? "s" : ""}
          </span>
          {expandedShifts[group.shiftId] ? <ChevronUp className="w-4 h-4 text-[#6b6b6b]" /> : <ChevronDown className="w-4 h-4 text-[#6b6b6b]" />}
        </div>

        {expandedShifts[group.shiftId] && (
          <>
        {activeViewMode === "TABLE" ? (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
          <thead>
          <tr className="bg-[#f7f7f7] border-b border-[#e8e8e8] text-[#9a9a9a] font-mono text-[9px] uppercase tracking-wider sticky top-0 z-10">
          <th className="p-3 w-12">Sr. No.</th>
          <th className="p-3">Emp Name</th>
          <th className="p-3">Address</th>
          <th className="p-3">Shift Time</th>
          <th className="p-3">Status</th>
          </tr>
          </thead>
          
            {group.routes
              .slice()
              .sort((a, b) => (a.cab.driverName || "").localeCompare(b.cab.driverName || ""))
              .map((route, index) => {
                const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
                const tableOrderedStops = getDisplayStops(sortedStops, route.id, getEffectiveMode(route) === "pickup");
                const isSelected = selectedRouteId === route.id;

                return (
                  <tbody key={route.id} className="divide-y divide-slate-100 font-semibold text-[#4a4a4a] border-b-[4px] border-[#d1d5db]">
                    <tr className="bg-slate-100/50 border-b border-slate-200">
                      <td colSpan={5} className="p-2.5 px-3 text-left">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-[#1c1b1f] bg-white border border-[#e8e8e8] px-2 py-0.5 font-bold shadow-sm">
                            Route r{route.routeNumber || index + 1}
                          </span>
                          <span className="text-[10px] text-[#4a4a4a] font-bold flex items-center gap-1.5">
                            Driver: {route.cab.driverName || "No Driver"}
                            {route.cabId && (
                              <span className="font-mono text-[8px] bg-[#e8e8e8] text-[#4a4a4a] px-1 py-0.5 rounded-sm">
                                {getDriverTripCount(route.cabId)} Trip{getDriverTripCount(route.cabId) !== 1 ? 's' : ''}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {tableOrderedStops.map((stop, stopIndex) => {
                      return (
                        <tr
                          key={stop.id}
                          onClick={() => { setSelectedRouteId(isSelected ? null : route.id); setSelectedEmployeeId(stop.employee.id); }}
                          className={`cursor-pointer transition-all duration-150
                          ${
                            isSelected && selectedEmployeeId === stop.employee.id
                              ? "bg-[#f7f7f7]/70 border-l-[3px] border-[#ff4f00] hover:bg-[#f7f7f7]"
                              : isSelected
                              ? "bg-[#f7f7f7]/40 border-l-[3px] border-blue-600 hover:bg-[#f7f7f7]"
                              : "border-l-[3px] border-transparent hover:bg-[#f7f7f7]/50"
                          }
                          `}
                        >
                          <td className="p-3 text-[#9a9a9a] font-mono font-bold text-[10px]">
                            {stopIndex + 1}
                          </td>
                          <td className="p-3 text-[#1c1b1f] font-bold">
                            {stop.employee.name}
                          </td>
                          <td className="p-3 text-xs text-[#6b6b6b] max-w-xs truncate" title={stop.employee.address || "Unknown Address"}>
                            {stop.employee.address || "Unknown Address"}
                          </td>
                          <td className="p-3 text-[#1c1b1f]">
                            <span>
                              {group.shiftTime || group.shiftLabel}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] bg-[#f7f7f7] border border-[#e8e8e8] text-[#6b6b6b] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                              {stop.status || "PENDING"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
          </table>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-1">
            {group.routes.map((route, index) => {
          const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
          const activeViolationsCount = route.violations.filter((v: any) => !v.resolved).length;
          const isSelected = selectedRouteId === route.id;
          
          const routeVariations = variations[route.id] || [];
          const isLoadingVars = loadingVariations[route.id] || false;
          const activeVarIdx = activeVarIndices[route.id] ?? -1;
          const displayStops = (activeVarIdx !== -1 ? routeVariations[activeVarIdx].stops : sortedStops);
          const orderedStops = getDisplayStops(displayStops, route.id, getEffectiveMode(route) === "pickup");

          return (
          <div
          key={route.id}
          onClick={() => { setSelectedRouteId(isSelected ? null : route.id); setSelectedEmployeeId(null); }}
          className={`p-6 rounded-none bg-white border transition-all duration-200 flex flex-col gap-5 text-left cursor-pointer print:border-[#d0d0d0] print:shadow-none
          ${
          isSelected
          ? "border-[#1c1b1f] shadow-none ring-1 ring-slate-800/10"
          : "border-[#e8e8e8] hover:border-slate-350 shadow-xs"
          }
          `}
          >
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-100 pb-3">
          <div className="flex flex-col gap-0.5 text-left">
            <h3 className="text-lg font-bold text-[#1c1b1f] tracking-tight flex items-center gap-1.5">
            {route.cab.driverName || "Unknown Driver"}
            {route.cabId && (
              <span className="font-mono text-[9px] font-bold bg-[#e8e8e8] text-[#4a4a4a] px-1.5 py-0.5 rounded-none ml-1">
                {getDriverTripCount(route.cabId)} Trip{getDriverTripCount(route.cabId) !== 1 ? 's' : ''}
              </span>
            )}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-semibold text-[#6b6b6b] flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-[#9a9a9a]" />
                {route.cab.vehicleNumber}
              </span>
              <span className="text-[10px] text-[#9a9a9a] font-mono font-medium">
                {route.cab.driverPhone || "N/A"}
              </span>
            </div>
            
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-mono font-bold text-[#6b6b6b] bg-[#f7f7f7] border border-[#e8e8e8] px-1.5 py-0.5">
                Route r{route.routeNumber || index + 1}
              </span>
              <span className="text-[10px] text-[#6b6b6b] font-semibold uppercase tracking-wider">
                Shift: {route.shift?.startTime || (route as any).shiftTime || "N/A"}
              </span>
              <span className="text-[10px] text-[#6b6b6b] font-semibold uppercase tracking-wider">
                {route.stops.length} / {route.cab.capacity} passengers
              </span>
              {route.status && (
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border ml-auto ${
                  route.status === "ASSIGNED" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                  route.status === "PLANNED" || route.status === "PENDING" ? "bg-amber-50 border-amber-200 text-amber-700" :
                  route.status === "IN_PROGRESS" ? "bg-blue-50 border-blue-200 text-blue-700" :
                  "bg-slate-50 border-slate-200 text-slate-500"
                }`}>
                  {route.status}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-0.5 group/score relative">
          <div className="flex items-center gap-1">
          <span className="text-[8px] uppercase font-bold tracking-widest text-[#9a9a9a]">Score</span>
          <Info className="w-3 h-3 text-[#9a9a9a] cursor-help" />
          </div>
          <span className="text-sm font-bold text-[#1c1b1f] font-mono">{route.optimizationScore}/100</span>
          
          <div className="absolute right-0 top-full mt-2 w-48 p-2.5 bg-[#1c1b1f] text-white text-[10px] rounded-none shadow-xl opacity-0 invisible group-hover/score:opacity-100 group-hover/score:visible transition-all z-10 text-left">
          <div className="font-bold mb-1 border-b border-slate-700 pb-1">Score Calculation</div>
          <ul className="space-y-1 text-[#b0b0b0]">
          <li>Start: 100 points</li>
          <li>-10 per safety violation</li>
          <li>-2 per empty seat</li>
          <li>-1 per extra km traveled</li>
          </ul>
          </div>
          </div>
          </div>

          <div className="flex items-center justify-between mt-[-0.5rem]">
            {/* Pickup/Drop Toggle */}
            <div className="flex items-center gap-1 bg-[#f7f7f7] p-0.5 rounded-none border border-[#e8e8e8] self-start print:hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRouteViewModes(prev => ({ ...prev, [route.id]: "pickup" }));
                }}
                className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  getEffectiveMode(route) === "pickup"
                    ? "bg-white text-[#1c1b1f] shadow-xs"
                    : "text-[#9a9a9a] hover:text-[#6b6b6b]"
                }`}
              >
              Pickup
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRouteViewModes(prev => ({ ...prev, [route.id]: "drop" }));
                }}
                className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                  getEffectiveMode(route) === "drop"
                    ? "bg-white text-[#1c1b1f] shadow-xs"
                    : "text-[#9a9a9a] hover:text-[#6b6b6b]"
                }`}
              >
              Drop
              </button>
            </div>
            <div className="flex gap-1.5 print:hidden">
          <button
          type="button"
          onClick={(e) => {
          e.stopPropagation();
          setEditingCab(route.cab);
          }}
          className="px-2.5 py-1.5 bg-white border border-[#e8e8e8] text-[#6b6b6b] rounded-none text-[10px] font-bold hover:bg-[#f7f7f7] transition cursor-pointer"
          >
          Edit Cab
          </button>
          {!optimizationPlans && (
            <button
            type="button"
            onClick={(e) => {
            e.stopPropagation();
            setSwappingCabRouteId(route.id);
            }}
            className="px-2.5 py-1.5 bg-black text-white rounded-none text-[10px] font-bold hover:bg-black transition cursor-pointer"
            >
            Reassign Driver
            </button>
          )}
          </div>
          </div>

          {/* Variations Selector */}
          <div className="flex flex-col gap-2.5 print:hidden">
          <div className="flex justify-between items-center">
          <span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">
          Real-Road Commute Variations
          </span>
          <button
          type="button"
          onClick={(e) => {
          e.stopPropagation();
          fetchVariations(route.id);
          }}
          className="text-[9px] font-extrabold text-[#ff4f00] hover:text-[#1c1b1f] flex items-center gap-1 cursor-pointer"
          >
          <RefreshCw className={`w-3 h-3 ${isLoadingVars ? "animate-spin-fast" : ""}`} />
          {routeVariations.length > 0 ? "Recalculate Variations" : "Load Variations"}
          </button>
          </div>

          {isLoadingVars ? (
          <div className="text-center py-4 bg-[#f7f7f7]/50 rounded-none border border-dashed border-[#e8e8e8] text-[10px] font-semibold text-[#9a9a9a]">
          Computing route variations...
          </div>
          ) : routeVariations.length > 0 ? (
          <div className="flex flex-col gap-3">
          {/* Variations tabs layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 bg-[#f7f7f7] p-1 rounded-none">
          {routeVariations.filter(v => v.strategy !== "NORMAL").map((v) => {
          const originalIndex = routeVariations.findIndex(orig => orig.strategy === v.strategy);
          const isActive = activeVarIdx === originalIndex || (activeVarIdx === -1 && v.strategy === "BALANCED");
          return (
          <button
          key={v.strategy}
          type="button"
          onClick={(e) => {
          e.stopPropagation();
          setActiveVarIndices(prev => ({ ...prev, [route.id]: originalIndex }));
          }}
          className={`py-1.5 rounded-none text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer
          ${isActive ? "bg-white text-[#1c1b1f] shadow-none" : "text-[#6b6b6b] hover:text-[#1c1b1f]"}
          `}
          >
          {v.strategy}
          <div className="text-[8px] font-normal text-[#9a9a9a] normal-case font-mono mt-0.5">
          {v.totalDistance}km · {v.totalDuration}m
          </div>
          </button>
          );
          })}
          </div>

          {activeVarIdx !== -1 && (
          <div className="flex gap-2">
          <button
          type="button"
          onClick={async (e) => {
          e.stopPropagation();
          const selectedVar = routeVariations[activeVarIdx];
          const dbStopIds = selectedVar.stops.map(s => {
          const matchingActiveStop = route.stops.find(as => as.employeeId === s.employeeId);
          return matchingActiveStop?.id || "";
          }).filter(Boolean);

          await applyRouteSequence(route.id, dbStopIds, selectedVar.totalDistance, selectedVar.totalDuration);
          setActiveVarIndices(prev => {
          const next = { ...prev };
          delete next[route.id];
          return next;
          });
          }}
          className="w-full py-1.5 bg-[#1c1b1f] text-white rounded-none text-[10px] font-extrabold hover:bg-black transition cursor-pointer"
          >
          Apply selected sequence
          </button>
          <button
          type="button"
          onClick={(e) => {
          e.stopPropagation();
          setActiveVarIndices(prev => {
          const next = { ...prev };
          delete next[route.id];
          return next;
          });
          }}
          className="py-1.5 px-3 border border-[#e8e8e8] text-[#6b6b6b] rounded-none text-[10px] font-bold hover:bg-[#f7f7f7] transition cursor-pointer"
          >
          Cancel
          </button>
          </div>
          )}
          </div>
          ) : (
          <div className="text-center py-2 bg-[#f7f7f7] rounded-none border border-slate-150 text-[10px] font-semibold text-[#6b6b6b]">
          Dist: {route.totalDistance} km · Dur: {route.totalDuration} mins (road metrics)
          </div>
          )}
          </div>

          {/* Itinerary timeline stops list */}
          <div className="flex flex-col gap-3">
          <span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">
          Stops Timeline
          </span>

          <div className="relative pl-6 flex flex-col gap-3.5">
          <div className="absolute left-[9px] top-2 bottom-2 w-0.5 border-l border-dashed border-[#e8e8e8]"></div>

          {/* Depart From — always shown */}
          <div className="relative flex items-center gap-3">
          <span className="absolute -left-[23px] w-4.5 h-4.5 rounded-none bg-black border border-slate-850 text-white flex items-center justify-center font-bold text-[8px] z-10">
          🏢
          </span>
          <div className="flex-grow p-2.5 bg-slate-105 border border-slate-150 rounded-none text-left text-[11px] font-bold text-[#1c1b1f] flex justify-between items-center">
          <div>
          <span className="text-[#1c1b1f]">
            {getEffectiveMode(route) === "pickup" ? getRouteStartAddress(route) : "MIHAN Depot"}
          </span>
          <p className="text-[9px] text-[#9a9a9a] font-mono mt-0.5">Depart From</p>
          </div>
          <span className="text-[8px] bg-slate-200 text-[#6b6b6b] px-1.5 py-0.5 rounded font-black uppercase font-mono">
          Depart
          </span>
          </div>
          </div>

          {orderedStops.map((stop, idx) => {
          const isFemale = stop.employee ? stop.employee.gender === "FEMALE" : (stop as any).gender === "FEMALE";
          const empId = stop.employee ? stop.employee.id : (stop as any).employeeId;
          const empName = stop.employee ? stop.employee.name : (stop as any).employeeName;
          const empAddress = stop.employee ? stop.employee.address : (stop as any).address;
          const isMissed = stop.status === "SKIPPED" || (stop as any).status === "SKIPPED";

          return (
          <div key={stop.id || empId} className="relative flex items-center gap-3">
          <span className={`absolute -left-[23px] w-4.5 h-4.5 rounded-none flex items-center justify-center font-mono font-black text-[9px] border z-10
          ${
          isFemale
          ? "bg-[#1c1b1f] border-[#1c1b1f] text-white"
          : "bg-white border-slate-350 text-[#6b6b6b]"
          }
          `}>
          {idx + 1}
          </span>

          <div className={`flex-grow p-3 border rounded-none flex items-center justify-between gap-3 transition-all
          ${
          isMissed
          ? "bg-[#f7f7f7]/40 border-red-150 text-[#9a9a9a]"
          : "bg-white border-[#e8e8e8] hover:bg-[#f7f7f7]/50"
          }
          `}>
          <div className="flex flex-col text-left gap-0.5">
          <div className="font-extrabold text-xs text-[#1c1b1f] flex items-center gap-1.5">
          <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedEmployeeId(empId === selectedEmployeeId ? null : empId); }} className="text-left cursor-pointer">
          {isMissed ? <del>{empName}</del> : empName}
          </button>
          {isFemale && <span className="text-[8px] bg-[#f7f7f7] border border-[#e8e8e8] text-[#1c1b1f] px-1 rounded font-black uppercase">F</span>}
          </div>
          <div className="text-[10px] text-[#6b6b6b] font-semibold truncate max-w-[160px]" title={empAddress}>
          {empAddress.split(" | ")[0]}
          </div>
          <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] text-[#9a9a9a] font-mono">
          ETA: +{stop.etaMinutes} mins
          </span>
          {stop.employee && (
          <button
          type="button"
          onClick={(e) => {
          e.stopPropagation();
          setEditingEmployee(stop.employee);
          }}
          className="text-[9px] text-[#ff4f00] hover:underline font-bold print:hidden"
          >
          Edit info
          </button>
          )}
          </div>
          </div>

          {/* Attendance Toggle */}
          {stop.employee && (
          <button
          type="button"
          onClick={async (e) => {
          e.stopPropagation();
          await handleToggleStopStatus(stop as any);
          }}
          className={`px-2.5 py-1 rounded-none text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer print:hidden
          ${
          stop.status === "PENDING" ? "bg-[#f7f7f7] border-[#d0d0d0] text-slate-650 hover:bg-slate-200" :
          stop.status === "REACHED" ? "bg-[#f7f7f7] border-[#e8e8e8] text-[#1c1b1f] hover:bg-[#f7f7f7]" :
          stop.status === "BOARDED" ? "bg-[#f7f7f7] border-emerald-250 text-[#1c1b1f] hover:bg-[#f7f7f7]" :
          "bg-[#f7f7f7] border-[#e8e8e8] text-[#1c1b1f] hover:bg-[#f7f7f7]"
          }
          `}
          >
          {stop.status === "PENDING" ? "PENDING" :
          stop.status === "REACHED" ? "REACHED" :
          stop.status === "BOARDED" ? "BOARDED" : "SKIPPED"}
          </button>
          )}
          </div>
          </div>
          );
          })}

          {/* Arrive At — always shown */}
          <div className="relative flex items-center gap-3">
          <span className="absolute -left-[23px] w-4.5 h-4.5 rounded-none bg-black border border-slate-850 text-white flex items-center justify-center font-bold text-[8px] z-10">
          🏢
          </span>
          <div className="flex-grow p-2.5 bg-slate-105 border border-slate-150 rounded-none text-left text-[11px] font-bold text-[#1c1b1f] flex justify-between items-center">
          <div>
           <span className="text-[#1c1b1f]">
             {getEffectiveMode(route) === "pickup" ? "MIHAN Depot" : getRouteEndAddress(route)}
          </span>
          <p className="text-[9px] text-[#9a9a9a] font-mono mt-0.5">Arrive At</p>
          </div>
          <span className="text-[8px] bg-slate-200 text-slate-650 px-1.5 py-0.5 rounded font-black uppercase font-mono">
          Arrive (+{(activeVarIdx !== -1 ? routeVariations[activeVarIdx].totalDuration : route.totalDuration)}m)
          </span>
          </div>
          </div>
          </div>
          </div>

          {/* Violations alerts inside card */}
          {activeViolationsCount > 0 && (
          <div className="p-3 bg-[#f7f7f7] border border-red-150 rounded-none flex flex-col gap-1 text-left text-[10px] text-[#1c1b1f] font-semibold animate-pulse">
          <div className="flex items-center gap-1 font-bold text-red-950">
          <ShieldAlert className="w-4 h-4 text-[#6b6b6b]" />
          <span>{activeViolationsCount} Safety Compliance Warnings</span>
          </div>
          {route.violations.filter(v => !v.resolved).map((v, idx) => (
          <div key={getViolationKey(v, idx, route.id)} className="pl-5 leading-normal text-red-750">
          • {v.notes}
          </div>
          ))}
          </div>
          )}
          </div>
          );
          })}
          </div>
          </div>
        )}
        </>
        )}
      </div>
    );
  })}
 </div>
 )}
 </div>
  </div>

  {/* DESK 3: COMPLIANCE WARNINGS */}
  <div className={`flex flex-col gap-6 text-left ${activeDesk === "COMPLIANCE" ? "" : "hidden"}`}>
 <div>
 <h1 className="text-lg font-bold text-[#1c1b1f]">Safety Compliance Ledger</h1>
 <p className="text-xs text-[#6b6b6b]">
 Track warnings such as female first pickups, last drops, or isolated transits.
 </p>
 </div>

 {/* Active Violations */}
 {(() => {
 const activeViolations = activeViolationsList.filter(v => !v.resolved);
 const resolvedViolations = activeViolationsList.filter(v => v.resolved);

 const renderViolationCard = (v: any, idx: number) => (
 <div
 key={getViolationKey(v, idx)}
 className={`p-5 rounded-none border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${
 v.resolved
 ? "bg-[#f7f7f7] border-slate-150 opacity-75"
 : "bg-white border-[#e8e8e8] shadow-xs"
 }`}
 >
 <div className="flex-1 flex flex-col gap-1.5 text-left">
 <div className="flex flex-wrap items-center gap-2">
 <span
 className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider
 ${
 v.resolved
 ? "bg-[#f7f7f7] border border-[#e8e8e8] text-[#6b6b6b]"
 : "bg-[#f7f7f7] text-[#1c1b1f] border border-[#e8e8e8]"
 }
 `}
 >
 {v.type}
 </span>
 <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f7f7f7] border border-[#e8e8e8] text-[#6b6b6b] font-bold uppercase">
 Vehicle: {v.vehicleNumber}
 </span>
 <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f7f7f7] border border-[#e8e8e8] text-[#6b6b6b] font-bold uppercase">
 Severity: {v.severity}
 </span>
 </div>

 <p className="text-xs text-[#1c1b1f] leading-relaxed font-semibold mt-1">
 {v.notes}
 </p>

 <div className="flex items-center gap-2 text-[10px] text-[#6b6b6b]">
 <span>Driver: {v.driverName} ({v.driverPhone})</span>
 <span>•</span>
 <span>Stops: {v.totalStops}</span>
 </div>

 {v.resolved && (
 <div className="mt-2.5 p-2.5 bg-[#f7f7f7] rounded border border-[#e8e8e8] text-[10px] text-[#6b6b6b] flex items-start gap-2">
 <MessageSquare className="w-3.5 h-3.5 text-[#9a9a9a] flex-shrink-0 mt-0.5" />
 <span>
 <strong className="text-[#1c1b1f]">Audit Trail:</strong> Manual override authorized by Transport Admin.
 </span>
 </div>
 )}
 </div>

 {!v.resolved && (
 <div className="flex flex-col gap-1.5 w-full md:w-auto">
 <button
 onClick={() => overrideViolation(v.id)}
 className="whitespace-nowrap bg-[#1c1b1f] text-white hover:bg-black px-4 py-2 rounded-none text-xs font-semibold shadow-xs transition"
 >
 Authorize Override
 </button>
 <span className="text-[9px] text-[#9a9a9a] text-center font-mono uppercase tracking-wider block">
 Logs Audit Trail
 </span>
 </div>
 )}
 </div>
 );

 return (
 <>
 {activeViolations.length === 0 ? (
 <div className="py-16 text-center border border-dashed border-[#e8e8e8] rounded-none bg-white shadow-xs flex flex-col items-center justify-center gap-2">
 <CheckCircle2 className="w-8 h-8 text-[#6b6b6b] animate-pulse" />
 <h3 className="text-xs font-bold text-[#6b6b6b] uppercase tracking-widest mt-1">
 Compliance Status: Clear
 </h3>
 <p className="text-xs text-[#9a9a9a] max-w-sm leading-relaxed text-center">
 All routes satisfy security checks. Female passengers have guards or male passenger overrides.
 </p>
 </div>
 ) : (
 <div className="flex flex-col gap-4">
 <div className="flex items-center gap-2">
 <ShieldAlert className="w-4 h-4 text-[#6b6b6b]" />
 <span className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider">
 {activeViolations.length} Active Warning{activeViolations.length !== 1 ? "s" : ""}
 </span>
 </div>
 {activeViolations.map(renderViolationCard)}
 </div>
 )}

 {resolvedViolations.length > 0 && (
 <div className="flex flex-col gap-4 mt-2">
 <div className="flex items-center gap-2 border-t border-[#e8e8e8] pt-4">
 <CheckCircle2 className="w-4 h-4 text-[#9a9a9a]" />
 <span className="text-[10px] font-bold text-[#9a9a9a] uppercase tracking-wider">
 Audit History — {resolvedViolations.length} Resolved
 </span>
 </div>
 {resolvedViolations.map(renderViolationCard)}
 </div>
 )}
 </>
 );
 })()}
  </div>

  {/* DESK 4: ROI & ANALYTICS */}
  <div className={`flex flex-col gap-6 text-left ${activeDesk === "ANALYSIS" ? "" : "hidden"}`}>
 {/* Header / Top title inside the desk */}
 <div className="flex justify-between items-center flex-wrap gap-4">
 <div>
 <h1 className="text-lg font-bold text-[#1c1b1f]">Route Optimization Analytics</h1>
 <p className="text-xs text-[#6b6b6b]">
 Analyze vehicle route efficiencies, driver metrics, and cumulative distance projections.
 </p>
 </div>
  <button
  onClick={fetchAnalysisData}
  disabled={analysisLoading}
  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e8e8e8] bg-white hover:bg-[#f7f7f7] text-[#6b6b6b] rounded-none text-xs font-bold transition disabled:opacity-50 cursor-pointer"
  >
  <RefreshCw className={`w-3.5 h-3.5 ${analysisLoading ? "animate-spin-fast" : ""}`} />
  {analysisLoading ? "Recalculating..." : "Refresh Report"}
  </button>
  </div>
 {(() => {
 if (analysisLoading) {
 return (
 <div className="py-20 flex flex-col items-center justify-center bg-white border border-[#e8e8e8] rounded-none">
 <div className="w-8 h-8 rounded-full border-4 border-[#e8e8e8] border-t-[#1c1b1f] animate-spin-fast"></div>
 <p className="mt-4 text-xs font-bold text-[#9a9a9a] uppercase tracking-widest">Compiling Optimization Dataset...</p>
 </div>
 );
 }

 if (analysisError || !analysisData) {
 return (
 <div className="py-12 flex flex-col items-center justify-center bg-white border border-[#e8e8e8] rounded-none text-center px-4">
 <AlertCircle className="w-8 h-8 text-[#6b6b6b] mb-2" />
 <h3 className="text-sm font-bold text-[#1c1b1f]">Unable to load analytics</h3>
 <p className="text-xs text-[#9a9a9a] mt-1 max-w-md">
 {analysisError || "No optimized routes exist yet. Go to the Route Optimizer desk and execute optimization first."}
 </p>
 <button
 onClick={() => setActiveDesk("OPTIMIZER")}
 className="mt-4 px-4 py-2 bg-[#1c1b1f] text-white rounded-none text-xs font-bold hover:bg-black transition cursor-pointer"
 >
 Go to Route Optimizer
 </button>
 </div>
 );
 }

 const chartFilteredData = analysisData.routeBreakdowns?.filter((r: any) => 
 selectedCabsForChart.includes(r.cabPlate)
 ) || [];

 let accumulatedNormal = 0;
 let accumulatedOptimized = 0;

 const projectionData = Array.from(
 { length: projectionPeriod === "DAILY" ? 30 : projectionPeriod === "MONTHLY" ? 12 : 5 },
 (_, i) => {
 const multiplier = i + 1;
 let factor = 1.0;

 if (projectionPeriod === "DAILY") {
 // Weekend factor: Sunday (day % 7 === 0) has 20% activity, Saturday (day % 7 === 6) has 45% activity.
 // Weekdays fluctuate between 88% and 112%.
 const isSunday = multiplier % 7 === 0;
 const isSaturday = multiplier % 7 === 6;
 if (isSunday) {
 factor = 0.2;
 } else if (isSaturday) {
 factor = 0.45;
 } else {
 factor = 0.95 + (Math.sin(multiplier) * 0.12);
 }
 accumulatedNormal += analysisData.unoptimizedKm * factor;
 accumulatedOptimized += analysisData.optimizedKm * factor;
 } else if (projectionPeriod === "MONTHLY") {
 // Seasonal factor: summer break (Month 5) and winter holidays (Month 12) have less activity.
 // Other months fluctuate slightly by ±8%.
 const isSummer = multiplier === 5;
 const isDecember = multiplier === 12;
 if (isSummer) {
 factor = 0.75;
 } else if (isDecember) {
 factor = 0.8;
 } else {
 factor = 0.95 + (Math.cos(multiplier * 0.8) * 0.08);
 }
 accumulatedNormal += (analysisData.unoptimizedKm * 30) * factor;
 accumulatedOptimized += (analysisData.optimizedKm * 30) * factor;
 } else {
 // Yearly factor: operational year-on-year growth of ~5% compound, plus minor cycle variations
 factor = (1.0 + (multiplier - 1) * 0.05) * (0.95 + Math.sin(multiplier * 1.5) * 0.05);
 accumulatedNormal += (analysisData.unoptimizedKm * 365) * factor;
 accumulatedOptimized += (analysisData.optimizedKm * 365) * factor;
 }

 return {
 label: projectionPeriod === "DAILY" ? `Day ${multiplier}` : projectionPeriod === "MONTHLY" ? `Month ${multiplier}` : `Year ${multiplier}`,
 normalKm: Math.round(accumulatedNormal * 10) / 10,
 optimizedKm: Math.round(accumulatedOptimized * 10) / 10,
 };
 }
 );

 const filteredLedgerRoutes = analysisData.routeBreakdowns?.filter(
 (r: any) => ledgerCabFilter === "ALL" || r.cabPlate === ledgerCabFilter
 ) || [];

 return (
 <>
 {/* KPI Summaries */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 {/* Card 1: Daily Distance Conserved */}
 <div className="bg-white rounded-none p-5 border border-[#e8e8e8] shadow-2xs hover:shadow-xs transition">
 <div className="flex justify-between items-start mb-2">
 <span className="text-[10px] font-bold text-[#9a9a9a] uppercase tracking-wider">Daily Distance Conserved</span>
 <span className="bg-[#f7f7f7] text-[#1c1b1f] text-[9px] font-bold px-1.5 py-0.5 rounded border border-[#e8e8e8] uppercase font-mono">
 Today
 </span>
 </div>
 <div className="text-2xl font-black text-[#1c1b1f]">{analysisData.kmSavedPerDay?.toLocaleString()} km</div>
 <p className="text-[10px] text-[#9a9a9a] mt-1">Reduced from {analysisData.unoptimizedKm?.toLocaleString()} km naive length</p>
 </div>

 {/* Card 2: Monthly Projected Distance Saved */}
 <div className="bg-white rounded-none p-5 border border-[#e8e8e8] shadow-2xs hover:shadow-xs transition">
 <div className="flex justify-between items-start mb-2">
 <span className="text-[10px] font-bold text-[#9a9a9a] uppercase tracking-wider">Monthly Projected Conserved</span>
 <span className="bg-[#f7f7f7] text-[#4a4a4a] text-[9px] font-bold px-1.5 py-0.5 rounded border border-[#e8e8e8] uppercase font-mono">
 30 Days
 </span>
 </div>
 <div className="text-2xl font-black text-[#1c1b1f]">{(analysisData.kmSavedPerDay * 30)?.toLocaleString()} km</div>
 <p className="text-[10px] text-[#9a9a9a] mt-1">Extrapolated monthly optimization growth</p>
 </div>

 {/* Card 3: Yearly Projected Distance Saved */}
 <div className="bg-white rounded-none p-5 border border-[#e8e8e8] shadow-2xs hover:shadow-xs transition">
 <div className="flex justify-between items-start mb-2">
 <span className="text-[10px] font-bold text-[#9a9a9a] uppercase tracking-wider">Yearly Projected Conserved</span>
 <span className="bg-[#f7f7f7] text-[#4a4a4a] text-[9px] font-bold px-1.5 py-0.5 rounded border border-[#e8e8e8] uppercase font-mono">
 365 Days
 </span>
 </div>
 <div className="text-2xl font-black text-[#1c1b1f]">{(analysisData.kmSavedPerDay * 365)?.toLocaleString()} km</div>
 <p className="text-[10px] text-[#9a9a9a] mt-1">Extrapolated annual optimization growth</p>
 </div>

 {/* Card 4: Overall Efficiency */}
 <div className="bg-[#1c1b1f] text-white rounded-none p-5 border border-[#1c1b1f] shadow-none">
 <div className="flex justify-between items-start mb-2">
 <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Overall Efficiency Rate</span>
 <span className="bg-[#1c1b1f] text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono">
 Rate
 </span>
 </div>
 <div className="text-2xl font-black text-[#6b6b6b]">
 {analysisData.unoptimizedKm > 0 ? Math.round((analysisData.kmSavedPerDay / analysisData.unoptimizedKm) * 100) : 0}% Saved
 </div>
 <p className="text-[10px] text-[#9a9a9a] mt-1">Total optimized: {analysisData.optimizedKm?.toLocaleString()} km</p>
 </div>
 </div>

 {/* Grid for Visual Charts */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Chart 1: Route Distance Comparison */}
 <div className="bg-white rounded-none p-5 border border-[#e8e8e8] shadow-2xs flex flex-col gap-4">
 <div>
 <h3 className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider">Distance Comparison per Route</h3>
 <p className="text-[10px] text-[#9a9a9a]">
 Compares optimized vs unoptimized (naive passenger alphabetical list) route lengths in kilometers.
 </p>
 </div>

 {/* Cab Visibility Selector */}
 <div className="flex flex-col gap-1.5">
 <span className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Select Cabs for Chart:</span>
 <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto border border-slate-100 p-2 rounded-none bg-[#f7f7f7]">
 <button
 type="button"
 onClick={() => {
 const allPlates = Array.from(new Set(analysisData.routeBreakdowns?.map((r: any) => r.cabPlate) || [])) as string[];
 setSelectedCabsForChart(selectedCabsForChart.length === allPlates.length ? [] : allPlates);
 }}
 className="px-2 py-0.5 border border-[#e8e8e8] rounded text-[9px] font-bold bg-white text-slate-650 hover:bg-[#f7f7f7] cursor-pointer"
 >
 {selectedCabsForChart.length === (Array.from(new Set(analysisData.routeBreakdowns?.map((r: any) => r.cabPlate) || [])).length) ? "Deselect All" : "Select All"}
 </button>
 {Array.from(new Set(analysisData.routeBreakdowns?.map((r: any) => r.cabPlate) || [])).map((plate: any) => {
 const isChecked = selectedCabsForChart.includes(plate);
 return (
 <label
 key={plate}
 className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold cursor-pointer transition select-none
 ${isChecked 
 ? "bg-[#1c1b1f] border-slate-900 text-white shadow-xs" 
 : "bg-white border-[#e8e8e8] text-slate-655 hover:bg-[#f7f7f7]"
 }
 `}
 >
 <input
 type="checkbox"
 checked={isChecked}
 onChange={(e) => {
 if (e.target.checked) {
 setSelectedCabsForChart([...selectedCabsForChart, plate]);
 } else {
 setSelectedCabsForChart(selectedCabsForChart.filter(p => p !== plate));
 }
 }}
 className="hidden"
 />
 {plate}
 </label>
 );
 })}
 </div>
 </div>

 <div className="h-[260px] w-full text-xs font-bold mt-2">
 {isMounted && chartFilteredData.length > 0 ? (
 <ResponsiveContainer width="100%" height="100%">
 <BarChart
 data={chartFilteredData}
 margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
 >
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
 <XAxis
 dataKey="cabPlate"
 tickLine={false}
 axisLine={false}
 stroke="#94a3b8"
 tick={{ fontSize: 9 }}
 />
 <YAxis
 tickLine={false}
 axisLine={false}
 stroke="#94a3b8"
 tickFormatter={(value) => `${value} km`}
 tick={{ fontSize: 9 }}
 />
 <Tooltip
 contentStyle={{
 background: "#0f172a",
 border: "none",
 borderRadius: "8px",
 color: "#f8fafc",
 fontSize: "11px",
 }}
 itemStyle={{ color: "#f8fafc" }}
 />
 <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "10px" }} />
 <Bar name="Naive (Alphabetical)" dataKey="unoptimizedKm" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
 <Bar name="Optimized Route" dataKey="optimizedKm" fill="#059669" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 ) : (
 <div className="h-full flex items-center justify-center text-[#9a9a9a] text-xs border border-dashed border-[#e8e8e8] rounded-none bg-[#f7f7f7]/50">
 {chartFilteredData.length === 0 ? "Select one or more cabs above to view route distances" : "Loading visualization..."}
 </div>
 )}
 </div>
 </div>

 {/* Chart 2: Cumulative Distance Traveled (Comparison) */}
 <div className="bg-white rounded-none p-5 border border-[#e8e8e8] shadow-2xs flex flex-col gap-4">
 <div className="flex justify-between items-start flex-wrap gap-2 border-b border-slate-50 pb-2">
 <div>
 <h3 className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider">
 {projectionPeriod === "DAILY" ? "30-Day Cumulative Distance Growth" : 
 projectionPeriod === "MONTHLY" ? "12-Month Cumulative Distance Growth" : 
 "5-Year Cumulative Distance Growth"}
 </h3>
 <p className="text-[10px] text-[#9a9a9a]">
 Compares cumulative route distance driven between the unoptimized normal baseline and optimized routes.
 </p>
 </div>
 
 <select
 value={projectionPeriod}
 onChange={(e: any) => setProjectionPeriod(e.target.value)}
 className="bg-white border border-[#e8e8e8] rounded-none py-1.5 px-2.5 text-[10px] font-bold text-[#4a4a4a] outline-none focus:border-slate-350 cursor-pointer shadow-2xs"
 >
 <option value="DAILY">Daily (30 Days)</option>
 <option value="MONTHLY">Monthly (12 Months)</option>
 <option value="YEARLY">Yearly (5 Years)</option>
 </select>
 </div>

 <div className="h-[260px] w-full text-xs font-bold mt-2">
 {isMounted && analysisData.kmSavedPerDay > 0 ? (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart
 data={projectionData}
 margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
 >
 <defs>
 <linearGradient id="colorNormal" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
 <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
 </linearGradient>
 <linearGradient id="colorOptimized" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
 <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
 <XAxis
 dataKey="label"
 tickLine={false}
 axisLine={false}
 stroke="#94a3b8"
 tickFormatter={(val, idx) => {
 if (projectionPeriod === "DAILY") {
 return (idx + 1) % 5 === 0 || idx === 0 ? val : "";
 }
 return val;
 }}
 tick={{ fontSize: 9 }}
 />
 <YAxis
 tickLine={false}
 axisLine={false}
 stroke="#94a3b8"
 tickFormatter={(value) => `${value >= 1000 ? `${(value/1000).toFixed(0)}k` : value} km`}
 tick={{ fontSize: 9 }}
 />
 <Tooltip
 contentStyle={{
 background: "#0f172a",
 border: "none",
 borderRadius: "8px",
 color: "#f8fafc",
 fontSize: "11px",
 }}
 itemStyle={{ color: "#f8fafc" }}
 />
 <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "10px" }} />
 <Area
 type="monotone"
 name="Normal Route (Naive)"
 dataKey="normalKm"
 stroke="#94a3b8"
 strokeWidth={2}
 fillOpacity={1}
 fill="url(#colorNormal)"
 />
 <Area
 type="monotone"
 name="Optimized Route"
 dataKey="optimizedKm"
 stroke="#10b981"
 strokeWidth={2}
 fillOpacity={1}
 fill="url(#colorOptimized)"
 />
 </AreaChart>
 </ResponsiveContainer>
 ) : (
 <div className="h-full flex items-center justify-center text-[#9a9a9a] text-xs">
 {analysisData.kmSavedPerDay === 0 ? "No optimized distance metrics available yet" : "Loading visualization..."}
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Visual separator divider line */}
 <div className="border-t border-[#e8e8e8]/60 my-6"></div>

 {/* Ledger & Map Split View */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-2">
 {/* Audit & Route breakdown Table */}
 <div className="lg:col-span-7 bg-white border border-[#e8e8e8] rounded-none shadow-2xs overflow-hidden">
 <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
 <div>
 <h3 className="text-xs font-bold text-[#1c1b1f] uppercase tracking-wider">Detailed Audit Ledger</h3>
 <p className="text-[10px] text-[#9a9a9a]">Granular performance statistics for each dispatch route.</p>
 </div>
 
 <div className="flex items-center gap-3">
 <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#6b6b6b] uppercase tracking-wider">
 <span>Filter Cab:</span>
 <select
 value={ledgerCabFilter}
 onChange={(e) => setLedgerCabFilter(e.target.value)}
 className="bg-white border border-[#e8e8e8] rounded-none py-1 px-2.5 text-[10px] font-bold text-[#4a4a4a] outline-none focus:border-slate-350 cursor-pointer shadow-2xs"
 >
 <option value="ALL">All Vehicles</option>
 {Array.from(new Set(analysisData.routeBreakdowns?.map((r: any) => r.cabPlate) || [])).map((plate: any) => (
 <option key={plate} value={plate}>{plate}</option>
 ))}
 </select>
 </div>
 <span className="text-[10px] bg-[#f7f7f7] text-[#6b6b6b] font-bold px-2 py-0.5 rounded border border-[#e8e8e8] font-mono">
 {filteredLedgerRoutes.length} / {analysisData.routeBreakdowns?.length || 0} Routes
 </span>
 </div>
 </div>

 {/* Card-based ledger — no horizontal scroll */}
 <div className="flex flex-col divide-y divide-slate-100 max-h-[260px] md:h-[380px] lg:h-[480px] overflow-y-auto">
 {filteredLedgerRoutes.length === 0 ? (
 <div className="px-6 py-8 text-center text-slate-450 text-xs">
 No routes match the selected vehicle filter.
 </div>
 ) : (
 filteredLedgerRoutes.map((route: any, idx: number) => {
 const effPercent = route.unoptimizedKm > 0
 ? Math.round((route.kmSaved / route.unoptimizedKm) * 100)
 : 0;

 let ratingText = "Optimized";
 let ratingColor = "bg-[#f7f7f7] text-[#1c1b1f] border-[#e8e8e8]";
 if (effPercent > 25) {
 ratingText = "High Efficiency";
 ratingColor = "bg-[#f7f7f7] text-[#1c1b1f] border-[#e8e8e8]";
 } else if (effPercent <= 0) {
 ratingText = "Baseline";
 ratingColor = "bg-[#f7f7f7] text-[#6b6b6b] border-[#e8e8e8]";
 }

 const optimizedPct = route.unoptimizedKm > 0
 ? Math.round((route.optimizedKm / route.unoptimizedKm) * 100)
 : 100;

 const isActive = ledgerCabFilter === route.cabPlate;

 return (
 <div
 key={route.routeId || idx}
 className={`px-5 py-4 cursor-pointer transition-colors select-none ${
 isActive ? "bg-[#f7f7f7]/60" : "hover:bg-[#f7f7f7]/70"
 }`}
 onClick={() =>
 setLedgerCabFilter(isActive ? "ALL" : route.cabPlate)
 }
 >
 {/* Header row */}
 <div className="flex items-center justify-between gap-2">
 <div className="flex flex-col gap-0.5">
 <span className="font-bold text-[#1c1b1f] text-xs">{route.cabPlate}</span>
 <span className="text-[10px] text-[#9a9a9a]">Driver: {route.driverName}</span>
 </div>
 <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide flex-shrink-0 ${ratingColor}`}>
 {ratingText} · {effPercent}%
 </span>
 </div>

 {/* Metric pills */}
 <div className="mt-2.5 grid grid-cols-2 lg:grid-cols-4 gap-1.5">
 <div className="flex flex-col gap-0.5 bg-[#f7f7f7] border border-slate-100 rounded-none p-2 text-center">
 <span className="text-[8px] text-[#9a9a9a] font-bold uppercase tracking-wider">Pax</span>
 <span className="font-bold text-[#1c1b1f] text-xs">{route.passengerCount}</span>
 </div>
 <div className="flex flex-col gap-0.5 bg-[#f7f7f7] border border-slate-100 rounded-none p-2 text-center">
 <span className="text-[8px] text-[#9a9a9a] font-bold uppercase tracking-wider">Naive</span>
 <span className="font-semibold text-[#6b6b6b] text-xs">{route.unoptimizedKm} km</span>
 </div>
 <div className="flex flex-col gap-0.5 bg-[#f7f7f7] border border-slate-100 rounded-none p-2 text-center">
 <span className="text-[8px] text-[#9a9a9a] font-bold uppercase tracking-wider">Optimized</span>
 <span className="font-bold text-[#1c1b1f] text-xs">{route.optimizedKm} km</span>
 </div>
 <div className="flex flex-col gap-0.5 bg-[#f7f7f7] border border-[#e8e8e8] rounded-none p-2 text-center">
 <span className="text-[8px] text-[#1c1b1f] font-bold uppercase tracking-wider">Saved</span>
 <span className="font-bold text-[#1c1b1f] text-xs">+{route.kmSaved} km</span>
 </div>
 </div>

 {/* Comparison bar */}
 <div className="mt-2 flex items-center gap-2">
 <div className="flex-1 bg-[#f7f7f7] rounded-none h-1.5 overflow-hidden">
 <div
 className="bg-[#1c1b1f] h-full transition-all duration-500"
 style={{ width: `${Math.min(100, optimizedPct)}%` }}
 />
 </div>
 <span className="text-[9px] text-[#9a9a9a] font-bold tabular-nums">{optimizedPct}% of naive</span>
 </div>

 {isActive && (
 <div className="mt-2 text-[9px] text-[#1c1b1f] font-bold uppercase tracking-wider flex items-center gap-1">
 <span className="w-1.5 h-1.5 rounded-none bg-[#1c1b1f] inline-block"></span>
 Showing on map — click again to deselect
 </div>
 )}
 </div>
 );
 })
 )}
 </div>
 </div>

 {/* Route Visualizer Map */}
 <div className="lg:col-span-5 h-[520px]">
 {isMounted && (() => {
 // In analytics mode, we want to be able to analyze all cabs that ran on the selected date.
 // So we use 'routes' (which contains all shifts for the date) instead of activeShiftRoutes.
 const analyticsSelectedId = ledgerCabFilter !== "ALL"
 ? (analysisData?.routeBreakdowns?.find((rb: any) => rb.cabPlate === ledgerCabFilter)?.routeId || null)
 : (routes[0]?.id || null);

 return (
 <RouteVisualizer
 routes={routes}
 selectedRouteId={analyticsSelectedId}
 onSelectRoute={(routeId) => {
 const plate = routes.find((r) => r.id === routeId)?.cab?.vehicleNumber;
 if (plate) {
 setLedgerCabFilter(plate);
 } else {
 setLedgerCabFilter("ALL");
 }
 }}
 mode="ANALYTICS"
 analysisData={analysisData}
 />
 );
 })()}
 </div>
 </div>
 </>
 );
 })()}
  </div>

  <div className={`flex flex-col gap-6 text-left ${activeDesk === "MANUAL_ROUTING" ? "" : "hidden"}`}>
    <div className="bg-white p-6 border border-[#e8e8e8] rounded-none shadow-xs mt-8">
      <h2 className="text-sm font-bold text-[#1c1b1f] uppercase tracking-wider mb-2 flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-[#ff4f00]" />
        Import Manual Routing Baseline
      </h2>
      <p className="text-xs text-[#6b6b6b] mb-6 max-w-2xl">
        Upload your existing Excel roster to visualize the human-planned routes on the map. This will NOT overwrite the production database or active optimizations. It is purely an in-browser sandbox for visual comparison and auditing.
      </p>

      {!manualRoutes ? (
        <div className="border-2 border-dashed border-[#e8e8e8] hover:border-[#ff4f00] bg-[#f7f7f7] transition-colors p-8 flex flex-col items-center justify-center relative group">
          <input
            type="file"
            accept=".xlsx, .xls"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploadingExcel(true);
              setExcelError(null);
              
              const formData = new FormData();
              formData.append("file", file);

              try {
                const res = await fetch("/api/optimization/excel-routes", {
                  method: "POST",
                  body: formData
                });
                const data = await res.json();
                if (res.ok) {
                  const totalCabs = data.routes.length;
                  const totalStops = data.routes.reduce((acc: number, r: any) => acc + (r.stops?.length || 0), 0);
                  
                  setManualRoutes(data.routes);
                  setExcelMetrics({ totalCabs, totalStops, skipped: data.skippedRows });
                  
                  // Clear file input
                  e.target.value = "";
                } else {
                  setExcelError(data.error || "Failed to parse Excel");
                }
              } catch (err) {
                setExcelError("Network error uploading file");
              } finally {
                setUploadingExcel(false);
              }
            }}
            disabled={uploadingExcel}
          />
          <Upload className={`w-8 h-8 mb-3 transition-colors ${uploadingExcel ? "text-[#ff4f00] animate-bounce" : "text-[#9a9a9a] group-hover:text-[#ff4f00]"}`} />
          <div className="text-sm font-bold text-[#1c1b1f] mb-1">
            {uploadingExcel ? "Parsing Excel File..." : "Click or drag roster.xlsx here"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[#9a9a9a] font-bold">
            Supports .xlsx formats with standard columns
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-fadeIn">
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <div className="text-xs font-bold">
                {publishManualSuccess ? "Manual fleet published successfully to production!" : "Manual roster parsed and mapped successfully."}
              </div>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <button
                onClick={() => {
                  setManualRoutes(null);
                  setPublishManualSuccess(false);
                }}
                className="text-[10px] uppercase font-bold text-[#6b6b6b] hover:text-[#1c1b1f] border border-[#e8e8e8] px-3 py-1.5 bg-white cursor-pointer transition-colors shadow-2xs"
              >
                Clear & Upload New
              </button>
              {!publishManualSuccess && (
                <button
                  disabled={publishingManual}
                  onClick={() => setIsPublishManualModalOpen(true)}
                  className={`text-white px-4 py-1.5 font-bold text-xs transition-colors shadow-sm flex items-center gap-2 ${publishingManual ? "bg-[#ff4f00]/70 cursor-not-allowed" : "bg-[#ff4f00] hover:bg-[#e64600] cursor-pointer"}`}
                >
                  {publishingManual ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5" /> 
                  )}
                  {publishingManual ? "Publishing..." : "Publish Manual Fleet"}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-8 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {Array.from(new Set(manualRoutes.map((r: any) => r.shiftId || activeShiftId))).map((sId: any) => {
              const shiftRoutes = manualRoutes.filter((r: any) => (r.shiftId || activeShiftId) === sId);
              const shiftTimeLabel = shiftRoutes[0]?.shiftTime || String(sId);
              return (
                <div key={String(sId)} className="flex flex-col gap-4">
                  <div className="text-[10px] font-bold text-[#9a9a9a] uppercase tracking-wider border-b border-[#e8e8e8] pb-2">
                    Route Sequences (Shift: {shiftTimeLabel})
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
                    {shiftRoutes.map((route: any, i: number) => {
                      const isActive = selectedRouteId === route.cabId;
                      return (
                        <div
                          key={`${route.cabId}-${i}`}
                          className={`border transition-all cursor-pointer bg-white ${
                            isActive ? "border-[#1c1b1f] shadow-md scale-[1.02]" : "border-[#e8e8e8] hover:border-[#b0b0b0]"
                          }`}
                          onClick={() => setSelectedRouteId(isActive ? null : route.cabId)}
                        >
                          <div className="p-3 bg-[#f7f7f7] border-b border-[#e8e8e8] flex justify-between items-center">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-[#1c1b1f]">{route.driverName || "Unknown Driver"}</span>
                              <span className="text-[10px] font-semibold text-[#6b6b6b]">{route.vehicleNumber}</span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-bold">{route.stops.length} Stops</span>
                              <span className="text-[9px] text-[#9a9a9a]">{route.totalDistance ? `${route.totalDistance.toFixed(1)} km` : "No Dist"}</span>
                            </div>
                          </div>
                          {isActive && (
                            <div className="p-3 bg-white flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                              {route.stops.map((stop: any, sIdx: number) => (
                                <div key={sIdx} className="flex gap-2">
                                  <div className="w-4 h-4 mt-0.5 rounded-full bg-[#f7f7f7] border border-[#e8e8e8] flex items-center justify-center text-[8px] font-bold text-[#6b6b6b] shrink-0">
                                    {stop.stopOrder}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-[#1c1b1f]">
                                      {stop.employee?.name || stop.employeeName || "Unknown Employee"}
                                    </span>
                                    <span className="text-[9px] text-[#6b6b6b] truncate max-w-[200px]" title={stop.employee?.address || stop.address}>
                                      {stop.employee?.address || stop.address || "Unknown Address"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {excelError && (
        <div className="mt-4 bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700 font-semibold flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          {excelError}
        </div>
      )}
    </div>
  </div>

  </main>

 {/* Edit Employee Modal */}
 {editingEmployee && (
 <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 max-w-md w-full shadow-sm text-left animate-fadeIn flex flex-col gap-4">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <h3 className="text-sm font-bold text-[#1c1b1f] uppercase tracking-wider">
 Edit Employee Details
 </h3>
 <button
 onClick={() => setEditingEmployee(null)}
 className="text-[#9a9a9a] hover:text-[#6b6b6b] font-bold cursor-pointer"
 >
 ✕
 </button>
 </div>
 
 <form
 onSubmit={async (e) => {
 e.preventDefault();
 const form = e.target as any;
 const updatedData = {
 name: form.name.value,
 gender: form.gender.value,
 phone: form.phone.value,
 email: form.email.value,
 address: form.address.value,
 department: form.department.value,
 status: form.status.value,
 shiftId: form.shiftId.value || null,
 };
 await updateEmployee(editingEmployee.id, updatedData);
 setEditingEmployee(null);
 }}
 className="flex flex-col gap-3.5"
 >
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Employee Code</label>
 <input
 type="text"
 disabled
 value={editingEmployee.employeeCode}
 className="w-full bg-[#f7f7f7] border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none text-[#6b6b6b]"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Name</label>
 <input
 type="text"
 name="name"
 required
 defaultValue={editingEmployee.name}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Gender</label>
 <select
 name="gender"
 defaultValue={editingEmployee.gender}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 >
 <option value="MALE">MALE</option>
 <option value="FEMALE">FEMALE</option>
 </select>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Phone</label>
 <input
 type="text"
 name="phone"
 defaultValue={editingEmployee.phone}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Email</label>
 <input
 type="email"
 name="email"
 defaultValue={editingEmployee.email}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Address / Pickup Area</label>
 <input
 type="text"
 name="address"
 required
 defaultValue={editingEmployee.address}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Department</label>
 <input
 type="text"
 name="department"
 defaultValue={editingEmployee.department}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Status</label>
 <select
 name="status"
 defaultValue={editingEmployee.status}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 >
 <option value="ACTIVE">ACTIVE (Present)</option>
 <option value="INACTIVE">INACTIVE (Absent)</option>
 </select>
 </div>
 </div>

 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Shift Assignment</label>
 <select
 name="shiftId"
 defaultValue={editingEmployee.shiftId || ""}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 >
 <option value="">No Active Shift</option>
 {shifts.map((s) => (
 <option key={s.id} value={s.id}>
 {s.name} ({s.startTime})
 </option>
 ))}
 </select>
 </div>

 <div className="flex justify-end gap-2 mt-2 border-t border-slate-100 pt-3">
 <button
 type="button"
 onClick={() => setEditingEmployee(null)}
 className="px-4 py-2 border border-[#e8e8e8] rounded-none text-xs font-bold text-[#6b6b6b] hover:bg-[#f7f7f7] cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="px-4 py-2 bg-[#1c1b1f] text-white rounded-none text-xs font-bold hover:bg-slate-805 cursor-pointer"
 >
 Save Changes
 </button>
 </div>
 </form>
 </div>
 </div>
 )}

 {/* Edit Cab / Driver Modal */}
 {editingCab && (
 <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 max-w-md w-full shadow-sm text-left animate-fadeIn flex flex-col gap-4">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <h3 className="text-sm font-bold text-[#1c1b1f] uppercase tracking-wider">
 Edit Cab & Driver Registry
 </h3>
 <button
 onClick={() => setEditingCab(null)}
 className="text-[#9a9a9a] hover:text-slate-650 font-bold cursor-pointer"
 >
 ✕
 </button>
 </div>
 
 <form
 onSubmit={async (e) => {
 e.preventDefault();
 const form = e.target as any;
 const updatedData = {
 vehicleNumber: form.vehicleNumber.value,
 capacity: form.capacity.value,
 vendor: form.vendor.value,
 driverName: form.driverName.value,
 driverPhone: form.driverPhone.value,
 licenseNumber: form.licenseNumber.value,
 driverAddress: form.driverAddress.value,
 status: form.status.value,
 };
 await updateCab(editingCab.id, updatedData);
 setEditingCab(null);
 }}
 className="flex flex-col gap-3.5"
 >
 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Vehicle Plate Number</label>
 <input
 type="text"
 name="vehicleNumber"
 required
 defaultValue={editingCab.vehicleNumber}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Seat Capacity</label>
 <select
 name="capacity"
 defaultValue={editingCab.capacity}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 >
 <option value="4">4 Seater</option>
 <option value="6">6 Seater</option>
 <option value="7">7 Seater</option>
 </select>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Vendor</label>
 <input
 type="text"
 name="vendor"
 defaultValue={editingCab.vendor}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Cab Status</label>
 <select
 name="status"
 defaultValue={editingCab.status}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 >
 <option value="AVAILABLE">AVAILABLE (On Duty)</option>
 <option value="MAINTENANCE">MAINTENANCE (Off Duty)</option>
 </select>
 </div>
 </div>

 <div className="border-t border-slate-100 my-1 pt-3 text-left">
 <h4 className="text-[10px] font-extrabold text-[#9a9a9a] uppercase tracking-wider mb-2">Driver Assignment</h4>
 
 <div className="flex flex-col gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Driver Name</label>
 <input
 type="text"
 name="driverName"
 required
 defaultValue={editingCab.driverName || ""}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Home Address / Starting Point</label>
 <input
 type="text"
 name="driverAddress"
 placeholder="e.g. Pratap Nagar, Nagpur"
 defaultValue={editingCab.driverAddress || ""}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">Driver Contact Mob</label>
 <input
 type="text"
 name="driverPhone"
 defaultValue={editingCab.driverPhone || ""}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[9px] font-extrabold uppercase text-[#9a9a9a]">License ID</label>
 <input
 type="text"
 name="licenseNumber"
 defaultValue={editingCab.licenseNumber || ""}
 className="w-full bg-white border border-[#e8e8e8] rounded-none text-xs py-2 px-3 focus:outline-none focus:border-[#d0d0d0]"
 />
 </div>
 </div>
 </div>
 </div>

 <div className="flex justify-end gap-2 mt-2 border-t border-slate-100 pt-3">
 <button
 type="button"
 onClick={() => setEditingCab(null)}
 className="px-4 py-2 border border-[#e8e8e8] rounded-none text-xs font-bold text-[#6b6b6b] hover:bg-[#f7f7f7] cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="px-4 py-2 bg-[#1c1b1f] text-white rounded-none text-xs font-bold hover:bg-slate-805 cursor-pointer"
 >
 Save Changes
 </button>
 </div>
 </form>
 </div>
 </div>
 )}

 {/* Driver Dispatch Control Modal */}
 {isDispatchModalOpen && (
 <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 max-w-lg w-full shadow-sm text-left animate-fadeIn flex flex-col gap-4">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <h3 className="text-sm font-bold text-[#1c1b1f] uppercase tracking-wider flex items-center gap-2">
 Dispatch Control
 </h3>
 <button
 onClick={() => {
 setIsDispatchModalOpen(false);
 setDispatchCab(null);
 setDispatchResult(null);
 setDispatchMode("FULL_DAY");
 }}
 className="text-[#9a9a9a] hover:text-slate-650 font-bold cursor-pointer"
 >
 ✕
 </button>
 </div>

 {!dispatchResult ? (
 <form
 onSubmit={(e) => {
 e.preventDefault();
 if (!dispatchCab) { alert("Select an absent driver."); return; }
 if (!dispatchReplacementCabId) { alert("Select a replacement driver."); return; }
 if (dispatchCab.id === dispatchReplacementCabId) { alert("Absent and replacement driver cannot be the same."); return; }
 
 setTemporaryReplacements(prev => ({ ...prev, [dispatchCab.id]: dispatchReplacementCabId }));
 setDispatchResult({ message: `Driver ${dispatchCab.driverName} has been temporarily replaced by the selected driver for today's dispatch. Original assignments will remain unchanged.` });
 }}
 className="flex flex-col gap-4"
 >
 <div className="flex flex-col gap-3">
 <p className="text-[11px] text-[#6b6b6b] leading-relaxed border-b border-slate-100 pb-3">
 Temporarily substitute an absent driver for today's operational cycle. Existing database routes and permanent assignments will not be altered.
 </p>

 <div className="flex flex-col gap-1.5">
 <label className="text-[10px] font-bold text-[#1c1b1f] uppercase tracking-wider">
 Absent Driver
 </label>
 <select
 className="w-full px-3 py-2 border border-[#e8e8e8] rounded-none text-xs text-[#1c1b1f] bg-white focus:outline-none focus:border-slate-400 transition"
 required
 value={dispatchCab?.id || ""}
 onChange={(e) => {
 const cab = cabs.find(c => c.id === e.target.value);
 setDispatchCab(cab || null);
 }}
 >
 <option value="" disabled>Select absent driver...</option>
 {cabs.map(cab => (
 <option key={cab.id} value={cab.id}>
 {cab.driverName || "Unknown Driver"} ({cab.vehicleNumber}) {temporaryReplacements[cab.id] ? "[ALREADY REPLACED]" : ""}
 </option>
 ))}
 </select>
 </div>

 <div className="flex flex-col gap-1.5">
 <label className="text-[10px] font-bold text-[#1c1b1f] uppercase tracking-wider">
 Replacement Driver
 </label>
 <select
 className="w-full px-3 py-2 border border-[#e8e8e8] rounded-none text-xs text-[#1c1b1f] bg-white focus:outline-none focus:border-slate-400 transition"
 required
 value={dispatchReplacementCabId}
 onChange={(e) => setDispatchReplacementCabId(e.target.value)}
 >
 <option value="" disabled>Select temporary replacement...</option>
 {cabs.map(cab => (
 <option key={`rep-${cab.id}`} value={cab.id} disabled={cab.status === "MAINTENANCE"}>
 {cab.driverName || "Unknown Driver"} ({cab.vehicleNumber}) {cab.status === "MAINTENANCE" ? "[UNAVAILABLE]" : ""}
 </option>
 ))}
 </select>
 </div>
 </div>

 <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-2">
 <button
 type="button"
 onClick={() => { setIsDispatchModalOpen(false); setDispatchCab(null); setDispatchReplacementCabId(""); }}
 className="px-4 py-2 border border-[#e8e8e8] rounded-none text-xs font-bold text-[#6b6b6b] hover:bg-[#f7f7f7] cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="px-4 py-2 bg-black text-white rounded-none text-xs font-bold hover:bg-slate-900 transition cursor-pointer"
 >
 Apply Temporary Replacement
 </button>
 </div>
 </form>
 ) : (
 <div className="flex flex-col gap-4">
 <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs leading-relaxed">
 <span className="font-bold block mb-1">Replacement Active</span>
 {dispatchResult.message}
 </div>
 
 <div className="flex justify-end items-center gap-2 border-t border-slate-100 pt-3 mt-2">
 <button
 type="button"
 onClick={() => {
 const newReps = { ...temporaryReplacements };
 delete newReps[dispatchCab?.id || ""];
 setTemporaryReplacements(newReps);
 setIsDispatchModalOpen(false);
 setDispatchCab(null);
 setDispatchResult(null);
 setDispatchReplacementCabId("");
 }}
 className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-none text-xs font-bold hover:bg-red-100 cursor-pointer"
 >
 Remove Replacement
 </button>
 <button
 onClick={() => {
 setIsDispatchModalOpen(false);
 setDispatchCab(null);
 setDispatchResult(null);
 setDispatchReplacementCabId("");
 }}
 className="px-4 py-2 bg-[#f7f7f7] border border-[#e8e8e8] text-[#1c1b1f] rounded-none text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
 >
 Done
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 )}

 {/* Swap Cab/Driver Modal */}
 {swappingCabRouteId && (
 <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
 <div className="bg-white border border-[#e8e8e8] rounded-none p-6 max-w-md w-full shadow-sm text-left animate-fadeIn flex flex-col gap-4">
 <div className="flex justify-between items-center border-b border-slate-100 pb-2">
 <h3 className="text-sm font-bold text-[#1c1b1f] uppercase tracking-wider">
 Reassign Driver
 </h3>
 <button
 onClick={() => setSwappingCabRouteId(null)}
 className="text-[#9a9a9a] hover:text-slate-650 font-bold cursor-pointer"
 >
 ✕
 </button>
 </div>
 
 <p className="text-[11px] text-[#6b6b6b] leading-normal">
 Select an available driver to take over this route. They can use any vehicle they have access to. The passenger list remains unchanged.
 </p>

 <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto">
 {cabs
 .filter(cab => cab.status === "AVAILABLE")
 .map((cab) => {
 const isAssigned = routes.some(r => r.cabId === cab.id && r.shiftId === activeShiftId);
 return (
 <div
 key={cab.id}
 onClick={async () => {
 try {
 await swapRouteCab(swappingCabRouteId, cab.id);
 setSwappingCabRouteId(null);
 alert(`Driver swapped! Route successfully assigned to ${cab.driverName || 'Driver'}`);
 } catch (error: any) {
 alert(error.message || "Failed to reassign driver.");
 }
 }}
 className="p-3.5 border border-[#e8e8e8] hover:border-slate-350 hover:bg-[#f7f7f7] rounded-none cursor-pointer flex justify-between items-center transition"
 >
 <div className="flex flex-col text-left">
 <span className="text-xs font-bold text-[#1c1b1f]">{cab.driverName || "Unknown Driver"}</span>
 <span className="text-[10px] text-[#6b6b6b]">Vehicle: {cab.vehicleNumber} ({cab.capacity} seats) · {cab.vendor}</span>
 </div>
 {isAssigned ? (
 <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#f7f7f7] text-[#1c1b1f] rounded border border-[#e8e8e8] uppercase">
 Active
 </span>
 ) : (
 <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#f7f7f7] text-[#1c1b1f] rounded border border-emerald-250 uppercase">
 Available
 </span>
 )}
 </div>
 );
 })}
 </div>

 <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
 <button
 onClick={() => setSwappingCabRouteId(null)}
 className="px-4 py-2 border border-[#e8e8e8] rounded-none text-xs font-bold text-[#6b6b6b] hover:bg-[#f7f7f7] cursor-pointer"
 >
 Close
 </button>
 </div>
 </div>
 </div>
  )}

  <CompareModal
    isOpen={compareOpen}
    onClose={() => setCompareOpen(false)}
    date={selectedDate}
    optimizationPlans={optimizationPlans}
    fallbackRoutes={activeRoutes}
  />

      <ConfirmModal
        isOpen={isPublishManualModalOpen}
        onClose={() => setIsPublishManualModalOpen(false)}
        onConfirm={handlePublishManualRoutes}
        title="Publish Manual Routes"
        message="Are you sure you want to publish these manual routes? This will overwrite existing active routes for the selected date and shift."
        confirmText="Publish Routes"
      />
    </div>
  );
}
