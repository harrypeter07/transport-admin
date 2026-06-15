import { create } from "zustand";

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  gender: "MALE" | "FEMALE";
  phone: string;
  email: string;
  address: string;
  x: number;
  y: number;
  formattedAddress?: string | null;
  department: string;
  shiftId: string | null;
  status: string;
  shift?: Shift;
}


export interface Cab {
  id: string;
  vehicleNumber: string;
  capacity: number;
  vendor: string;
  status: string;
  driverName?: string | null;
  driverPhone?: string | null;
  licenseNumber?: string | null;
  driverAddress?: string | null;
  driverX?: number | null;
  driverY?: number | null;
  formattedAddress?: string | null;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface RouteStop {
  id: string;
  routeId: string;
  employeeId: string;
  employee: Employee;
  stopOrder: number;
  etaMinutes: number;
  status: "PENDING" | "REACHED" | "BOARDED" | "SKIPPED";
}

export interface Violation {
  id: string;
  routeId: string;
  type: "FEMALE_FIRST_PICKUP" | "FEMALE_LAST_DROP" | "OVERCAPACITY" | "ISOLATED_FEMALE";
  severity: "HIGH" | "MEDIUM";
  resolved: boolean;
  notes: string | null;
}

export interface Route {
  id: string;
  cabId: string;
  cab: Cab;
  date: string;
  shiftId: string;
  shift: Shift;
  isPickup: boolean;
  totalDistance: number;
  totalDuration: number;
  status: "PENDING" | "PLANNED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  optimizationScore: number;
  stops: RouteStop[];
  violations: Violation[];
  hasEscort?: boolean; // client-side toggle representation
  tripSequence?: number;
  routeNumber?: number;
}


export interface StrategyPlan {
  routes: any[];
  totalCabsUsed: number;
  totalEmployeesCovered: number;
  totalDistance: number;
  avgCommuteMins: number;
  totalViolations: number;
}

export interface OptimizationPlans {
  MAXIMIZE_UTILIZATION: StrategyPlan;
  MINIMIZE_TIME: StrategyPlan;
  BALANCED: StrategyPlan;
  capacityShortfall: number;
  totalCabCapacity: number;
  totalEmployees: number;
  isolatedEmployees?: Array<{
    employeeId: string;
    name: string;
    distanceFromCorridorKm: number;
    nearestNeighborKm: number;
    suggestedAction: string;
  }>;
  releasedCabs?: Array<{ cabId: string; vehicleNumber: string; reason: string }>;
  usingFallback?: boolean;
  zoneSummary?: Record<string, { employees: number; cabs: number }>;
}

const STORAGE_PLANS_KEY = "opencode-opt-plans";
const STRATEGY_KEYS = ["MAXIMIZE_UTILIZATION", "MINIMIZE_TIME", "BALANCED"] as const;

function mergeStrategyPlan(plans: StrategyPlan[]): StrategyPlan {
  const routes = plans.flatMap((plan) => plan.routes);
  const allDurations = routes.flatMap((route) =>
    (route.stops || []).map((stop: any) => stop.etaMinutes).filter((mins: any) => typeof mins === "number")
  );

  return {
    routes,
    totalCabsUsed: routes.length,
    totalEmployeesCovered: new Set(routes.flatMap((route) => (route.stops || []).map((stop: any) => stop.employeeId))).size,
    totalDistance: Math.round(routes.reduce((sum, route) => sum + (route.totalDistance || 0), 0) * 10) / 10,
    avgCommuteMins: allDurations.length
      ? Math.round(allDurations.reduce((sum, mins) => sum + mins, 0) / allDurations.length)
      : 0,
    totalViolations: routes.reduce(
      (sum, route) => sum + (route.violations || []).filter((violation: any) => !violation.resolved).length,
      0
    ),
  };
}

function mergeOptimizationPlans(previews: OptimizationPlans[]): OptimizationPlans {
  const isolatedMap = new Map<string, NonNullable<OptimizationPlans["isolatedEmployees"]>[number]>();
  const releasedMap = new Map<string, NonNullable<OptimizationPlans["releasedCabs"]>[number]>();

  for (const preview of previews) {
    for (const iso of preview.isolatedEmployees || []) {
      isolatedMap.set(iso.employeeId, iso);
    }
    for (const cab of preview.releasedCabs || []) {
      releasedMap.set(cab.cabId, cab);
    }
  }

  return {
    MAXIMIZE_UTILIZATION: mergeStrategyPlan(previews.map((preview) => preview.MAXIMIZE_UTILIZATION)),
    MINIMIZE_TIME: mergeStrategyPlan(previews.map((preview) => preview.MINIMIZE_TIME)),
    BALANCED: mergeStrategyPlan(previews.map((preview) => preview.BALANCED)),
    capacityShortfall: previews.reduce((sum, preview) => sum + (preview.capacityShortfall || 0), 0),
    totalCabCapacity: previews.reduce((sum, preview) => sum + (preview.totalCabCapacity || 0), 0),
    totalEmployees: previews.reduce((sum, preview) => sum + (preview.totalEmployees || 0), 0),
    isolatedEmployees: [...isolatedMap.values()],
    releasedCabs: [...releasedMap.values()],
    usingFallback: previews.some((p) => p.usingFallback),
    zoneSummary: previews.reduce(
      (merged, preview) => {
        for (const [key, val] of Object.entries(preview.zoneSummary || {})) {
          if (!merged[key]) merged[key] = { employees: 0, cabs: 0 };
          merged[key].employees += val.employees;
          merged[key].cabs += val.cabs;
        }
        return merged;
      },
      {} as Record<string, { employees: number; cabs: number }>
    ),
  };
}

function tagPreviewRoutes(preview: OptimizationPlans, shift: Shift): OptimizationPlans {
  const tagged = { ...preview } as OptimizationPlans;

  STRATEGY_KEYS.forEach((key) => {
    tagged[key] = {
      ...preview[key],
      routes: preview[key].routes.map((route) => ({
        ...route,
        shiftId: shift.id,
        shift,
      })),
    };
  });

  return tagged;
}

interface TransportStore {
  employees: Employee[];
  cabs: Cab[];
  shifts: Shift[];
  routes: Route[];
  activeShiftId: string;
  selectedDate: string; // ISO date string: YYYY-MM-DD
  selectedRouteId: string | null;
  loading: boolean;
  optimizationPlans: OptimizationPlans | null;
  isolatedEmployeeIds: string[];
  previewing: boolean;
  manualRoutes: any[] | null;
  excelMetrics: any | null;
  absentEmployeeCodes: string[];
  
