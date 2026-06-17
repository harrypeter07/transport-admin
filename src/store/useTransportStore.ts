/* eslint-disable @typescript-eslint/no-explicit-any */
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
	pickupPointId?: string | null;
	pickupPoint?: any;
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
	type:
		| "FEMALE_FIRST_PICKUP"
		| "FEMALE_LAST_DROP"
		| "OVERCAPACITY"
		| "ISOLATED_FEMALE";
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
	status:
		| "PENDING"
		| "PLANNED"
		| "ASSIGNED"
		| "IN_PROGRESS"
		| "COMPLETED"
		| "CANCELLED";
	optimizationScore: number;
	stops: RouteStop[];
	violations: Violation[];
	hasEscort?: boolean; // client-side toggle representation
	tripSequence?: number;
	routeNumber?: number;
}

export interface DroppedEmployee {
	id?: string;
	name: string;
	reason: "NOT_IN_EXCEL" | "ABSENT" | "ON_LEAVE" | "SHIFT_MISMATCH";
}

export interface UnassignedEmployee {
	id: string;
	name: string;
	address?: string;
	shiftId?: string;
}

export interface StrategyPlan {
	routes: Route[]; // Properly typed routes
	totalCabsUsed: number;
	totalEmployeesCovered: number;
	totalDistance: number;
	avgCommuteMins: number;
	totalViolations: number;
	unassignedEmployees?: UnassignedEmployee[];
	droppedEmployees?: DroppedEmployee[];
}

export interface OptimizationHealth {
	dbEmployees: number;
	excelEmployees: number;
	optimizedEmployees: number;
	coveredEmployees: number;
	droppedEmployees: number;
	unassignedEmployees: number;
	capacityShortfall: number;
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
	releasedCabs?: Array<{
		cabId: string;
		vehicleNumber: string;
		reason: string;
	}>;
	droppedEmployees?: DroppedEmployee[];
	usingFallback?: boolean;
	zoneSummary?: Record<string, { employees: number; cabs: number }>;
	optimizedEmployeeIds?: string[];
	optimizationHealth?: OptimizationHealth;
}

const STORAGE_PLANS_KEY = "opencode-opt-plans";
const STRATEGY_KEYS = [
	"MAXIMIZE_UTILIZATION",
	"MINIMIZE_TIME",
	"BALANCED",
] as const;
const DEBUG_OPTIMIZATION = process.env.DEBUG_OPTIMIZATION === "true";

function mergeStrategyPlan(plans: StrategyPlan[]): StrategyPlan {
	const routes = plans.flatMap((plan) => plan.routes);
	const allDurations = routes.flatMap((route) =>
		(route.stops || [])
			.map((stop) => stop.etaMinutes)
			.filter((mins) => typeof mins === "number"),
	);
	const unassignedMap = new Map<string, UnassignedEmployee>();
	const droppedMap = new Map<string, DroppedEmployee>();

	for (const plan of plans) {
		for (const emp of plan.unassignedEmployees || []) {
			unassignedMap.set(emp.id, emp);
		}
		for (const emp of plan.droppedEmployees || []) {
			droppedMap.set(emp.name, emp);
		}
	}

	return {
		routes,
		totalCabsUsed: routes.length,
		totalEmployeesCovered: new Set(
			routes.flatMap((route) =>
				(route.stops || []).map((stop) => stop.employeeId),
			),
		).size,
		totalDistance:
			Math.round(
				routes.reduce((sum, route) => sum + (route.totalDistance || 0), 0) * 10,
			) / 10,
		avgCommuteMins: allDurations.length
			? Math.round(
					allDurations.reduce((sum, mins) => sum + mins, 0) /
						allDurations.length,
				)
			: 0,
		totalViolations: routes.reduce(
			(sum, route) =>
				sum +
				(route.violations || []).filter((violation) => !violation.resolved)
					.length,
			0,
		),
		unassignedEmployees: [...unassignedMap.values()],
		droppedEmployees: [...droppedMap.values()],
	};
}

