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
}

interface TransportStore {
  employees: Employee[];
  cabs: Cab[];
  shifts: Shift[];
  routes: Route[];
  importSheets: string[];
  activeShiftId: string;
  selectedDate: string; // ISO date string: YYYY-MM-DD
  selectedRouteId: string | null;
  loading: boolean;
  optimizationPlans: OptimizationPlans | null;
  previewing: boolean;
  
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
  overrideViolation: (violationId: string) => Promise<void>;
  addEmployee: (employee: any) => Promise<{ success: boolean; error?: string }>;
  updateEmployee: (id: string, employee: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  addCab: (cab: any) => Promise<void>;
  updateCab: (id: string, cab: any) => Promise<void>;
  deleteCab: (id: string) => Promise<void>;
  fetchImportSheets: () => Promise<void>;
  importSheet: (sheetName: string) => Promise<any>;
  uploadRosterFile: (file: File) => Promise<any>;
  resetDatabase: () => Promise<any>;
  applyRouteSequence: (routeId: string, stopIds: string[], distance: number, duration: number) => Promise<void>;
  swapRouteCab: (routeId: string, cabId: string) => Promise<void>;
}

export const useTransportStore = create<TransportStore>((set, get) => ({
  employees: [],
  cabs: [],
  shifts: [],
  routes: [],
  importSheets: [],
  activeShiftId: "",
  selectedDate: new Date().toISOString().split("T")[0],
  selectedRouteId: null,
  loading: false,
  optimizationPlans: null,
  previewing: false,

  // Helper: build the routes URL with the given (or stored) date and optional shiftId
  fetchInitialData: async (opts?: { date?: string; shiftId?: string }) => {
    set({ loading: true });
    const state = get();
    const currentShiftId = opts?.shiftId ?? state.activeShiftId;
    const dateToFetch = opts?.date ?? state.selectedDate ?? new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("/api/employees");
      const employees = await res.json();

      const resCabs = await fetch("/api/cabs");
      const cabs = await resCabs.json();

      const resShifts = await fetch("/api/shifts");
      const shifts = await resShifts.json();

      // Prefer caller-supplied shiftId, then stored, then first available
      const resolvedShiftId = currentShiftId || shifts[0]?.id || "";
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
    } catch (e) {
      console.error("Error fetching data:", e);
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

  runOptimization: async (isPickup, apiKey = "", mode = "FASTEST_TRAVEL") => {
    set({ loading: true });
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["x-google-maps-key"] = apiKey;
      const dateToFetch = get().selectedDate;
      const res = await fetch("/api/optimization", {
        method: "POST",
        headers,
        body: JSON.stringify({ shiftId: get().activeShiftId, isPickup, date: dateToFetch, mode }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || `Optimization failed (HTTP ${res.status})`;
        set({ loading: false });
        return { success: false, error: msg };
      }

      const dateStr = get().selectedDate;
      const resRoutes = await fetch(`/api/optimization?date=${dateStr}`);
      const routes = await resRoutes.json();
      set({ routes, loading: false });
      return { success: true };
    } catch (e) {
      set({ loading: false });
      return { success: false, error: "Network error during optimization" };
    }
  },

  previewOptimization: async (isPickup) => {
    set({ previewing: true, optimizationPlans: null });
    try {
      const res = await fetch("/api/optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: get().activeShiftId,
          isPickup,
          date: get().selectedDate,
          mode: "ALL",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        set({ previewing: false });
        return { success: false, error: errData.error || "Preview failed" };
      }

      const data = await res.json();
      set({ optimizationPlans: data.preview, previewing: false });
      return { success: true };
    } catch (e) {
      set({ previewing: false });
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
    try {
      const res = await fetch("/api/optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: get().activeShiftId,
          isPickup,
          date: get().selectedDate,
          mode: "APPLY",
          selectedStrategy: strategy,
          previewRoutes: plan.routes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        set({ loading: false });
        return { success: false, error: errData.error || "Apply failed" };
      }

      const dateStr = get().selectedDate;
      const resRoutes = await fetch(`/api/optimization?date=${dateStr}`);
      const routes = await resRoutes.json();
      set({ routes, loading: false, optimizationPlans: null });
      return { success: true };
    } catch (e) {
      set({ loading: false });
      return { success: false, error: "Network error applying plan" };
    }
  },

  clearOptimizationPreview: () => set({ optimizationPlans: null }),

  updateStopStatus: async (routeId, stopId, status) => {
    try {
      const res = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_STATUS", stopId, status }),
      });
      if (res.ok) {
        // Local state update
        set((state) => ({
          routes: state.routes.map((r) => {
            if (r.id === routeId) {
              const updatedStops = r.stops.map((s) =>
                s.id === stopId ? { ...s, status } : s
              );
              // Check if all stops are completed to update route status
              const allDone = updatedStops.every((s) => s.status === "BOARDED" || s.status === "SKIPPED");
              const routeStatus = allDone ? "COMPLETED" : "IN_PROGRESS";
              return { ...r, stops: updatedStops, status: routeStatus };
            }
            return r;
          }),
        }));
      }
    } catch (e) {
      console.error(e);
    }
  },

  reorderRouteStops: async (routeId, stopId, direction) => {
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
      }
    } catch (e) {
      console.error(e);
    }
  },



  overrideViolation: async (violationId) => {
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
      }
    } catch (e) {
      console.error(e);
    }
  },