  // Actions
  fetchInitialData: (opts?: { date?: string; shiftId?: string }) => Promise<void>;
  setActiveShiftId: (shiftId: string) => void;
  setSelectedDate: (date: string) => void;
  setSelectedRouteId: (routeId: string | null) => void;
  runOptimization: (isPickup: boolean, apiKey?: string, mode?: string) => Promise<{ success: boolean; error?: string }>;
  previewOptimization: (isPickup: boolean) => Promise<{ success: boolean; error?: string }>;
  applyOptimizationPlan: (strategy: keyof OptimizationPlans, isPickup: boolean) => Promise<{ success: boolean; error?: string }>;
  clearOptimizationPreview: () => void;
  updateStopStatus: (routeId: string, stopId: string, status: "PENDING" | "REACHED" | "BOARDED" | "SKIPPED") => Promise<void>;
  reorderRouteStops: (routeId: string, stopId: string, direction: "up" | "down") => Promise<void>;
  moveStopBetweenRoutes: (stopId: string, fromRouteId: string, toRouteId: string) => Promise<{ success: boolean; error?: string }>;
  overrideViolation: (violationId: string) => Promise<void>;
  addEmployee: (employee: any) => Promise<{ success: boolean; error?: string }>;
  updateEmployee: (id: string, employee: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  addCab: (cab: any) => Promise<void>;
  updateCab: (id: string, cab: any) => Promise<void>;
  deleteCab: (id: string) => Promise<void>;
  applyRouteSequence: (routeId: string, stopIds: string[], distance: number, duration: number) => Promise<void>;
  swapRouteCab: (routeId: string, cabId: string, overrideDetourWarning?: boolean) => Promise<void>;
  assignShiftsToAllCabs: () => Promise<{ fixed: number; total: number }>;
  setRoutes: (routes: Route[]) => void;
  setManualRoutes: (routes: any[] | null) => void;
  setExcelMetrics: (metrics: any | null) => void;
  setAbsentEmployeeCodes: (codes: string[]) => void;
}

function storeLog(...args: unknown[]) {
  console.info("[store]", ...args);
}

export const useTransportStore = create<TransportStore>((set, get) => ({
  employees: [],
  cabs: [],
  shifts: [],
  routes: [],
  activeShiftId: "",
  selectedDate: new Date().toISOString().split("T")[0],
  selectedRouteId: null,
  loading: false,
  optimizationPlans: null,
  isolatedEmployeeIds: [],
  previewing: false,
  manualRoutes: null,
  excelMetrics: null,
  absentEmployeeCodes: [],

  setManualRoutes: (routes) => set({ manualRoutes: routes }),
  setExcelMetrics: (metrics) => set({ excelMetrics: metrics }),
  setAbsentEmployeeCodes: (codes) => set({ absentEmployeeCodes: codes }),

  // Helper: build the routes URL with the given (or stored) date and optional shiftId
  fetchInitialData: async (opts?: { date?: string; shiftId?: string }) => {
    set({ loading: true });
    const state = get();
    const currentShiftId = opts?.shiftId ?? state.activeShiftId;
    const dateToFetch = opts?.date ?? state.selectedDate ?? new Date().toISOString().split("T")[0];
    storeLog("fetchInitialData", { date: dateToFetch, shiftId: currentShiftId });
    try {
      const [employees, cabs, shifts] = await Promise.all([
        fetch("/api/employees").then(r => r.json()),
        fetch("/api/cabs").then(r => r.json()),
        fetch("/api/shifts").then(r => r.json()),
      ]);

      const resolvedShiftId = currentShiftId || (Array.isArray(shifts) ? shifts[0]?.id : "") || "";
      const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
      const routesData = await resRoutes.json();
      const routes = Array.isArray(routesData) ? routesData : [];

      set({
        employees: Array.isArray(employees) ? employees : [],
        cabs: Array.isArray(cabs) ? cabs : [],
        shifts: Array.isArray(shifts) ? shifts : [],
        routes,
        activeShiftId: resolvedShiftId,
        selectedDate: dateToFetch,
        loading: false,
      });
      storeLog("fetchInitialData — OK", { employees: employees?.length, cabs: cabs?.length, routes: routes.length, shiftId: resolvedShiftId });
    } catch (e) {
      console.error("[store] ❌ fetchInitialData", e);
      set({ loading: false });
    }
  },

  setSelectedDate: (date) => {
    set({ selectedDate: date });
  },

  setActiveShiftId: (shiftId) => {
    set({ activeShiftId: shiftId });
  },

  setSelectedRouteId: (routeId) => {
    set({ selectedRouteId: routeId });
  },

  setRoutes: (routes) => set({ routes }),

  runOptimization: async (isPickup, apiKey = "", mode = "FASTEST_TRAVEL") => {
    set({ loading: true });
    storeLog("runOptimization", { isPickup, mode });
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["x-google-maps-key"] = apiKey;
      const dateToFetch = get().selectedDate;
      const absentEmployeeCodes = get().absentEmployeeCodes;
      const res = await fetch("/api/optimization", {
        method: "POST",
        headers,
        body: JSON.stringify({
          shiftId: get().activeShiftId,
          isPickup,
          date: dateToFetch,
          mode,
          absentEmployeeCodes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || `Optimization failed (HTTP ${res.status})`;
        set({ loading: false });
        console.error("[store] ❌ runOptimization", { status: res.status, error: msg });
        return { success: false, error: msg };
      }

      const dateStr = get().selectedDate;
      const resRoutes = await fetch(`/api/optimization?date=${dateStr}`);
      const routes = await resRoutes.json();
      set({ routes, loading: false });
      storeLog("runOptimization — OK", { mode, routesCount: routes.length });
      return { success: true };
    } catch (e) {
      set({ loading: false });
      console.error("[store] ❌ runOptimization — Network error", e);
      return { success: false, error: "Network error during optimization" };
    }
  },

  previewOptimization: async (isPickup) => {
    set({ previewing: true, optimizationPlans: null });
    storeLog("previewOptimization", { isPickup });
    try {
      const state = get();
      const shiftsToOptimize = state.shifts.length > 0 ? state.shifts : [];
      const previews: OptimizationPlans[] = [];
      const hardErrors: string[] = [];
      const cabSequenceCounts: Record<string, number> = {};
      const absentEmployeeCodes = state.absentEmployeeCodes;

      for (const shift of shiftsToOptimize) {
        if (shift.id === "shift-0800") {
          storeLog("previewOptimization — shift skipped (protected)", {
            shift: shift.name,
            reason: "protected",
          });
          continue;
        }

        const res = await fetch("/api/optimization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shiftId: shift.id,
            isPickup,
            date: state.selectedDate,
            mode: "ALL",
            cabSequenceCounts,
            absentEmployeeCodes,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const message = errData.error || `Preview failed for ${shift.name}`;
          
          if (res.status === 403 || message.toLowerCase().includes("protected")) {
            storeLog("previewOptimization — shift skipped (protected)", {
              shift: shift.name,
              reason: "protected",
            });
            continue;
          }

          if (!message.toLowerCase().includes("no active employees")) {
            hardErrors.push(`${shift.name}: ${message}`);
          }
          continue;
        }

        const data = await res.json();
        if (data.skipped) {
          storeLog("previewOptimization — shift skipped", {
            shift: shift.name,
            reason: data.reason,
          });
          continue;
        }

        if (data.preview) {
          const assignedCabs = new Set<string>();
          for (const key of ["MAXIMIZE_UTILIZATION", "MINIMIZE_TIME", "BALANCED"]) {
            for (const route of data.preview[key]?.routes || []) {
              assignedCabs.add(route.cabId);
            }
          }
          for (const cabId of assignedCabs) {
            cabSequenceCounts[cabId] = (cabSequenceCounts[cabId] || 0) + 1;
          }
          previews.push(
            tagPreviewRoutes(
              {
                ...data.preview,
                isolatedEmployees: data.isolatedEmployees || data.preview.isolatedEmployees,
                releasedCabs: data.releasedCabs || data.preview.releasedCabs,
                zoneSummary: data.zoneSummary || data.preview.zoneSummary,
                usingFallback: data.preview.usingFallback,
              },
              shift
            )
          );
        }
      }

      if (previews.length === 0) {
        set({ previewing: false });
        console.error("[store] ❌ previewOptimization — no previews", { hardErrors });
        return {
          success: false,
          error: hardErrors[0] || "No active employees found across the configured shifts.",
        };
      }

      const mergedPlans = mergeOptimizationPlans(previews);
      const isolatedIds = (mergedPlans.isolatedEmployees || []).map((i) => i.employeeId);
      set({ optimizationPlans: mergedPlans, isolatedEmployeeIds: isolatedIds, previewing: false });
      try { sessionStorage.setItem(STORAGE_PLANS_KEY, JSON.stringify(mergedPlans)); } catch {}
      storeLog("previewOptimization — OK", { shiftsCovered: previews.length });
      return { success: true };
    } catch (e) {
      set({ previewing: false });
      console.error("[store] ❌ previewOptimization", e);
      return { success: false, error: "Network error during preview" };
    }
  },

  applyOptimizationPlan: async (strategy, isPickup) => {
    const plans = get().optimizationPlans;
    if (!plans || !(strategy in plans) || strategy === "capacityShortfall" || strategy === "totalCabCapacity" || strategy === "totalEmployees") {
      return { success: false, error: "No preview available" };
    }
    const plan = (plans as any)[strategy] as { routes: any[] };
    set({ loading: true });
    storeLog("applyOptimizationPlan", { strategy, isPickup, routeCount: plan.routes.length });
    try {
      const previewRoutes = plan.routes.map((route) => ({
        cabId: route.cabId,
        vehicleNumber: route.vehicleNumber,
        shiftId: route.shiftId || get().activeShiftId,
        isPickup,
        totalDistance: route.totalDistance,
        totalDuration: route.totalDuration,
        optimizationScore: route.optimizationScore,
        tripSequence: route.tripSequence,
        stops: (route.stops || []).map((stop: any) => ({
          employeeId: stop.employeeId,
          stopOrder: stop.stopOrder,
          etaMinutes: stop.etaMinutes,
        })),
        violations: (route.violations || []).map((violation: any) => ({
          type: violation.type,
          severity: violation.severity,
          notes: violation.notes,
        })),
      })).filter((route) => route.shiftId && route.cabId && route.stops.length > 0);

      if (previewRoutes.length === 0) {
        set({ loading: false });
        console.error("[store] ❌ applyOptimizationPlan — no valid routes", { strategy });
        return { success: false, error: "No valid preview routes to apply" };
      }

      const res = await fetch("/api/optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: get().activeShiftId,
          isPickup,
          date: get().selectedDate,
          mode: "APPLY",
          selectedStrategy: strategy,
          previewRoutes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        set({ loading: false });
        console.error("[store] ❌ applyOptimizationPlan — API error", { status: res.status, error: errData.error });
        return { success: false, error: errData.error || "Apply failed" };
      }

      const dateStr = get().selectedDate;
      const resRoutes = await fetch(`/api/optimization?date=${dateStr}`);
      if (!resRoutes.ok) {
        set({ loading: false });
        return { success: false, error: "Plan applied, but route refresh failed. Reload the page to view it." };
      }
      const routes = await resRoutes.json();
      set({ routes, loading: false, selectedRouteId: null });
      storeLog("applyOptimizationPlan — OK", { strategy, routesApplied: routes.length });
      return { success: true };
    } catch (e) {
      set({ loading: false });
      console.error("[store] ❌ applyOptimizationPlan", e);
      return { success: false, error: "Network error applying plan" };
    }
  },

  clearOptimizationPreview: () => {
    try { sessionStorage.removeItem(STORAGE_PLANS_KEY); } catch {}
    set({ optimizationPlans: null, isolatedEmployeeIds: [] });
  },

  updateStopStatus: async (routeId, stopId, status) => {
    storeLog("updateStopStatus", { routeId, stopId, status });
    try {
      const res = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_STATUS", stopId, status }),
      });
      if (res.ok) {
        set((state) => ({
          routes: state.routes.map((r) => {
            if (r.id === routeId) {
              const updatedStops = r.stops.map((s) =>
                s.id === stopId ? { ...s, status } : s
              );
              const allDone = updatedStops.every((s) => s.status === "BOARDED" || s.status === "SKIPPED");
              const routeStatus = allDone ? "COMPLETED" : "IN_PROGRESS";
              return { ...r, stops: updatedStops, status: routeStatus };
            }
            return r;
          }),
        }));
        storeLog("updateStopStatus — OK", { routeId, stopId, status });
      }
    } catch (e) {
      console.error("[store] ❌ updateStopStatus", { routeId, stopId, status }, e);
    }
  },

  reorderRouteStops: async (routeId, stopId, direction) => {
    storeLog("reorderRouteStops", { routeId, stopId, direction });
    try {
      const res = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REORDER", stopId, direction }),
      });
      if (res.ok) {
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const updatedRoutes = await (await fetch(`/api/optimization?date=${dateToFetch}`)).json();
        set({ routes: updatedRoutes });
        storeLog("reorderRouteStops — OK", { routeId, direction });
      }
    } catch (e) {
      console.error("[store] ❌ reorderRouteStops", { routeId, stopId, direction }, e);
    }
  },

  moveStopBetweenRoutes: async (stopId, fromRouteId, toRouteId) => {
    storeLog("moveStopBetweenRoutes", { stopId, fromRouteId, toRouteId });
    try {
      const res = await fetch("/api/routes/move-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId, fromRouteId, toRouteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data.error || `Move failed (${res.status})` };
      }
      const dateToFetch = get().selectedDate;
      const updatedRoutes = await (await fetch(`/api/optimization?date=${dateToFetch}`)).json();
      set({ routes: updatedRoutes });
      return { success: true };
    } catch (e) {
      console.error("[store] ❌ moveStopBetweenRoutes", e);
      return { success: false, error: "Network error" };
    }
  },


  overrideViolation: async (violationId) => {
    storeLog("overrideViolation", { violationId });
    try {
      const res = await fetch(`/api/routes/violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ violationId }),
      });
      if (res.ok) {
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const updatedRoutes = await (await fetch(`/api/optimization?date=${dateToFetch}`)).json();
        set({ routes: updatedRoutes });
        storeLog("overrideViolation — OK", { violationId });
      }
    } catch (e) {
      console.error("[store] ❌ overrideViolation", { violationId }, e);
    }
  },

  addEmployee: async (employee) => {
    set({ loading: true });
    storeLog("addEmployee", { employeeCode: employee.employeeCode, name: employee.name });
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employee),
      });
      if (res.ok) {
        const resEmployees = await fetch("/api/employees");
        const employees = await resEmployees.json();
        set({ employees, loading: false });
        storeLog("addEmployee — OK", { employeeCode: employee.employeeCode });
        return { success: true };
      } else {
        const errData = await res.json().catch(() => ({}));
        set({ loading: false });
        console.error("[store] ❌ addEmployee", { status: res.status, error: errData.error });
        return { success: false, error: errData.error || "Failed to add employee. Employee code may already exist." };
      }
    } catch (e) {
      console.error("[store] ❌ addEmployee — Network error", e);
      set({ loading: false });
      return { success: false, error: "Network error while adding employee." };
    }
  },

  deleteEmployee: async (id) => {
    set({ loading: true });
    storeLog("deleteEmployee", { id });
    try {
      const res = await fetch(`/api/employees?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const resEmployees = await fetch("/api/employees");
        const employees = await resEmployees.json();
        set({ employees, loading: false });
        storeLog("deleteEmployee — OK", { id });
      } else {
        set({ loading: false });
        console.error("[store] ❌ deleteEmployee", { id, status: res.status });
      }
    } catch (e) {
      console.error("[store] ❌ deleteEmployee", { id }, e);
      set({ loading: false });
    }
  },

  addCab: async (cab) => {
    set({ loading: true });
    storeLog("addCab", { vehicleNumber: cab.vehicleNumber });
    try {
      const res = await fetch("/api/cabs/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cab, shiftIds: get().shifts.map(s => s.id) }),
      });
      if (res.ok) {
        const resCabs = await fetch("/api/cabs");
        const cabs = await resCabs.json();
        set({ cabs, loading: false });
        storeLog("addCab — OK", { vehicleNumber: cab.vehicleNumber });
      } else {
        set({ loading: false });
        console.error("[store] ❌ addCab", { vehicleNumber: cab.vehicleNumber, status: res.status });
      }
    } catch (e) {
      console.error("[store] ❌ addCab", { vehicleNumber: cab.vehicleNumber }, e);
      set({ loading: false });
    }
  },