function mergeOptimizationPlans(
	previews: OptimizationPlans[],
): OptimizationPlans {
	const isolatedMap = new Map<
		string,
		NonNullable<OptimizationPlans["isolatedEmployees"]>[number]
	>();
	const releasedMap = new Map<
		string,
		NonNullable<OptimizationPlans["releasedCabs"]>[number]
	>();
	const droppedMap = new Map<string, DroppedEmployee>();

	for (const preview of previews) {
		for (const iso of preview.isolatedEmployees || []) {
			isolatedMap.set(iso.employeeId, iso);
		}
		for (const cab of preview.releasedCabs || []) {
			releasedMap.set(cab.cabId, cab);
		}
		for (const emp of preview.droppedEmployees || []) {
			droppedMap.set(emp.name, emp);
		}
	}

	return {
		MAXIMIZE_UTILIZATION: mergeStrategyPlan(
			previews.map((preview) => preview.MAXIMIZE_UTILIZATION),
		),
		MINIMIZE_TIME: mergeStrategyPlan(
			previews.map((preview) => preview.MINIMIZE_TIME),
		),
		BALANCED: mergeStrategyPlan(previews.map((preview) => preview.BALANCED)),
		capacityShortfall: previews.reduce(
			(sum, preview) => sum + (preview.capacityShortfall || 0),
			0,
		),
		totalCabCapacity: previews.reduce(
			(sum, preview) => sum + (preview.totalCabCapacity || 0),
			0,
		),
		totalEmployees: previews.reduce(
			(sum, preview) => sum + (preview.totalEmployees || 0),
			0,
		),
		isolatedEmployees: [...isolatedMap.values()],
		releasedCabs: [...releasedMap.values()],
		droppedEmployees: [...droppedMap.values()],
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
			{} as Record<string, { employees: number; cabs: number }>,
		),
	};
}

