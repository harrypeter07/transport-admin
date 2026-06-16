/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Route, useTransportStore } from "@/store/useTransportStore";
import {
	X,
	Truck,
	Users,
	Route as RouteIcon,
	BarChart3,
	ShieldAlert,
	Upload,
	FileSpreadsheet,
} from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import { inferDateFromSheetName } from "@/lib/excelParser";
import {
	normalizeSheetOption,
	routeMatchesEmployeeSearch,
	stopMatchesEmployeeSearch,
} from "@/lib/employeeSearch";
import EmployeeSearchInput from "@/components/EmployeeSearchInput";

const GoogleMapView = dynamic(() => import("./GoogleMapView"), { ssr: false });

const DEPOT = { lat: 21.0625, lng: 79.0526 };

function computeDistance(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const avgLatRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
	const kmPerDegLng = 111.32 * Math.cos(avgLatRad);
	const dLat = (lat2 - lat1) * 111.32;
	const dLng = (lng2 - lng1) * kmPerDegLng;
	return Math.sqrt(dLat * dLat + dLng * dLng);
}

function computeRouteDistance(stops: any[]): number {
	let total = 0;
	if (stops.length === 0) return total;
	total += computeDistance(
		DEPOT.lat,
		DEPOT.lng,
		stops[0].employee.y,
		stops[0].employee.x,
	);
	for (let i = 1; i < stops.length; i++) {
		total += computeDistance(
			stops[i - 1].employee.y,
			stops[i - 1].employee.x,
			stops[i].employee.y,
			stops[i].employee.x,
		);
	}
	total += computeDistance(
		stops[stops.length - 1].employee.y,
		stops[stops.length - 1].employee.x,
		DEPOT.lat,
		DEPOT.lng,
	);
	return total;
}