  addEmployee: async (employee) => {
    set({ loading: true });
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
        return { success: true };
      } else {
        const errData = await res.json().catch(() => ({}));
        set({ loading: false });
        return { success: false, error: errData.error || "Failed to add employee. Employee code may already exist." };
      }
    } catch (e) {
      console.error(e);
      set({ loading: false });
      return { success: false, error: "Network error while adding employee." };
    }
  },

  deleteEmployee: async (id) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/employees?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const resEmployees = await fetch("/api/employees");
        const employees = await resEmployees.json();
        set({ employees, loading: false });
      }
    } catch (e) {
      console.error(e);
      set({ loading: false });
    }
  },

  addCab: async (cab) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/cabs/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cab),
      });
      if (res.ok) {
        const resCabs = await fetch("/api/cabs");
        const cabs = await resCabs.json();
        set({ cabs, loading: false });
      }
    } catch (e) {
      console.error(e);
      set({ loading: false });
    }
  },

  deleteCab: async (id) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/cabs/manage?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const resCabs = await fetch("/api/cabs");
        const cabs = await resCabs.json();
        set({ cabs, loading: false });
      }
    } catch (e) {
      console.error(e);
      set({ loading: false });
    }
  },

  updateEmployee: async (id, employee) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...employee }),
      });
      if (res.ok) {
        const resEmployees = await fetch("/api/employees");
        const employees = await resEmployees.json();
        
        // Refresh routes for the date
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
        const routes = await resRoutes.json();

        set({ employees, routes, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (e) {
      console.error("Error updating employee:", e);
      set({ loading: false });
    }
  },

  updateCab: async (id, cab) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/cabs/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...cab }),
      });
      if (res.ok) {
        const resCabs = await fetch("/api/cabs");
        const cabs = await resCabs.json();
        
        // Refresh routes for the date
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
        const routes = await resRoutes.json();

        set({ cabs, routes, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (e) {
      console.error("Error updating cab details:", e);
      set({ loading: false });
    }
  },

  fetchImportSheets: async () => {
    try {
      const res = await fetch(`/api/import?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        set({ importSheets: data.sheets || [] });
      }
    } catch (e) {
      console.error("Failed fetching import sheets:", e);
    }
  },

  importSheet: async (sheetName) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetName }),
      });
      const data = await res.json();
      if (res.ok) {
        // Use the date and shiftId returned by the import API
        // so we fetch routes for the correct date, not just today.
        const importedDate: string = data.date || new Date().toISOString().split("T")[0];
        const importedShiftId: string = data.shiftId || "";
        await get().fetchInitialData({ date: importedDate, shiftId: importedShiftId });
        set({ loading: false });
        return { success: true, message: data.message };
      } else {
        set({ loading: false });
        return { success: false, error: data.error };
      }
    } catch (e) {
      console.error("Excel import action failed:", e);
      set({ loading: false });
      return { success: false, error: "Network or Server error" };
    }
  },

  uploadRosterFile: async (file) => {
    set({ loading: true });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        set({ importSheets: data.sheets || [], loading: false });
        return { success: true, message: data.message };
      } else {
        set({ loading: false });
        return { success: false, error: data.error || "Upload failed" };
      }
    } catch (e) {
      console.error("Failed uploading roster file:", e);
      set({ loading: false });
      return { success: false, error: "Upload failed due to connection error" };
    }
  },

  resetDatabase: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/import", {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        await get().fetchInitialData();
        set({ loading: false });
        return { success: true, message: data.message };
      } else {
        set({ loading: false });
        return { success: false, error: data.error || "Reset failed" };
      }
    } catch (e) {
      console.error("Database reset failed:", e);
      set({ loading: false });
      return { success: false, error: "Database reset failed due to connection error" };
    }
  },

  applyRouteSequence: async (routeId, stopIds, distance, duration) => {
    set({ loading: true });
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
      } else {
        set({ loading: false });
      }
    } catch (e) {
      console.error("Failed to apply route sequence:", e);
      set({ loading: false });
    }
  },

  swapRouteCab: async (routeId, cabId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SWAP_CAB",
          cabId,
        }),
      });
      if (res.ok) {
        const shiftId = get().activeShiftId;
        const dateToFetch = get().selectedDate;
        const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}`);
        const routes = await resRoutes.json();
        set({ routes, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (e) {
      console.error("Failed to swap cab:", e);
      set({ loading: false });
    }
  },
}));