function tagPreviewRoutes(
	preview: OptimizationPlans,
	shift: Shift,
): OptimizationPlans {
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
	fetchInitialData: (opts?: {
		date?: string;
		shiftId?: string;
	}) => Promise<void>;
	setActiveShiftId: (shiftId: string) => void;
	setSelectedDate: (date: string) => void;
	setSelectedRouteId: (routeId: string | null) => void;
	runOptimization: (
		isPickup: boolean,
		apiKey?: string,
		mode?: string,
	) => Promise<{ success: boolean; error?: string }>;
	previewOptimization: (
		isPickup: boolean,
	) => Promise<{ success: boolean; error?: string; canonical?: boolean }>;
	previewCanonicalSequencing: (
		isPickup: boolean,
	) => Promise<{ success: boolean; error?: string }>;
	applyOptimizationPlan: (
		strategy: keyof OptimizationPlans,
		isPickup: boolean,
	) => Promise<{ success: boolean; error?: string; canonical?: boolean }>;
	applyCanonicalSequence: (
		strategy: keyof OptimizationPlans,
		isPickup: boolean,
	) => Promise<{ success: boolean; error?: string }>;
	clearOptimizationPreview: () => void;
	updateStopStatus: (
		routeId: string,
		stopId: string,
		status: "PENDING" | "REACHED" | "BOARDED" | "SKIPPED",
	) => Promise<void>;
	reorderRouteStops: (
		routeId: string,
		stopId: string,
		direction: "up" | "down",
	) => Promise<void>;
	moveStopBetweenRoutes: (
		stopId: string,
		fromRouteId: string,
		toRouteId: string,
	) => Promise<{ success: boolean; error?: string }>;
	overrideViolation: (violationId: string) => Promise<void>;
	addEmployee: (employee: any) => Promise<{ success: boolean; error?: string }>;
	updateEmployee: (id: string, employee: Partial<Employee>) => Promise<void>;
	deleteEmployee: (id: string) => Promise<void>;
	addCab: (cab: any) => Promise<void>;
	updateCab: (id: string, cab: any) => Promise<void>;
	deleteCab: (id: string) => Promise<void>;
	applyRouteSequence: (
		routeId: string,
		stopIds: string[],
		distance: number,
		duration: number,
	) => Promise<void>;
	swapRouteCab: (
		routeId: string,
		cabId: string,
		overrideDetourWarning?: boolean,
	) => Promise<void>;
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
	selectedDate: "2026-06-16",
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
		const dateToFetch =
			opts?.date ??
			state.selectedDate ??
			new Date().toISOString().split("T")[0];
		storeLog("fetchInitialData", {
			date: dateToFetch,
			shiftId: currentShiftId,
		});
		try {
			const [employees, cabs, shifts] = await Promise.all([
				fetch("/api/employees").then((r) => r.json()),
				fetch("/api/cabs").then((r) => r.json()),
				fetch("/api/shifts").then((r) => r.json()),
			]);

			const resolvedShiftId =
				currentShiftId || (Array.isArray(shifts) ? shifts[0]?.id : "") || "";
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
			storeLog("fetchInitialData — OK", {
				employees: employees?.length,
				cabs: cabs?.length,
				routes: routes.length,
				shiftId: resolvedShiftId,
			});
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
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
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
				console.error("[store] ❌ runOptimization", {
					status: res.status,
					error: msg,
				});
				return { success: false, error: msg };
			}

			const dateStr = get().selectedDate;
			const resRoutes = await fetch(`/api/optimization?date=${dateStr}&refresh=true`);
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
		// Guard: prevent duplicate optimization calls
		if (get().previewing) {
			storeLog("previewOptimization — skipped (already running)");
			return { success: false, error: "Optimization already in progress" };
		}
		set({ previewing: true, optimizationPlans: null });
		storeLog("previewOptimization", { isPickup });
		try {
			const state = get();
			const absentEmployeeCodes = state.absentEmployeeCodes;
			const shiftsToOptimize = state.shifts.length > 0 ? state.shifts : [];

			console.log("\n🚀 [ETMS Optimization] Starting Route Optimization Process...");
			console.log(`📅 Date: ${state.selectedDate} | Type: ${isPickup ? "Pickup" : "Drop"}`);
			console.log("⏰ Shifts to Optimize:", shiftsToOptimize.map(s => `${s.name} (${s.startTime})`).join(", "));
			
			console.log("👥 Employees in Scope (Active & Not on Leave):");
			let totalScopeCount = 0;
			for (const shift of shiftsToOptimize) {
				const shiftEmployees = state.employees.filter(
					(emp) => emp.shiftId === shift.id && emp.status !== "INACTIVE" && !absentEmployeeCodes.includes(emp.employeeCode)
				);
				totalScopeCount += shiftEmployees.length;
				console.log(`  - Shift ${shift.name}: ${shiftEmployees.length} active employees`);
				shiftEmployees.forEach(e => {
					console.log(`    * ${e.name} (${e.employeeCode}) - Location: (${e.x?.toFixed(4)}, ${e.y?.toFixed(4)})`);
				});
			}
			console.log(`  └─ Total employees in optimization scope: ${totalScopeCount}`);

			console.log("🚗 Available Cabs:");
			state.cabs.forEach(c => {
				console.log(`  - Vehicle: ${c.vehicleNumber} | Driver: ${c.driverName || "Unassigned"} | Capacity: ${c.capacity}`);
			});

			console.log("🧠 Solver Processing...");

			const previews: OptimizationPlans[] = [];
			const hardErrors: string[] = [];
			const cabSequenceCounts: Record<string, number> = {};
			const allOptimizedEmployeeIds: string[] = [];
			let canonicalLockedCount = 0;

			for (const shift of shiftsToOptimize) {
				// Count active employees in this shift
				const shiftEmployees = state.employees.filter(
					(emp) => emp.shiftId === shift.id && emp.status !== "INACTIVE",
				);

				if (shiftEmployees.length === 0) {
					console.log("[store] previewOptimization — skipped", {
						shift: shift.name,
						reason: "no_employee",
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

					if (res.status === 409 && errData.error === "CANONICAL_LOCK") {
						canonicalLockedCount++;
						storeLog(`[store] 🔒 previewOptimization — shift ${shift.name} has CANONICAL_LOCK, skipping`);
						continue;
					}

					if (res.status === 403) {
						storeLog(`[store] previewOptimization — shift ${shift.name} forbidden, skipping`, {
							message,
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
					console.warn(`⚠️ [ETMS Optimization] Shift ${shift.name} skipped: ${data.reason}`);
					continue;
				}

				if (data.preview) {
					console.log(`✅ [ETMS Optimization] Generated preview routes for Shift: ${shift.name}`);
					for (const strategy of ["MAXIMIZE_UTILIZATION", "MINIMIZE_TIME", "BALANCED"] as const) {
						const plan = data.preview[strategy];
						if (plan) {
							console.log(`   └─ Strategy: ${strategy}`);
							console.log(`      * Cabs Used: ${plan.totalCabsUsed}`);
							console.log(`      * Employees Covered: ${plan.totalEmployeesCovered}`);
							console.log(`      * Unassigned Employees: ${plan.unassignedEmployees?.length || 0}`);
							console.log(`      * Violations: ${plan.totalViolations}`);
						}
					}
					// Collect optimized employee IDs for accurate overflow calculation
					if (data.fleetSizing?.optimizedEmployeeIds) {
						allOptimizedEmployeeIds.push(
							...data.fleetSizing.optimizedEmployeeIds,
						);
					}
					const assignedCabs = new Set<string>();
					for (const key of [
						"MAXIMIZE_UTILIZATION",
						"MINIMIZE_TIME",
						"BALANCED",
					]) {
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
								isolatedEmployees:
									data.isolatedEmployees || data.preview.isolatedEmployees,
								releasedCabs: data.releasedCabs || data.preview.releasedCabs,
								droppedEmployees:
									data.droppedEmployees || data.preview.droppedEmployees,
								zoneSummary: data.zoneSummary || data.preview.zoneSummary,
								usingFallback: data.preview.usingFallback,
							},
							shift,
						),
					);
				}
			}

			if (previews.length === 0) {
				set({ previewing: false });
				if (canonicalLockedCount > 0 && hardErrors.length === 0) {
					return { success: false, error: "CANONICAL_LOCK", canonical: true };
				}
				console.error("[store] ❌ previewOptimization — no previews", {
					hardErrors,
				});
				return {
					success: false,
					error:
						hardErrors[0] ||
						"No active employees found across the configured shifts.",
				};
			}

			const mergedPlans = mergeOptimizationPlans(previews);
			mergedPlans.optimizedEmployeeIds = allOptimizedEmployeeIds;

			// Calculate optimization health metrics
			const coveredEmployees = new Set<string>();
			const droppedCount = (mergedPlans.droppedEmployees || []).length;
			const unassignedCount = (mergedPlans.BALANCED?.unassignedEmployees || [])
				.length;

			for (const key of [
				"MAXIMIZE_UTILIZATION",
				"MINIMIZE_TIME",
				"BALANCED",
			] as const) {
				const plan = mergedPlans[key];
				for (const route of plan.routes) {
					for (const stop of route.stops || []) {
						coveredEmployees.add(stop.employeeId);
					}
				}
			}

			mergedPlans.optimizationHealth = {
				dbEmployees: state.employees.length,
				excelEmployees:
					state.excelMetrics?.totalEmployees || state.employees.length,
				optimizedEmployees: allOptimizedEmployeeIds.length,
				coveredEmployees: coveredEmployees.size,
				droppedEmployees: droppedCount,
				unassignedEmployees: unassignedCount,
				capacityShortfall: mergedPlans.capacityShortfall,
			};

			// Log generated optimization plans as structured JSON for ChatGPT verification
			console.log("=== ETMS GENERATED OPTIMIZATION PLANS JSON ===");
			console.log(
				JSON.stringify(
					{
						date: state.selectedDate,
						globalMetrics: {
							capacityShortfall: mergedPlans.capacityShortfall,
							totalCabCapacity: mergedPlans.totalCabCapacity,
							totalEmployees: mergedPlans.totalEmployees,
							isolatedEmployees: (mergedPlans.isolatedEmployees || []).map(
								(emp: any) => ({
									employeeId: emp.employeeId,
									name: emp.name,
									distanceFromCorridorKm: emp.distanceFromCorridorKm,
									nearestNeighborKm: emp.nearestNeighborKm,
									suggestedAction: emp.suggestedAction,
								}),
							),
							releasedCabs: (mergedPlans.releasedCabs || []).map((c: any) => ({
								cabId: c.cabId,
								vehicleNumber: c.vehicleNumber,
								reason: c.reason,
							})),
						},
						strategies: ["MAXIMIZE_UTILIZATION", "MINIMIZE_TIME", "BALANCED"]
							.map((strategy) => {
								const plan = (mergedPlans as any)[strategy];
								if (!plan) return null;
								return {
									strategy,
									metrics: {
										totalCabsUsed: plan.totalCabsUsed,
										totalDistanceKm: plan.totalDistance,
										totalEmployeesCovered: plan.totalEmployeesCovered,
										avgCommuteMins: plan.avgCommuteMins,
										totalViolations: plan.totalViolations,
										unassignedEmployeesCount:
											plan.unassignedEmployees?.length || 0,
									},
									unassignedEmployees: (plan.unassignedEmployees || []).map(
										(emp: any) => ({
											id: emp.id,
											name: emp.name,
											address: emp.address,
											shiftId: emp.shiftId,
										}),
									),
									routes: (plan.routes || []).map((r: any, idx: number) => ({
										routeNumber: idx + 1,
										cabId: r.cabId,
										vehicleNumber: r.vehicleNumber,
										driverName: r.driverName,
										driverPhone: r.driverPhone,
										startPoint: r.startPoint,
										paxCount: r.stops?.length || 0,
										totalDistanceKm: r.totalDistance,
										totalDurationMins: r.totalDuration,
										violations: r.violations || [],
										stops: (r.stops || []).map((s: any) => ({
											employeeName: s.employeeName,
											stopOrder: s.stopOrder,
											etaMinutes: s.etaMinutes,
											gender: s.gender,
											address: s.address,
										})),
									})),
								};
							})
							.filter(Boolean),
					},
					null,
					2,
				),
			);

			const isolatedIds = (mergedPlans.isolatedEmployees || []).map(
				(i) => i.employeeId,
			);
			set({
				optimizationPlans: mergedPlans,
				isolatedEmployeeIds: isolatedIds,
				previewing: false,
			});
			try {
				sessionStorage.setItem(STORAGE_PLANS_KEY, JSON.stringify(mergedPlans));
			} catch {
				/* ignore storage errors */
			}
			// ── DETAILED CONSOLE LOGGING FOR THE USER ──
			console.log("\n📊 [ETMS Optimization] RUN RESULTS SUMMARY:");
			for (const strategy of ["MAXIMIZE_UTILIZATION", "MINIMIZE_TIME", "BALANCED"] as const) {
				const plan = mergedPlans[strategy];
				if (plan) {
					console.log(`\n✨ Strategy: ${strategy}`);
					console.log(`   └─ Total Cabs Used: ${plan.totalCabsUsed}`);
					console.log(`   └─ Total Distance: ${plan.totalDistance.toFixed(2)} km`);
					console.log(`   └─ Average Commute: ${plan.avgCommuteMins.toFixed(1)} mins`);
					console.log(`   └─ Violations: ${plan.totalViolations}`);
					console.log(`   └─ Employees Assigned: ${plan.totalEmployeesCovered}`);
					console.log(`   └─ Employees Unassigned: ${plan.unassignedEmployees?.length || 0}`);
					if (plan.unassignedEmployees && plan.unassignedEmployees.length > 0) {
						console.log(`      ⚠️  Unassigned employees: ${plan.unassignedEmployees.map((e: any) => e.name).join(", ")}`);
					}
				}
			}

			if (mergedPlans.capacityShortfall && mergedPlans.capacityShortfall > 0) {
				console.warn("\n⚠️ [ETMS Optimization] FLEET CAPACITY EXCEEDED!");
				console.warn(`   └─ Shortfall: ${mergedPlans.capacityShortfall} seats`);
				console.warn(`   └─ Total active employees: ${mergedPlans.totalEmployees}`);
				console.warn(`   └─ Total active seats: ${mergedPlans.totalCabCapacity}`);
				console.warn(`   └─ Reason: The total capacity of all available cabs linked to the shift is less than the number of active employees.`);
				console.warn(`   └─ Active Cabs available:`);
				state.cabs.forEach(c => {
					console.warn(`      * ${c.vehicleNumber} | Driver: ${c.driverName} | Capacity: ${c.capacity}`);
				});
			} else {
				console.log("\n✅ [ETMS Optimization] Fleet capacity is sufficient. All active employees can be seated.");
			}
			console.log("\n🚀 [ETMS Optimization] Process Completed successfully.\n");

			storeLog("previewOptimization — OK", { shiftsCovered: previews.length });
			return { success: true };
		} catch (e) {
			set({ previewing: false });
			console.error("[store] ❌ previewOptimization", e);
			return { success: false, error: "Network error during preview" };
		}
	},

	previewCanonicalSequencing: async (isPickup) => {
		if (get().previewing) {
			return { success: false, error: "Optimization already in progress" };
		}
		set({ previewing: true, optimizationPlans: null });
		storeLog("previewCanonicalSequencing", { isPickup });
		try {
			const state = get();
			const res = await fetch("/api/optimization", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					date: state.selectedDate,
					isPickup,
					mode: "CANONICAL_SEQUENCE",
					absentEmployeeCodes: state.absentEmployeeCodes,
				}),
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				set({ previewing: false });
				return {
					success: false,
					error: errData.error || "Failed to sequence canonical routes",
				};
			}

			const data = await res.json();
			if (data.skipped || !data.preview) {
				set({ previewing: false });
				return {
					success: false,
					error: "No canonical routes found for this date.",
				};
			}

			const mergedPlans = {
				...data.preview,
				canonicalSequence: true,
				totalEmployees: data.preview.optimizedEmployeeIds?.length || 0,
				totalCabCapacity: data.preview.BALANCED?.totalCabsUsed || 0,
				capacityShortfall: 0,
			};

			set({
				optimizationPlans: mergedPlans,
				isolatedEmployeeIds: [],
				previewing: false,
			});

			storeLog("previewCanonicalSequencing — OK", {
				routes: mergedPlans.BALANCED?.routes?.length || 0,
			});
			return { success: true };
		} catch (e) {
			set({ previewing: false });
			console.error("[store] ❌ previewCanonicalSequencing", e);
			return { success: false, error: "Network error during canonical sequencing" };
		}
	},

	applyOptimizationPlan: async (strategy, isPickup) => {
		const plans = get().optimizationPlans;
		if (
			!plans ||
			!(strategy in plans) ||
			strategy === "capacityShortfall" ||
			strategy === "totalCabCapacity" ||
			strategy === "totalEmployees"
		) {
			return { success: false, error: "No preview available" };
		}
		const plan = (plans as any)[strategy] as { routes: any[] };
		set({ loading: true });
		storeLog("applyOptimizationPlan", {
			strategy,
			isPickup,
			routeCount: plan.routes.length,
		});
		try {
			const previewRoutes = plan.routes
				.map((route) => ({
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
				}))
				.filter(
					(route) => route.shiftId && route.cabId && route.stops.length > 0,
				);

			if (previewRoutes.length === 0) {
				set({ loading: false });
				console.error("[store] ❌ applyOptimizationPlan — no valid routes", {
					strategy,
				});
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
				// CANONICAL_LOCK: routes are protected — this is expected, not an error
				if (res.status === 409 && errData.error === "CANONICAL_LOCK") {
					console.log("[store] 🔒 applyOptimizationPlan — CANONICAL_LOCK: routes are protected, skipping auto-save.");
					return { success: false, error: "CANONICAL_LOCK", canonical: true };
				}
				console.error("[store] ❌ applyOptimizationPlan — API error", {
					status: res.status,
					error: errData.error,
				});
				return { success: false, error: errData.error || "Apply failed" };
			}

			const dateStr = get().selectedDate;
			const resRoutes = await fetch(`/api/optimization?date=${dateStr}&refresh=true`);
			if (!resRoutes.ok) {
				set({ loading: false });
				return {
					success: false,
					error:
						"Plan applied, but route refresh failed. Reload the page to view it.",
				};
			}
			const routes = await resRoutes.json();
			set({ routes, loading: false, selectedRouteId: null });
			storeLog("applyOptimizationPlan — OK", {
				strategy,
				routesApplied: routes.length,
			});
			return { success: true };
		} catch (e) {
			set({ loading: false });
			console.error("[store] ❌ applyOptimizationPlan", e);
			return { success: false, error: "Network error applying plan" };
		}
	},

	applyCanonicalSequence: async (strategy, isPickup) => {
		const plans = get().optimizationPlans;
		if (!plans || !(strategy in plans)) {
			return { success: false, error: "No preview available" };
		}
		const plan = (plans as any)[strategy] as { routes: any[] };
		set({ loading: true });
		try {
			const previewRoutes = (plan.routes || [])
				.filter((route) => route.id && route.stops?.length > 0)
				.map((route) => ({
					id: route.id,
					totalDistance: route.totalDistance,
					totalDuration: route.totalDuration,
					stops: route.stops.map((stop: any) => ({
						employeeId: stop.employeeId,
						stopOrder: stop.stopOrder,
						etaMinutes: stop.etaMinutes,
					})),
				}));

			if (previewRoutes.length === 0) {
				set({ loading: false });
				return { success: false, error: "No sequenced routes to apply" };
			}

			const res = await fetch("/api/optimization", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					date: get().selectedDate,
					isPickup,
					mode: "APPLY_SEQUENCE",
					previewRoutes,
				}),
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				set({ loading: false });
				return { success: false, error: errData.error || "Apply sequence failed" };
			}

			const dateStr = get().selectedDate;
			const resRoutes = await fetch(`/api/optimization?date=${dateStr}&refresh=true`);
			if (resRoutes.ok) {
				const routes = await resRoutes.json();
				set({ routes, loading: false, selectedRouteId: null, optimizationPlans: null });
			} else {
				set({ loading: false });
			}
			return { success: true };
		} catch (e) {
			set({ loading: false });
			console.error("[store] ❌ applyCanonicalSequence", e);
			return { success: false, error: "Network error applying sequence" };
		}
	},

	clearOptimizationPreview: () => {
		try {
			sessionStorage.removeItem(STORAGE_PLANS_KEY);
		} catch {}
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
								s.id === stopId ? { ...s, status } : s,
							);
							const allDone = updatedStops.every(
								(s) => s.status === "BOARDED" || s.status === "SKIPPED",
							);
							const routeStatus = allDone ? "COMPLETED" : "IN_PROGRESS";
							return { ...r, stops: updatedStops, status: routeStatus };
						}
						return r;
					}),
				}));
				storeLog("updateStopStatus — OK", { routeId, stopId, status });
			}
		} catch (e) {
			console.error(
				"[store] ❌ updateStopStatus",
				{ routeId, stopId, status },
				e,
			);
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
				const dateToFetch = get().selectedDate;
				const updatedRoutes = await (
					await fetch(`/api/optimization?date=${dateToFetch}&refresh=true`)
				).json();
				set({ routes: updatedRoutes });
				storeLog("reorderRouteStops — OK", { routeId, direction });
			}
		} catch (e) {
			console.error(
				"[store] ❌ reorderRouteStops",
				{ routeId, stopId, direction },
				e,
			);
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
				return {
					success: false,
					error: data.error || `Move failed (${res.status})`,
				};
			}
			const dateToFetch = get().selectedDate;
			const updatedRoutes = await (
				await fetch(`/api/optimization?date=${dateToFetch}&refresh=true`)
			).json();
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
				const dateToFetch = get().selectedDate;
				const updatedRoutes = await (
					await fetch(`/api/optimization?date=${dateToFetch}&refresh=true`)
				).json();
				set({ routes: updatedRoutes });
				storeLog("overrideViolation — OK", { violationId });
			}
		} catch (e) {
			console.error("[store] ❌ overrideViolation", { violationId }, e);
		}
	},

	addEmployee: async (employee) => {
		set({ loading: true });
		storeLog("addEmployee", {
			employeeCode: employee.employeeCode,
			name: employee.name,
		});
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
				console.error("[store] ❌ addEmployee", {
					status: res.status,
					error: errData.error,
				});
				return {
					success: false,
					error:
						errData.error ||
						"Failed to add employee. Employee code may already exist.",
				};
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
				body: JSON.stringify({
					...cab,
					shiftIds: get().shifts.map((s) => s.id),
				}),
			});
			if (res.ok) {
				const resCabs = await fetch("/api/cabs");
				const cabs = await resCabs.json();
				set({ cabs, loading: false });
				storeLog("addCab — OK", { vehicleNumber: cab.vehicleNumber });
			} else {
				set({ loading: false });
				console.error("[store] ❌ addCab", {
					vehicleNumber: cab.vehicleNumber,
					status: res.status,
				});
			}
		} catch (e) {
			console.error(
				"[store] ❌ addCab",
				{ vehicleNumber: cab.vehicleNumber },
				e,
			);
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
				set({ employees, loading: false });
				storeLog("updateEmployee — OK", { id });
			} else {
				set({ loading: false });
				console.error("[store] ❌ updateEmployee — API error", {
					id,
					status: res.status,
				});
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
				body: JSON.stringify({
					id,
					...cab,
					shiftIds: get().shifts.map((s) => s.id),
				}),
			});
			if (res.ok) {
				const resCabs = await fetch("/api/cabs");
				const cabs = await resCabs.json();
				set({ cabs, loading: false });
				storeLog("updateCab — OK", { id });
			} else {
				set({ loading: false });
				console.error("[store] ❌ updateCab — API error", {
					id,
					status: res.status,
				});
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
					duration,
				}),
			});
			if (res.ok) {
				const dateToFetch = get().selectedDate;
				const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}&refresh=true`);
				const routes = await resRoutes.json();
				set({ routes, loading: false });
				storeLog("applyRouteSequence — OK", { routeId });
			} else {
				set({ loading: false });
				console.error("[store] ❌ applyRouteSequence — API error", {
					routeId,
					status: res.status,
				});
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
						`Detour increases by ${warn.percentIncrease}% (${warn.originalKm} km → ${warn.newKm} km). Proceed anyway?`,
					);
					if (proceed) {
						return get().swapRouteCab(routeId, cabId, true);
					}
					return;
				}
				throw new Error(warn.message || "Driver swap blocked");
			}
			if (res.ok) {
				const dateToFetch = get().selectedDate;
				const resRoutes = await fetch(`/api/optimization?date=${dateToFetch}&refresh=true`);
				const routes = await resRoutes.json();
				set({ routes, loading: false });
				storeLog("swapRouteCab — OK", { routeId, cabId });
			} else {
				set({ loading: false });
				let errorDetails = "Unknown error";
				try {
					const errBody = await res.json();
					errorDetails =
						errBody.details || errBody.error || JSON.stringify(errBody);
				} catch {
					/* ignore json parse errors */
				}
				console.error("[store] ❌ swapRouteCab — API error", {
					routeId,
					cabId,
					status: res.status,
					details: errorDetails,
				});
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
			let shiftIds = get().shifts.map((s) => s.id);
			if (shiftIds.length === 0) {
				const res = await fetch("/api/shifts");
				const shifts = await res.json();
				shiftIds = (Array.isArray(shifts) ? shifts : []).map((s) => s.id);
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
			storeLog("assignShiftsToAllCabs — OK", {
				fixed: fixedCount,
				total: cabs.length,
			});
			return { fixed: fixedCount, total: cabs.length };
		} catch (e) {
			console.error("[store] ❌ assignShiftsToAllCabs", e);
			set({ loading: false });
			return { fixed: 0, total: 0 };
		}
	},
}));