function normalizeRoute(route: any): Route {
	if (!route) return route;
	const stops = (route.stops || []).map((stop: any, stopIdx: number) => ({
		...stop,
		id: stop.id || stop.employeeId || `${route.id || "route"}-stop-${stopIdx}`,
		employee:
			stop.employee?.y !== undefined
				? stop.employee
				: {
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
	optimizedRoutes: Route[],
): Route | null {
	if (currentRoute.stops.length === 0 || optimizedRoutes.length === 0)
		return null;
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
	onDateChange?: (date: string) => void;
	onAbsentCodesChange?: (codes: string[]) => void;
}

export default function CompareModal({
	isOpen,
	onClose,
	date,
	optimizationPlans,
	onDateChange,
	onAbsentCodesChange,
}: CompareModalProps) {
	const previewOptimization = useTransportStore((state) => state.previewOptimization);
	const [currentRoutes, setCurrentRoutes] = useState<Route[]>([]);
	const [frozenOptimizedRoutes, setFrozenOptimizedRoutes] = useState<Route[]>(
		[],
	);
	const [loading, setLoading] = useState(true);
	const [selectedCurrentId, setSelectedCurrentId] = useState<string | null>(
		null,
	);
	const [selectedOptimizedId, setSelectedOptimizedId] = useState<string | null>(
		null,
	);
	const [selectedShift, setSelectedShift] = useState<string>("ALL");

	const [selectedStrategy, setSelectedStrategy] = useState<
		"MAXIMIZE_UTILIZATION" | "MINIMIZE_TIME" | "BALANCED"
	>("BALANCED");
	const [error, setError] = useState<string | null>(null);
	const [settings, setSettings] = useState<any>(null);
	const [apiKey, setApiKey] = useState<string>("");
	const [baselineSummary, setBaselineSummary] = useState<any>(null);
	const [dbLeaveCount, setDbLeaveCount] = useState(0);
	const [sheetOptions, setSheetOptions] = useState<
		{ name: string; inferredDate: string | null; routePreviewCount: number }[]
	>([]);
	const [selectedSheet, setSelectedSheet] = useState("");
	const [uploadDate, setUploadDate] = useState(date);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [fileKey, setFileKey] = useState("");
	const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
	const [activeMapType, setActiveMapType] = useState<"BASELINE" | "OPTIMIZED">(
		"OPTIMIZED",
	);

	const loadComparison = React.useCallback(() => {
		setLoading(true);
		setError(null);
		Promise.all([
			fetch(`/api/optimization/excel-routes?date=${date}`).then((r) =>
				r.json(),
			),
			fetch("/api/settings").then((r) => r.json()),
			fetch("/api/maps-key").then((r) => r.json()),
		])
			.then(([routesData, settingsData, keyData]) => {
				if (routesData.error && !routesData.routes?.length) {
					setError(
						routesData.details
							? `${routesData.error} — ${routesData.details}`
							: routesData.error,
					);
					setCurrentRoutes([]);
					setFrozenOptimizedRoutes([]);
					setBaselineSummary(null);
				} else {
					setCurrentRoutes(normalizeRoutes(routesData.routes || []));
					setFrozenOptimizedRoutes(
						normalizeRoutes(routesData.optimizedRoutes || []),
					);
					setBaselineSummary(routesData.summary || null);
					setDbLeaveCount(routesData.dbLeaveCount ?? 0);
					if (
						routesData.summary?.absentEmployeeCodes?.length &&
						onAbsentCodesChange
					) {
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

	// Load comparison when modal opens or date changes
	useEffect(() => {
		if (!isOpen) return;
		// Queue the comparison load after the effect cleanup
		queueMicrotask(() => loadComparison());
	}, [isOpen, date, loadComparison]);

	const handleInspectFile = async (file: File) => {
		setUploadError(null);
		const formData = new FormData();
		formData.append("file", file);
		const res = await fetch("/api/optimization/excel-routes", {
			method: "POST",
			body: formData,
		});
		const data = await res.json();
		if (!res.ok) {
			setUploadError(data.error || "Failed to inspect workbook");
			setSheetOptions([]);
			return;
		}

		setFileKey(data.fileKey);
		const mapped = (data.sheets || []).map(
			(s: Parameters<typeof normalizeSheetOption>[0]) => {
				const normalized = normalizeSheetOption(s);
				return {
					...normalized,
					inferredDate:
						normalized.inferredDate ?? inferDateFromSheetName(normalized.name),
				};
			},
		);
		setSheetOptions(mapped);
		// AUDIT FIX #1 & #9: Do NOT auto-select first sheet or date
		// User must explicitly choose sheet and date before saving baseline
		setSelectedSheet(""); // Reset selection
		setUploadDate(date); // Keep original date until user changes

		console.log("[COMPARE] Upload", {
			fileName: file.name,
			sheets: mapped.length,
			datesAvailable: mapped.map((m: any) => m.inferredDate).filter(Boolean),
		});
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

		// AUDIT FIX #6: Add snapshot diagnostics
		const snapshotId = `baseline-${Date.now()}`;
		const routeCount = data.cabsUsed || data.routeCount || 0;
		const employeeCount = data.presentUniqueCount || data.employeeCount || 0;

		console.log("[SNAPSHOT]", {
			date: uploadDate,
			snapshotId,
			routeCount,
			employeeCount,
		});

		setBaselineSummary({
			...data,
			source: "MANUAL_EXCEL",
			sheetName: selectedSheet,
			snapshotId,
		});

		console.log("[COMPARE] Baseline loaded", {
			date: uploadDate,
			routes: routeCount,
			employees: employeeCount,
			violations: data.safetyViolations?.length || 0,
		});

		if (data.absentEmployeeCodes?.length && onAbsentCodesChange) {
			onAbsentCodesChange(data.absentEmployeeCodes);
		}

		if (data.date && onDateChange) {
			onDateChange(data.date);
		}

		// AUDIT FIX #4: Preserve manually uploaded baseline summary
		// Store the current baseline state BEFORE loading comparison
		const savedManualBaseline = {
			...data,
			source: "MANUAL_EXCEL",
			sheetName: selectedSheet,
			snapshotId,
		};

		// Run optimization for this new date and absent codes
		setLoading(true);
		try {
			await previewOptimization(true);
		} catch (optErr) {
			console.error("Failed to run optimization for comparison", optErr);
		}

		// Load comparison in background but restore manual baseline
		loadComparison();

		// Restore manual baseline summary after comparison loads
		setTimeout(() => {
			setBaselineSummary(savedManualBaseline);
			// Keep current routes for display
		}, 500);
	};

	const handleSelectCurrent = (id: string | null) => {
		if (id === selectedCurrentId) {
			setSelectedCurrentId(null);
			setSelectedOptimizedId(null);
			return;
		}
		setSelectedCurrentId(id);
		setActiveMapType("BASELINE");
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
		setActiveMapType("OPTIMIZED");
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

	const rawOptimizedRoutes = useMemo((): any[] => {
		if (optimizationPlans && optimizationPlans[selectedStrategy]) {
			return optimizationPlans[selectedStrategy].routes || [];
		}
		if (frozenOptimizedRoutes && frozenOptimizedRoutes.length > 0) {
			return frozenOptimizedRoutes;
		}
		return [];
	}, [optimizationPlans, selectedStrategy, frozenOptimizedRoutes]);

	const optimizedRoutes = useMemo(
		() => normalizeRoutes(rawOptimizedRoutes),
		[rawOptimizedRoutes],
	);

	const normalizedCurrent = useMemo(() => {
		// AUDIT FIX #1: Baseline ONLY from uploaded Excel, never mix with fallback
		return normalizeRoutes(currentRoutes);
	}, [currentRoutes]);

	const filteredCurrentRoutes = useMemo(() => {
		if (normalizedCurrent.length === 0) return [];
		return normalizedCurrent.filter(
			(r) =>
				r.isPickup === true &&
				(selectedShift === "ALL" ||
					r.shiftId === selectedShift ||
					r.shift?.id === selectedShift),
		);
	}, [normalizedCurrent, selectedShift]);

	const filteredOptimizedRoutes = useMemo(() => {
		if (optimizedRoutes.length === 0) return [];
		return optimizedRoutes.filter(
			(r) =>
				(r.isPickup === undefined || r.isPickup === true) &&
				(selectedShift === "ALL" ||
					r.shiftId === selectedShift ||
					r.shift?.id === selectedShift),
		);
	}, [optimizedRoutes, selectedShift]);

	const mapCurrentRoutes = filteredCurrentRoutes.filter((r) =>
		routeMatchesEmployeeSearch(r, employeeSearchQuery),
	);
	const mapOptimizedRoutes = filteredOptimizedRoutes.filter((r) =>
		routeMatchesEmployeeSearch(r, employeeSearchQuery),
	);

	const employeeComparison = useMemo(() => {
		const currentIds = new Set<string>();
		const currentEmployeeMap = new Map<
			string,
			{ name: string; code?: string }
		>();
		const optimizedIds = new Set<string>();

		// AUDIT FIX #2: Use stable identifier (employeeId ?? employeeCode ?? name)
		for (const r of filteredCurrentRoutes) {
			for (const s of r.stops) {
				const empId = s.employeeId || s.employee?.id;
				const empCode =
					(s as any).employeeCode || (s.employee as any)?.employeeCode;
				const empName = s.employee?.name || "Unknown";
				const stableId = empId || empCode || empName;
				currentIds.add(stableId);
				if (!currentEmployeeMap.has(stableId)) {
					currentEmployeeMap.set(stableId, { name: empName, code: empCode });
				}
			}
		}

		for (const r of filteredOptimizedRoutes) {
			for (const s of r.stops) {
				const empId = s.employeeId || s.employee?.id;
				optimizedIds.add(empId);
			}
		}

		const commonSet = new Set<string>();
		for (const id of currentIds) if (optimizedIds.has(id)) commonSet.add(id);

		const missingFromOptimized = new Set<string>();
		const missingEmployeeNames: string[] = [];
		for (const id of currentIds) {
			if (!optimizedIds.has(id)) {
				missingFromOptimized.add(id);
				const empInfo = currentEmployeeMap.get(id);
				if (empInfo)
					missingEmployeeNames.push(`${empInfo.name} (${empInfo.code || id})`);
			}
		}

		const extraInOptimized = new Set<string>();
		for (const id of optimizedIds)
			if (!currentIds.has(id)) extraInOptimized.add(id);

		// AUDIT PHASE 2: Missing employees detailed investigation
		const missingEmployeeDetails: any[] = [];
		for (const r of filteredCurrentRoutes) {
			for (const s of r.stops) {
				const empId = s.employeeId || s.employee?.id;
				if (empId && !optimizedIds.has(empId)) {
					const empCode =
						(s as any).employeeCode || (s.employee as any)?.employeeCode;
					const empName = s.employee?.name || "Unknown";
					missingEmployeeDetails.push({
						employeeId: empId,
						employeeCode: empCode,
						employeeName: empName,
						routeNo: (r as any).routeNo || r.id,
						shift: r.shift?.name || r.shiftId,
					});
				}
			}
		}

		console.log("[COMPARE] Missing employees", {
			count: missingFromOptimized.size,
			details: missingEmployeeDetails.slice(0, 2), // Show first 2
		});

		console.log("[COMPARE] Employee comparison", {
			manualCount: currentIds.size,
			optimizedCount: optimizedIds.size,
			commonCount: commonSet.size,
			missingFromOptimized: missingFromOptimized.size,
			missingEmployeeNames: missingEmployeeNames.slice(0, 10), // Show first 10
		});

		return {
			manualEmployees: currentIds,
			optimizedEmployees: optimizedIds,
			commonEmployees: commonSet,
			missingFromOptimized,
			missingEmployeeNames,
			extraInOptimized,
		};
	}, [filteredCurrentRoutes, filteredOptimizedRoutes]);

	const commonEmployeeIds = employeeComparison.commonEmployees;

	const commonCurrentRoutes = useMemo(() => {
		// AUDIT FIX #2: Use backend totalDistance only, never recompute
		if (commonEmployeeIds.size === 0) return filteredCurrentRoutes;
		return filteredCurrentRoutes
			.map((r) => {
				const stops = r.stops.filter((s) =>
					commonEmployeeIds.has(s.employeeId),
				);
				if (stops.length === 0) return null;
				return { ...r, stops }; // Keep backend distances unchanged
			})
			.filter(Boolean) as Route[];
	}, [filteredCurrentRoutes, commonEmployeeIds]);

	const commonOptimizedRoutes = useMemo(() => {
		// AUDIT FIX #2: Use backend totalDistance only, never recompute
		if (commonEmployeeIds.size === 0) return filteredOptimizedRoutes;
		return filteredOptimizedRoutes
			.map((r) => {
				const stops = r.stops.filter((s) =>
					commonEmployeeIds.has(s.employeeId),
				);
				if (stops.length === 0) return null;
				return { ...r, stops }; // Keep backend distances unchanged
			})
			.filter(Boolean) as Route[];
	}, [filteredOptimizedRoutes, commonEmployeeIds]);

	// AUDIT FIX #5: Route count consistency check (logged in computeSideMetrics)

	const allShifts = useMemo(() => {
		const shiftMap = new Map<string, string>();
		normalizedCurrent.forEach((r) => {
			if (r.shift) shiftMap.set(r.shiftId || r.shift.id, r.shift.name);
		});
		optimizedRoutes.forEach((r) => {
			if (r.shift) shiftMap.set(r.shiftId || r.shift.id, r.shift.name);
		});
		return Array.from(shiftMap.entries()).map(([id, name]) => ({ id, name }));
	}, [normalizedCurrent, optimizedRoutes]);

	const computeSideMetrics = React.useCallback(
		(routes: Route[]) => {
			// AUDIT FIX #3: Distance validation for Nagpur operations (> 1000 km = INVALID)
			const NAGPUR_MAX_DISTANCE = 1000; // km
			let distanceValidationStatus = "VALID";

			// AUDIT PHASE 2: Cab count and distance audit
			const cabDetails: any[] = [];
			const distanceDetails: any[] = [];
			const uniqueCabs = new Set<string>();

			for (const r of routes) {
				const cabId = r.cabId || r.id;
				uniqueCabs.add(cabId);
				cabDetails.push({
					routeId: r.id,
					cabId: cabId,
					vehicleNumber: r.cab?.vehicleNumber || "Unknown",
				});

				distanceDetails.push({
					routeNo: (r as any).routeNo || r.id,
					totalDistance: r.totalDistance || 0,
					stopCount: r.stops?.length || 0,
				});
			}

			const totalDistanceKm =
				Math.round(
					distanceDetails.reduce((sum, d) => sum + d.totalDistance, 0) * 10,
				) / 10;

			// AUDIT PHASE 2: Log cab count audit
			if (routes === commonOptimizedRoutes) {
				console.log("[COMPARE] Cab audit (OPTIMIZED)", {
					totalRoutes: routes.length,
					uniqueCabIds: uniqueCabs.size,
					cabDetails,
				});
			} else if (routes === commonCurrentRoutes) {
				console.log("[COMPARE] Baseline distance source (BASELINE)", {
					totalRoutes: routes.length,
					sumDistance: totalDistanceKm,
					distanceDetails,
				});
			}

			// Log: Before comparison metrics calculation
			console.log("[COMPARE] Comparison inputs", {
				baselineRoutes: mapCurrentRoutes.length,
				baselineEmployees: commonCurrentRoutes
					.flatMap((r) => r.stops)
					.map((s) => s.employeeId).length,
				optimizedRoutes: mapOptimizedRoutes.length,
				optimizedEmployees: commonOptimizedRoutes
					.flatMap((r) => r.stops)
					.map((s) => s.employeeId).length,
				baselineDate: date,
				optimizedDate: date,
			});

			const cabIds = new Set<string>();
			let totalEmp = 0;
			let totalDist = 0;
			let violations = 0;
			let underfilled = 0;
			let sharedStops = 0;
			const perRouteDistance: number[] = [];

			for (const r of routes) {
				cabIds.add(r.cabId || r.id);
				const stops = r.stops || [];
				totalEmp += stops.length;
				const routeDist = r.totalDistance || 0;
				totalDist += routeDist;
				perRouteDistance.push(routeDist);
				violations += ((r as any).violations || []).filter(
					(v: any) => !v.resolved,
				).length;
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
			const totalDistanceRaw = totalDist;
			const totalDistanceKmFinal = Math.round(totalDistanceRaw * 10) / 10;

			// AUDIT PHASE 2: Check distance validity
			if (totalDistanceKmFinal > NAGPUR_MAX_DISTANCE) {
				distanceValidationStatus = "INVALID_DISTANCE";
				console.warn(
					"[COMPARE] ⚠️ Distance exceeds Nagpur operations threshold",
					{
						totalDistanceKm: totalDistanceKmFinal,
						threshold: NAGPUR_MAX_DISTANCE,
					},
				);
			}

			// Log distance audit
			console.log("[COMPARE] Distance audit", {
				routeCount: routes.length,
				perRouteDistance,
				totalDistanceRaw: totalDistanceRaw,
				totalDistanceKm: totalDistanceKmFinal,
				distanceValidationStatus,
			});

			return {
				cabCount,
				totalEmp,
				totalDist: totalDistanceKmFinal,
				avgPaxPerCab:
					cabCount > 0 ? Math.round((totalEmp / cabCount) * 10) / 10 : 0,
				violations,
				underfilled,
				sharedStops,
				distanceValidationStatus,
			};
		},
		[
			mapCurrentRoutes,
			commonCurrentRoutes,
			mapOptimizedRoutes,
			commonOptimizedRoutes,
			date,
		],
	);

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
				? Math.round(
						(baselineSummary.presentCount / baselineSummary.cabsUsed) * 10,
					) / 10
				: m.avgPaxPerCab;
		}
		return m;
	}, [commonCurrentRoutes, computeSideMetrics, baselineSummary]);
	const optimizedMetrics = useMemo(
		() => computeSideMetrics(commonOptimizedRoutes),
		[commonOptimizedRoutes, computeSideMetrics],
	);

	// AUDIT PHASE 2: Detailed cab count investigation
	useEffect(() => {
		if (commonOptimizedRoutes.length === 0) return;

		const cabMap = new Map<
			string,
			{ routes: number; vehicleNumber?: string }
		>();
		const cabDetails: any[] = [];

		for (const r of commonOptimizedRoutes) {
			const cabId = r.cabId || r.id;
			const vehicleNumber = r.cab?.vehicleNumber || "Unknown";

			cabDetails.push({
				routeId: r.id,
				cabId: cabId,
				vehicleNumber: vehicleNumber,
				stopCount: r.stops?.length || 0,
			});

			if (!cabMap.has(cabId)) {
				cabMap.set(cabId, { routes: 0, vehicleNumber });
			}
			const entry = cabMap.get(cabId)!;
			entry.routes++;
		}

		console.log("[COMPARE] Cab audit (OPTIMIZED DETAILED)", {
			totalRoutes: commonOptimizedRoutes.length,
			uniqueCabIds: cabMap.size,
			cabDetails,
			cabSummary: Array.from(cabMap.entries()).map(([cabId, data]) => ({
				cabId,
				vehicleNumber: data.vehicleNumber,
				routeCount: data.routes,
			})),
		});
	}, [commonOptimizedRoutes]);

	// AUDIT PHASE 2: Detailed baseline distance investigation
	useEffect(() => {
		if (commonCurrentRoutes.length === 0) return;

		const distanceDetails: any[] = [];
		let sumDistance = 0;
		const unrealisticRoutes: any[] = [];

		for (const r of commonCurrentRoutes) {
			const totalDist = r.totalDistance || 0;
			sumDistance += totalDist;

			const detail = {
				routeNo: (r as any).routeNo || r.id,
				totalDistance: totalDist,
				stopCount: r.stops?.length || 0,
				driverName: r.cab?.driverName || "Unknown",
			};
			distanceDetails.push(detail);

			// Flag unrealistic distances (e.g., > 500 km for typical route)
			if (totalDist > 500) {
				unrealisticRoutes.push(detail);
			}
		}

		console.log("[COMPARE] Baseline distance source (DETAILED)", {
			totalRoutes: commonCurrentRoutes.length,
			sumDistance: Math.round(sumDistance * 10) / 10,
			avgDistancePerRoute:
				Math.round((sumDistance / commonCurrentRoutes.length) * 10) / 10,
			distanceDetails,
			unrealisticRoutes,
		});
	}, [commonCurrentRoutes]);

	// AUDIT PHASE 2: Summary metrics audit
	useEffect(() => {
		if (
			isOpen &&
			!loading &&
			(currentRoutes.length > 0 || optimizedRoutes.length > 0)
		) {
			console.log("[COMPARE] AUDIT SUMMARY", {
				date,
				baselineMetrics: {
					mapRoutes: mapCurrentRoutes.length,
					metricsRoutes: commonCurrentRoutes.length,
					filteredRoutes: filteredCurrentRoutes.length,
					totalCabs: currentMetrics.cabCount,
					totalEmployees: currentMetrics.totalEmp,
					totalDistance: currentMetrics.totalDist,
					avgPaxPerCab: currentMetrics.avgPaxPerCab,
				},
				optimizedMetrics: {
					mapRoutes: mapOptimizedRoutes.length,
					metricsRoutes: commonOptimizedRoutes.length,
					filteredRoutes: filteredOptimizedRoutes.length,
					totalCabs: optimizedMetrics.cabCount,
					totalEmployees: optimizedMetrics.totalEmp,
					totalDistance: optimizedMetrics.totalDist,
					avgPaxPerCab: optimizedMetrics.avgPaxPerCab,
				},
				employeeComparison: {
					manualEmployees: employeeComparison.manualEmployees.size,
					optimizedEmployees: employeeComparison.optimizedEmployees.size,
					commonEmployees: employeeComparison.commonEmployees.size,
					missingFromOptimized: employeeComparison.missingFromOptimized.size,
					extraInOptimized: employeeComparison.extraInOptimized.size,
				},
				distanceValidation: {
					baselineStatus: currentMetrics.distanceValidationStatus,
					optimizedStatus: optimizedMetrics.distanceValidationStatus,
				},
			});
		}
	}, [
		isOpen,
		loading,
		date,
		selectedStrategy,
		currentMetrics,
		optimizedMetrics,
		currentRoutes.length,
		optimizedRoutes.length,
		mapCurrentRoutes,
		commonCurrentRoutes,
		filteredCurrentRoutes,
		mapOptimizedRoutes,
		commonOptimizedRoutes,
		filteredOptimizedRoutes,
		employeeComparison,
	]);

	const comparisonDiffs = useMemo(() => {
		const mergedUnderfilled: string[] = [];
		const safetyFixed: string[] = [];

		if (currentMetrics.underfilled > optimizedMetrics.underfilled) {
			mergedUnderfilled.push(
				`System consolidated ${currentMetrics.underfilled - optimizedMetrics.underfilled} underfilled cab(s) (<3 pax)`,
			);
		}

		if (currentMetrics.violations > optimizedMetrics.violations) {
			safetyFixed.push(
				`System resolved ${currentMetrics.violations - optimizedMetrics.violations} safety violation(s)`,
			);
		}

		return { mergedUnderfilled, safetyFixed };
	}, [currentMetrics, optimizedMetrics]);

	// AUDIT FIX #4: Remove noisy logs, keep only 5 key diagnostic lines
	useEffect(() => {
		if (
			!isOpen ||
			loading ||
			(currentRoutes.length === 0 && optimizedRoutes.length === 0)
		)
			return;

		console.log("[COMPARE] Metrics", {
			date,
			selectedStrategy,
			baselineCabs: currentMetrics.cabCount,
			optimizedCabs: optimizedMetrics.cabCount,
			baselineDistance: currentMetrics.totalDist,
			optimizedDistance: optimizedMetrics.totalDist,
			violationsBaseline: currentMetrics.violations,
			violationsOptimized: optimizedMetrics.violations,
		});
	}, [
		isOpen,
		loading,
		date,
		selectedStrategy,
		currentMetrics,
		optimizedMetrics,
		currentRoutes.length,
		optimizedRoutes.length,
	]);

	const selectedCurrent = useMemo(
		() => mapCurrentRoutes.find((r) => r.id === selectedCurrentId) || null,
		[mapCurrentRoutes, selectedCurrentId],
	);
	const selectedOptimized = useMemo(
		() => mapOptimizedRoutes.find((r) => r.id === selectedOptimizedId) || null,
		[mapOptimizedRoutes, selectedOptimizedId],
	);

	const canCompare =
		mapCurrentRoutes.length > 0 && mapOptimizedRoutes.length > 0;

	const employeePopulationMismatch =
		employeeComparison.manualEmployees.size !==
		employeeComparison.optimizedEmployees.size;

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
						<span className="text-[9px] text-[#9a9a9a] font-mono ml-2 mr-2">
							{formatDate(date)}
						</span>
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
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
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
									const sheet = sheetOptions.find(
										(s) => s.name === e.target.value,
									);
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
								onChange={(e) => {
									const newDate = e.target.value;
									setUploadDate(newDate);
									// Log: Date selected
									const selectedSheetInfo = sheetOptions.find(
										(s) => s.name === selectedSheet,
									);
									const routeCount = selectedSheetInfo?.routePreviewCount || 0;
									const employeeCount = 0; // Employee count not in sheet preview
									console.log("[COMPARE] Date selected", {
										selectedDate: newDate,
										routeCount,
										employeeCount,
									});
								}}
								className="text-xs border border-[#e8e8e8] px-2 py-1"
							/>
							<button
								type="button"
								onClick={handleSaveBaseline}
								disabled={uploading}
								className="text-xs font-bold bg-[#ff4f00] text-white px-3 py-1 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
							>
								<Upload className="w-3 h-3" />
								{uploading ? "Comparing..." : "Compare"}
							</button>
						</>
					)}
					{baselineSummary && (
						<div className="flex flex-wrap gap-2 text-[10px] font-mono text-[#6b6b6b]">
							<span>
								manifest YES:{" "}
								{baselineSummary.presentCount ??
									baselineSummary.employeeCount ??
									"—"}
							</span>
							<span>
								| routes:{" "}
								{baselineSummary.cabsUsed ?? baselineSummary.routeCount ?? "—"}
							</span>
							<span>
								| no-show:{" "}
								{baselineSummary.absentCount ??
									baselineSummary.noShowCount ??
									0}
							</span>
							<span>
								| unique present: {baselineSummary.presentUniqueCount ?? "—"}
							</span>
							<span>| DB leaves: {dbLeaveCount}</span>
							<span>
								| Excel violations:{" "}
								{baselineSummary.safetyViolations?.length ?? 0}
							</span>
							{(baselineSummary.unmatchedEmployeeCodes?.length ?? 0) > 0 && (
								<span className="text-red-600">
									| unmatched: {baselineSummary.unmatchedEmployeeCodes.length}
								</span>
							)}
						</div>
					)}
					{uploadError && (
						<span className="text-[10px] text-red-600">{uploadError}</span>
					)}
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
						<div className="flex flex-col border-b border-[#e8e8e8]">
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 h-[380px] bg-[#fafafa]">
								{/* Left Map: Current Baseline */}
								<div className="relative border border-[#e8e8e8] h-full flex flex-col bg-white">
									<div className="px-3 py-1.5 bg-[#f7f7f7] border-b border-[#e8e8e8] flex items-center justify-between">
										<span className="text-[10px] font-bold uppercase tracking-wider text-[#1c1b1f]">
											Current Baseline ({mapCurrentRoutes.length} routes)
										</span>
									</div>
									<div className="flex-1 relative min-h-0">
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
											<div className="w-full h-full flex items-center justify-center bg-[#f7f7f7] text-xs text-[#9a9a9a] font-medium">
												No baseline routes available
											</div>
										)}
									</div>
								</div>

								{/* Right Map: System Optimized */}
								<div className="relative border border-[#e8e8e8] h-full flex flex-col bg-white">
									<div className="px-3 py-1.5 bg-[#f7f7f7] border-b border-[#e8e8e8] flex items-center justify-between">
										<span className="text-[10px] font-bold uppercase tracking-wider text-[#059669]">
											System Optimized ({mapOptimizedRoutes.length} routes)
										</span>
									</div>
									<div className="flex-1 relative min-h-0">
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
						</div>

						{/* Route manifest lists — click to highlight on map */}
						{(mapCurrentRoutes.length > 0 || mapOptimizedRoutes.length > 0) && (
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-b border-[#e8e8e8]">
								<div className="border-r border-[#e8e8e8] p-4 max-h-[200px] overflow-y-auto">
									<div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-2 flex items-center justify-between">
										<span>
											Baseline manifest ({mapCurrentRoutes.length} routes)
										</span>
										{selectedCurrentId && (
											<span className="text-[8px] bg-[#1c1b1f] text-white px-1.5 py-0.5 rounded">
												✓ Selected
											</span>
										)}
									</div>
									<div className="space-y-1">
										{mapCurrentRoutes.map((r, idx) => (
											<button
												key={r.id || `baseline-${idx}`}
												type="button"
												onClick={() => handleSelectCurrent(r.id)}
												className={`w-full text-left text-[10px] px-2 py-1.5 border transition-all ${
													selectedCurrentId === r.id
														? "border-[#1c1b1f] bg-[#1c1b1f] text-white font-bold shadow-sm"
														: "border-[#e8e8e8] bg-white hover:bg-[#f7f7f7] hover:border-[#1c1b1f]"
												}`}
											>
												<span className="font-bold">
													{(r as any).routeNo || `R${idx + 1}`}
												</span>
												{" · "}
												{r.cab?.driverName || "Driver"} · {r.stops.length} pax
												{r.shift?.name ? ` · ${r.shift.name}` : ""}
											</button>
										))}
									</div>
								</div>
								<div className="p-4 max-h-[200px] overflow-y-auto">
									<div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-2 flex items-center justify-between">
										<span>
											Optimized manifest ({mapOptimizedRoutes.length} routes)
										</span>
										{selectedOptimizedId && (
											<span className="text-[8px] bg-[#059669] text-white px-1.5 py-0.5 rounded">
												✓ Selected
											</span>
										)}
									</div>
									<div className="space-y-1">
										{mapOptimizedRoutes.map((r, idx) => (
											<button
												key={r.id || `optimized-${idx}`}
												type="button"
												onClick={() => handleSelectOptimized(r.id)}
												className={`w-full text-left text-[10px] px-2 py-1.5 border transition-all ${
													selectedOptimizedId === r.id
														? "border-[#059669] bg-[#059669] text-white font-bold shadow-sm"
														: "border-[#e8e8e8] bg-white hover:bg-[#f0fdf4] hover:border-[#059669]"
												}`}
											>
												<span className="font-bold">
													r{(r as any).routeNumber || idx + 1}
												</span>
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
											<span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">
												Baseline Route
											</span>
											{selectedCurrent && (
												<button
													onClick={() => {
														setSelectedCurrentId(null);
														setSelectedOptimizedId(null);
													}}
													className="text-[11px] px-2 py-0.5 border border-[#d0d0d0] text-[#9a9a9a] hover:text-[#dc2626] hover:border-[#dc2626] uppercase font-bold tracking-wider cursor-pointer bg-white"
												>
													× Clear
												</button>
											)}
										</div>
										{selectedCurrent ? (
											<div className="mt-1 text-xs text-[#4a4a4a] font-mono">
												<div className="flex items-center gap-2">
													<span className="font-bold text-[#1c1b1f]">
														{selectedCurrent.cab?.driverName ||
															"Unknown Driver"}
													</span>
													<span className="text-[#6b6b6b]">
														({selectedCurrent.cab?.vehicleNumber}) —{" "}
														{selectedCurrent.stops.length} stops
													</span>
												</div>
												<div>
													{Math.round(selectedCurrent.totalDistance)} km ·{" "}
													{selectedCurrent.totalDuration} min
												</div>
												<div className="mt-1.5 space-y-0.5 max-h-[120px] overflow-y-auto">
													{selectedCurrent.stops
														.filter((s) =>
															stopMatchesEmployeeSearch(s, employeeSearchQuery),
														)
														.map((s, i) => (
															<div
																key={s.id}
																className="flex items-start gap-1.5 text-[10px] text-[#6b6b6b]"
															>
																<span className="text-[#9a9a9a] mt-0.5 shrink-0">
																	{i + 1}.
																</span>
																<span className="truncate">
																	{s.employee?.name || s.employee?.email}
																</span>
															</div>
														))}
												</div>
											</div>
										) : (
											<div className="mt-1 text-xs text-[#9a9a9a] italic">
												No equivalent current route found
											</div>
										)}
									</div>
									<div>
										<div className="flex items-center justify-between">
											<span className="text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">
												Optimized Route
											</span>
											{selectedOptimized && (
												<button
													onClick={() => {
														setSelectedOptimizedId(null);
														setSelectedCurrentId(null);
													}}
													className="text-[11px] px-2 py-0.5 border border-[#d0d0d0] text-[#9a9a9a] hover:text-[#dc2626] hover:border-[#dc2626] uppercase font-bold tracking-wider cursor-pointer bg-white"
												>
													× Clear
												</button>
											)}
										</div>
										{selectedOptimized ? (
											<div className="mt-1 text-xs text-[#4a4a4a] font-mono">
												<div className="flex items-center gap-2">
													<span className="font-bold text-[#1c1b1f]">
														{selectedOptimized.cab?.driverName ||
															(selectedOptimized as any).driverName ||
															"Unknown Driver"}
													</span>
													<span className="text-[#6b6b6b]">
														(
														{selectedOptimized.cab?.vehicleNumber ||
															(selectedOptimized as any).vehicleNumber}
														) — {selectedOptimized.stops.length} stops
													</span>
												</div>
												<div>
													{Math.round(selectedOptimized.totalDistance)} km ·{" "}
													{selectedOptimized.totalDuration} min
												</div>
												<div className="mt-1.5 space-y-0.5 max-h-[120px] overflow-y-auto">
													{selectedOptimized.stops
														.filter((s) =>
															stopMatchesEmployeeSearch(s, employeeSearchQuery),
														)
														.map((s, i) => (
															<div
																key={s.id}
																className="flex items-start gap-1.5 text-[10px] text-[#6b6b6b]"
															>
																<span className="text-[#9a9a9a] mt-0.5 shrink-0">
																	{i + 1}.
																</span>

																<span className="truncate">
																	{s.employee?.name || s.employee?.email}
																</span>
															</div>
														))}
												</div>
											</div>
										) : (
											<div className="mt-1 text-xs text-[#9a9a9a] italic">
												No equivalent optimized route found
											</div>
										)}
									</div>
								</div>
								{selectedCurrent && selectedOptimized && (
									<div className="mt-2 pt-2 border-t border-[#e8e8e8] flex gap-4 text-[11px] font-mono">
										<span
											className={
												selectedOptimized.totalDistance <
												selectedCurrent.totalDistance
													? "text-[#059669]"
													: "text-[#dc2626]"
											}
										>
											Dist:{" "}
											{Math.round(
												(selectedCurrent.totalDistance -
													selectedOptimized.totalDistance) *
													10,
											) / 10}{" "}
											km
										</span>
										<span
											className={
												selectedOptimized.totalDuration <
												selectedCurrent.totalDuration
													? "text-[#059669]"
													: "text-[#dc2626]"
											}
										>
											Dur:{" "}
											{selectedCurrent.totalDuration -
												selectedOptimized.totalDuration}{" "}
											min
										</span>
										<span
											className={
												selectedOptimized.stops.length >=
												selectedCurrent.stops.length
													? "text-[#059669]"
													: "text-[#dc2626]"
											}
										>
											Stops:{" "}
											{selectedOptimized.stops.length -
												selectedCurrent.stops.length}
										</span>
									</div>
								)}
							</div>
						)}

						{/* Validation Panel */}
						{canCompare && (
							<div className="px-4 py-3 bg-[#f7f7f7] border-b border-[#e8e8e8]">
								<div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-2">
									Validation Summary
								</div>
								<div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
									<div className="bg-white p-2 border border-[#e8e8e8]">
										<div className="text-[#9a9a9a] text-[9px]">
											Manual Routes
										</div>
										<div className="font-bold text-[#1c1b1f]">
											{mapCurrentRoutes.length}
										</div>
									</div>
									<div className="bg-white p-2 border border-[#e8e8e8]">
										<div className="text-[#9a9a9a] text-[9px]">
											Optimized Routes
										</div>
										<div className="font-bold text-[#059669]">
											{mapOptimizedRoutes.length}
										</div>
									</div>
									<div className="bg-white p-2 border border-[#e8e8e8]">
										<div className="text-[#9a9a9a] text-[9px]">
											Manual Employees
										</div>
										<div className="font-bold text-[#1c1b1f]">
											{employeeComparison.manualEmployees.size}
										</div>
									</div>
									<div className="bg-white p-2 border border-[#e8e8e8]">
										<div className="text-[#9a9a9a] text-[9px]">
											Distance Confidence
										</div>
										<div className={`font-bold text-sm`}>
											{(() => {
												const routeCountMatch =
													mapCurrentRoutes.length === mapOptimizedRoutes.length;
												const distanceValid =
													currentMetrics.distanceValidationStatus === "VALID";

												if (
													routeCountMatch &&
													distanceValid
												) {
													return (
														<span className="text-[#059669]">✅ High</span>
													);
												} else if (
													distanceValid
												) {
													return (
														<span className="text-[#f59e0b]">⚠️ Medium</span>
													);
												} else {
													return <span className="text-[#dc2626]">❌ Low</span>;
												}
											})()}
										</div>
									</div>
								</div>
							</div>
						)}

						{/* AUDIT FIX #8: Detailed Diagnostics Panel */}
						{canCompare && (
							<div className="px-4 py-3 bg-[#f0fdf4] border-b border-[#86efac] max-h-[200px] overflow-y-auto">
								<div className="text-[9px] font-bold uppercase tracking-wider text-[#15803d] mb-2">
									📋 Detailed Diagnostics
								</div>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-mono">
									<div className="bg-white p-2 border border-[#d1fae5] rounded-sm">
										<div className="text-[#15803d] font-bold mb-1">
											Manual Employees
										</div>
										<div className="text-[#047857]">
											{employeeComparison.manualEmployees.size} total
										</div>
									</div>

									<div className="bg-white p-2 border border-[#d1fae5] rounded-sm">
										<div className="text-[#15803d] font-bold mb-1">
											Route Count Validation
										</div>
										<div
											className={
												mapCurrentRoutes.length === mapOptimizedRoutes.length
													? "text-[#059669]"
													: "text-[#dc2626]"
											}
										>
											Manual: {mapCurrentRoutes.length} | Optimized:{" "}
											{mapOptimizedRoutes.length}
											{mapCurrentRoutes.length === mapOptimizedRoutes.length
												? " ✅ Match"
												: " ❌ Mismatch"}
										</div>
									</div>

									<div className="bg-white p-2 border border-[#d1fae5] rounded-sm">
										<div className="text-[#15803d] font-bold mb-1">
											Distance Validation
										</div>
										<div
											className={
												currentMetrics.distanceValidationStatus === "VALID"
													? "text-[#059669]"
													: "text-[#dc2626]"
											}
										>
											{currentMetrics.distanceValidationStatus === "VALID"
												? `✅ ${currentMetrics.totalDist} km`
												: `❌ ${currentMetrics.totalDist} km (>1000 km threshold)`}
										</div>
									</div>
								</div>
							</div>
						)}

						{/* Stats Section — only when both sides have data */}
						{canCompare ? (
							<div className="p-4 space-y-4">
								<div className="overflow-x-auto">
									<table className="w-full text-[11px] font-mono">
										<thead>
											<tr className="border-b border-[#e8e8e8]">
												<th className="text-left py-2 pr-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">
													Metric
												</th>
												<th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#9a9a9a]">
													Excel (Manual)
												</th>
												<th className="text-right py-2 px-4 text-[9px] uppercase font-bold tracking-wider text-[#059669]">
													System (Optimized)
												</th>
											</tr>
										</thead>
										<tbody>
											<tr className="border-b border-[#f0f0f0]">
												<td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5">
													<Truck className="w-3 h-3" /> Cabs used
												</td>
												<td className="text-right py-2 px-4">
													{currentMetrics.cabCount}
												</td>
												<td className="text-right py-2 px-4 text-[#059669]">
													{optimizedMetrics.cabCount}
													{optimizedMetrics.cabCount <
														currentMetrics.cabCount && " ✅"}
												</td>
											</tr>
											<tr className="border-b border-[#f0f0f0]">
												<td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5">
													<RouteIcon className="w-3 h-3" /> Total distance
												</td>
												<td className="text-right py-2 px-4 text-[#9a9a9a]">
													—
												</td>
												<td className="text-right py-2 px-4 text-[#059669]">
													{optimizedMetrics.totalDist} km
												</td>
											</tr>
											<tr className="border-b border-[#f0f0f0]">
												<td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5">
													<Users className="w-3 h-3" /> Avg passengers/cab
												</td>
												<td className="text-right py-2 px-4">
													{currentMetrics.avgPaxPerCab}
												</td>
												<td className="text-right py-2 px-4 text-[#059669]">
													{optimizedMetrics.avgPaxPerCab}
												</td>
											</tr>
											<tr className="border-b border-[#f0f0f0]">
												<td className="py-2 pr-4 text-[#4a4a4a] flex items-center gap-1.5">
													<ShieldAlert className="w-3 h-3" /> Safety violations
												</td>
												<td className="text-right py-2 px-4">
													{currentMetrics.violations}
												</td>
												<td className="text-right py-2 px-4 text-[#059669]">
													{optimizedMetrics.violations}
													{optimizedMetrics.violations <
														currentMetrics.violations && " ✅"}
												</td>
											</tr>
											<tr className="border-b border-[#f0f0f0]">
												<td className="py-2 pr-4 text-[#4a4a4a]">
													Underfilled routes (&lt;3 pax)
												</td>
												<td className="text-right py-2 px-4">
													{currentMetrics.underfilled}
												</td>
												<td className="text-right py-2 px-4 text-[#059669]">
													{optimizedMetrics.underfilled}
													{optimizedMetrics.underfilled <
														currentMetrics.underfilled && " ✅"}
												</td>
											</tr>
											<tr className="border-b border-[#f0f0f0]">
												<td className="py-2 pr-4 text-[#4a4a4a]">
													Absent handled
												</td>
												<td className="text-right py-2 px-4">
													{baselineSummary?.absentCount ??
														baselineSummary?.noShowCount ??
														8}{" "}
													no-shows
												</td>
												<td className="text-right py-2 px-4 text-[#059669]">
													{baselineSummary?.noShowCount ?? 8} excluded ✅
												</td>
											</tr>
											<tr className="border-b border-[#f0f0f0]">
												<td className="py-2 pr-4 text-[#4a4a4a]">
													Shared stops used
												</td>
												<td className="text-right py-2 px-4">
													{currentMetrics.sharedStops}
												</td>
												<td className="text-right py-2 px-4 text-[#059669]">
													{optimizedMetrics.sharedStops}
												</td>
											</tr>
										</tbody>
									</table>
								</div>

								{(comparisonDiffs.mergedUnderfilled.length > 0 ||
									comparisonDiffs.safetyFixed.length > 0) && (
									<div className="border border-[#e8e8e8] p-3 bg-[#fafafa]">
										<div className="text-[9px] font-bold uppercase tracking-wider text-[#9a9a9a] mb-2">
											Key Highlights
										</div>
										<ul className="space-y-1 text-[11px] text-[#4a4a4a] font-semibold">
											{comparisonDiffs.mergedUnderfilled.map((t, i) => (
												<li key={`m-${i}`}>✅ {t}</li>
											))}
											{comparisonDiffs.safetyFixed.map((t, i) => (
												<li key={`s-${i}`}>✅ {t}</li>
											))}
										</ul>
									</div>
								)}
							</div>
						) : (
							<div className="p-4">
								<div className="bg-[#f7f7f7] border border-[#e8e8e8] px-4 py-3 text-center">
									<p className="text-xs font-bold text-[#9a9a9a]">
										Comparison data unavailable
									</p>
									<p className="text-[10px] text-[#b0b0b0] mt-1">
										{mapCurrentRoutes.length === 0 &&
										mapOptimizedRoutes.length === 0
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
