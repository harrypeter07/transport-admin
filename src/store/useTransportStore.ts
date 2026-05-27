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
  driverId: string | null;
  driver?: {
    id: string;
    name: string;
    phone: string;
  };
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
  status: "PENDING" | "PICKED_UP" | "MISSED" | "COMPLETED";
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
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  optimizationScore: number;
  stops: RouteStop[];
  violations: Violation[];
  hasEscort?: boolean; // client-side toggle representation
}


interface TransportStore {
  employees: Employee[];
  cabs: Cab[];
  shifts: Shift[];
  routes: Route[];
  activeShiftId: string;
  selectedRouteId: string | null;
  loading: boolean;
  
  // Actions
  fetchInitialData: () => Promise<void>;
  setActiveShiftId: (shiftId: string) => void;
  setSelectedRouteId: (routeId: string | null) => void;
  runOptimization: (isPickup: boolean) => Promise<void>;
  updateStopStatus: (routeId: string, stopId: string, status: "PENDING" | "PICKED_UP" | "MISSED" | "COMPLETED") => Promise<void>;
  reorderRouteStops: (routeId: string, stopId: string, direction: "up" | "down") => Promise<void>;
  overrideViolation: (violationId: string) => Promise<void>;
  addEmployee: (employee: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  addCab: (cab: any) => Promise<void>;
  deleteCab: (id: string) => Promise<void>;
}

export const useTransportStore = create<TransportStore>((set, get) => ({
  employees: [],
  cabs: [],
  shifts: [],
  routes: [],
  activeShiftId: "",
  selectedRouteId: null,
  loading: false,

  fetchInitialData: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/employees");
      const employees = await res.json();

      const resCabs = await fetch("/api/cabs");
      const cabs = await resCabs.json();

      const resShifts = await fetch("/api/shifts");
      const shifts = await resShifts.json();

      const resRoutes = await fetch("/api/optimization");
      const routes = await resRoutes.json();

      set({
        employees,
        cabs,
        shifts,
        routes,
        activeShiftId: shifts[0]?.id || "",
        loading: false,
      });
    } catch (e) {
      console.error("Error fetching data:", e);
      set({ loading: false });
    }
  },

  setActiveShiftId: (shiftId) => {
    set({ activeShiftId: shiftId });
  },

  setSelectedRouteId: (routeId) => {
    set({ selectedRouteId: routeId });
  },

  runOptimization: async (isPickup) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: get().activeShiftId,
          isPickup,
        }),
      });
      const data = await res.json();
      
      // Re-fetch all optimization routes to sync state
      const resRoutes = await fetch("/api/optimization");
      const routes = await resRoutes.json();

      set({ routes, loading: false });
    } catch (e) {
      console.error("Error optimization:", e);
      set({ loading: false });
    }
  },

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
              const allDone = updatedStops.every((s) => s.status !== "PENDING");
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
        const updatedRoutes = await (await fetch("/api/optimization")).json();
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
        const updatedRoutes = await (await fetch("/api/optimization")).json();
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
      }
    } catch (e) {
      console.error(e);
      set({ loading: false });
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
}));