  deleteCab: async (id) => {
    set({ loading: true });
    storeLog("deleteCab", { id });
    try {
      const res = await fetch(`/api/cabs/manage?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const resCabs = await fetch("/api/cabs");
        const cabs = await resCabs.json();
        set({ cabs, loading: false });
        storeLog("deleteCab — OK", { id });
      } else {
        set({ loading: false });
        console.error("[store] ❌ deleteCab", { id, status: res.status });
      }
    } catch (e) {
      console.error("[store] ❌ deleteCab", { id }, e);
      set({ loading: false });
    }
  },

  updateEmployee: async (id, employee) => {
    set({ loading: true });
    storeLog("updateEmployee", { id, changedFields: Object.keys(employee) });
    try {
      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...employee }),
      });
      if (res.ok) {
        const resEmployees = await fetch("/api/employees");
        const employees = await resEmployees.json();
        
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
        const routes = await resRoutes.json();

        set({ employees, routes, loading: false });
        storeLog("updateEmployee — OK", { id });
      } else {
        set({ loading: false });
        console.error("[store] ❌ updateEmployee — API error", { id, status: res.status });
      }
    } catch (e) {
      console.error("[store] ❌ updateEmployee", { id }, e);
      set({ loading: false });
    }
  },

  updateCab: async (id, cab) => {
    set({ loading: true });
    storeLog("updateCab", { id, changedFields: Object.keys(cab) });
    try {
      const res = await fetch("/api/cabs/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...cab, shiftIds: get().shifts.map(s => s.id) }),
      });
      if (res.ok) {
        const resCabs = await fetch("/api/cabs");
        const cabs = await resCabs.json();
        
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
        const routes = await resRoutes.json();

        set({ cabs, routes, loading: false });
        storeLog("updateCab — OK", { id });
      } else {
        set({ loading: false });
        console.error("[store] ❌ updateCab — API error", { id, status: res.status });
      }
    } catch (e) {
      console.error("[store] ❌ updateCab", { id }, e);
      set({ loading: false });
    }
  },

  applyRouteSequence: async (routeId, stopIds, distance, duration) => {
    set({ loading: true });
    storeLog("applyRouteSequence", { routeId, stopCount: stopIds.length });
    try {
      const res = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "APPLY_SEQUENCE",
          stopIds,
          distance,
          duration
        }),
      });
      if (res.ok) {
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
        const routes = await resRoutes.json();
        set({ routes, loading: false });
        storeLog("applyRouteSequence — OK", { routeId });
      } else {
        set({ loading: false });
        console.error("[store] ❌ applyRouteSequence — API error", { routeId, status: res.status });
      }
    } catch (e) {
      console.error("[store] ❌ applyRouteSequence", { routeId }, e);
      set({ loading: false });
    }
  },

  swapRouteCab: async (routeId, cabId, overrideDetourWarning = false) => {
    set({ loading: true });
    storeLog("swapRouteCab", { routeId, cabId, overrideDetourWarning });
    try {
      const res = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SWAP_CAB",
          cabId,
          overrideDetourWarning,
        }),
      });
      if (res.status === 409) {
        const warn = await res.json();
        set({ loading: false });
        if (warn.warning === "DETOUR_INCREASE") {
          const proceed = window.confirm(
            `Detour increases by ${warn.percentIncrease}% (${warn.originalKm} km → ${warn.newKm} km). Proceed anyway?`
          );
          if (proceed) {
            return get().swapRouteCab(routeId, cabId, true);
          }
          return;
        }
        throw new Error(warn.message || "Driver swap blocked");
      }
      if (res.ok) {
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
        const routes = await resRoutes.json();
        set({ routes, loading: false });
        storeLog("swapRouteCab — OK", { routeId, cabId });
      } else {
        set({ loading: false });
        let errorDetails = "Unknown error";
        try {
          const errBody = await res.json();
          errorDetails = errBody.details || errBody.error || JSON.stringify(errBody);
        } catch (e) {}
        console.error("[store] ❌ swapRouteCab — API error", { routeId, cabId, status: res.status, details: errorDetails });
        throw new Error(`Failed to swap driver: ${errorDetails}`);
      }
    } catch (e) {
      console.error("[store] ❌ swapRouteCab", { routeId, cabId }, e);
      set({ loading: false });
      throw e;
    }
  },

  assignShiftsToAllCabs: async () => {
    set({ loading: true });
    storeLog("assignShiftsToAllCabs");
    try {
      let shiftIds = get().shifts.map(s => s.id);
      if (shiftIds.length === 0) {
        const res = await fetch("/api/shifts");
        const shifts = await res.json();
        shiftIds = (Array.isArray(shifts) ? shifts : []).map(s => s.id);
      }
      if (shiftIds.length === 0) {
        console.error("[store] No shifts found in store or API");
        set({ loading: false });
        return { fixed: 0, total: 0 };
      }

      const res = await fetch("/api/cabs");
      const cabs = await res.json();
      let fixedCount = 0;

      for (const cab of cabs) {
        if (!cab.shifts || cab.shifts.length === 0) {
          const fixRes = await fetch("/api/cabs/manage", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: cab.id, shiftIds }),
          });
          if (fixRes.ok) fixedCount++;
        }
      }

      const resCabs = await fetch("/api/cabs");
      const updatedCabs = await resCabs.json();
      set({ cabs: updatedCabs, loading: false });
      storeLog("assignShiftsToAllCabs — OK", { fixed: fixedCount, total: cabs.length });
      return { fixed: fixedCount, total: cabs.length };
    } catch (e) {
      console.error("[store] ❌ assignShiftsToAllCabs", e);
      set({ loading: false });
      return { fixed: 0, total: 0 };
    }
  },
}));
