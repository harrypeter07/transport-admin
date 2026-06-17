/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
	optimizeRoutes,
	optimizeAllStrategies,
	OptimizeEmployee,
	OptimizeCab,
	OptimizedRoute,
	makeDepot,
	RouteConstraints,
} from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";

import { audit } from "@/lib/audit";
import { getExcelFilterForDate } from "@/lib/excelFilter";
import { getCachedRoutes, invalidateRoutesCache, invalidateMetricsCache } from "@/lib/cache";

function reqIp(req: NextRequest | Request): string {
	if (req instanceof NextRequest) {
		return (
			req.headers.get("x-forwarded-for") ||
			req.headers.get("x-real-ip") ||
			"unknown"
		);
	}
	return (
		(req as any).headers?.get?.("x-forwarded-for") ||
		(req as any).headers?.get?.("x-real-ip") ||
		"unknown"
	);
}

// GET all routes with details
export async function GET(req: NextRequest) {
	const ip = reqIp(req);
	try {
		const auth = await requireApiRole(["ADMIN"]);
		if (auth.response) return auth.response;

		const { searchParams } = new URL(req.url);
		const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
		const refresh = searchParams.get("refresh") === "true";

		if (refresh) {
			invalidateRoutesCache();
			invalidateMetricsCache();
		}

		const routes = await getCachedRoutes(date);

		return NextResponse.json(routes);
	} catch (e) {
		console.error("[api] ❌ GET /api/optimization", { ip }, e);
		return NextResponse.json(
			{ error: "Failed to fetch routes" },
			{ status: 500 },
		);
	}
}

// Fetch employees + cabs and calculate dynamic start locations based on previous trips
async function fetchOptimizationInputs(
	shiftId: string,
	currentDateStr: string,
	depot: { x: number; y: number },
	forceTripSequence?: number,
	cabSequenceCounts?: Record<string, number>,
	extraAbsentEmployeeIds?: string[],
	extraAbsentEmployeeCodes?: string[],
) {
	let dbEmployees = await prisma.employee.findMany({
		where: {
			status: "ACTIVE",
			...(shiftId ? { shiftId } : {}),
		},
		include: {
			pickupPoint: true,
			user: {
				include: {
					leaves: {
						where: {
							status: "APPROVED",
							startDate: { lte: currentDateStr },
							endDate: { gte: currentDateStr },
						},
					},
				},
			},
		},
	});

	// ── DISABLED: Excel filter disabled for optimization ──
	// Database is source of truth, not external Excel files
	const excelFilter = null;

	const absentIdSet = new Set(extraAbsentEmployeeIds || []);
	const absentCodeSet = new Set(
		(extraAbsentEmployeeCodes || []).map((c) => c.toLowerCase()),
	);

	const availableEmployees = dbEmployees.filter((emp) => {
		if ((emp.user?.leaves || []).length > 0) return false;
		if (absentIdSet.has(emp.id)) return false;
		if (absentCodeSet.has(emp.employeeCode.toLowerCase())) return false;
		return true;
	});

	// ── DIAGNOSTIC: Log all employees in this optimization scope ──
	console.log(`\n${'═'.repeat(70)}`);
	console.log(`[OPT-DIAG] 🚀 OPTIMIZATION STARTED`);
	console.log(`[OPT-DIAG] Date: ${currentDateStr} | ShiftId: ${shiftId || 'ALL'}`);
	console.log(`[OPT-DIAG] Total DB employees for shift: ${dbEmployees.length}`);
	console.log(`[OPT-DIAG] Available (not on leave): ${availableEmployees.length}`);
	console.log(`[OPT-DIAG] On leave/absent: ${dbEmployees.length - availableEmployees.length}`);
	console.log(`[OPT-DIAG] Employees in scope:`);
	for (const emp of availableEmployees) {
		console.log(`[OPT-DIAG]   - ${emp.name} | Code:${emp.employeeCode} | Shift:${emp.shiftId?.substring(0,8)}...`);
	}
	console.log(`${'═'.repeat(70)}\n`);

	const fallbackShiftId = shiftId || availableEmployees[0]?.shiftId || "";

	// Load all shift start times for chronological comparison
	const allShifts = await prisma.shift.findMany({
		select: { id: true, startTime: true },
	});
	const shiftStartTimes = new Map(
		allShifts.map((s) => [s.id, s.startTime || "00:00"]),
	);
	const currentShiftStartTime = shiftStartTimes.get(fallbackShiftId) || "00:00";

	const cabInclude = {
		routes: {
			where: { date: currentDateStr },
			include: {
				stops: { include: { employee: { include: { pickupPoint: true } } } },
				locations: { orderBy: { timestamp: "desc" as const }, take: 1 },
			},
		},
	};

	let dbCabs = await prisma.cab.findMany({
		where: {
			status: "AVAILABLE",
			...(fallbackShiftId ? { shifts: { some: { id: fallbackShiftId } } } : {}),
		},
		include: cabInclude,
	});

	const activeEmployeeCount = availableEmployees.length;
	const cabCapacity = dbCabs[0]?.capacity ?? 6;
	const minCabsNeeded =
		activeEmployeeCount > 0 ? Math.ceil(activeEmployeeCount / cabCapacity) : 0;

	// ── DIAGNOSTIC: Log cabs found for this shift ──
	console.log(`[OPT-DIAG] 🚗 Cabs linked to shift: ${dbCabs.length}`);
	for (const c of dbCabs) {
		console.log(`[OPT-DIAG]   - ${c.vehicleNumber} | Driver: ${c.driverName} | Capacity: ${c.capacity}`);
	}
	console.log(`[OPT-DIAG] Min cabs needed for ${activeEmployeeCount} employees (cap=${cabCapacity}): ${minCabsNeeded}`);

	// If no cabs linked to shift, or fewer than needed to cover employees → use full fleet
	if ((dbCabs.length === 0 || dbCabs.length < minCabsNeeded) && availableEmployees.length > 0) {
		console.warn(
			`[OPT-DIAG] ⚠️ Shift ${fallbackShiftId}: ${dbCabs.length} cabs linked but ${minCabsNeeded} needed for ${availableEmployees.length} employees; expanding to full available fleet`,
		);
		dbCabs = await prisma.cab.findMany({
			where: { status: "AVAILABLE" },
			include: cabInclude,
		});
		console.log(`[OPT-DIAG] Expanded fleet: ${dbCabs.length} cabs`);
	}

	// ── DISABLED: Excel cab filter ──
	// Database cabs are source of truth

	const cabTripSequenceMap: Record<string, number> = {};

	const optEmployees: OptimizeEmployee[] = availableEmployees.map((emp) => {
		const usePickup = emp.pickupPointId && emp.pickupPoint;
		return {
			id: emp.id,
			name: emp.name,
			gender: emp.gender as "MALE" | "FEMALE",
			x: usePickup ? emp.pickupPoint!.x : emp.x,
			y: usePickup ? emp.pickupPoint!.y : emp.y,
			address: usePickup
				? emp.pickupPoint!.address || emp.pickupPoint!.name
				: emp.address,
			department: emp.department,
			phone: emp.phone,
			shiftId: emp.shiftId,
			pickupPointId: emp.pickupPointId,
			pickupPoint: emp.pickupPoint
				? {
						id: emp.pickupPoint.id,
						name: emp.pickupPoint.name,
						x: emp.pickupPoint.x,
						y: emp.pickupPoint.y,
					}
				: null,
			zone: emp.zone,
			subZone: emp.subZone,
		};
	});

	const optCabs: OptimizeCab[] = dbCabs.map((cab) => {
		let startPoint = undefined;
		let tripSequence = 1;

		if (forceTripSequence !== undefined) {
			tripSequence = forceTripSequence;
		} else if (cabSequenceCounts && cabSequenceCounts[cab.id] !== undefined) {
			tripSequence = cabSequenceCounts[cab.id] + 1;
		} else {
			// Only count routes from chronologically EARLIER shifts
			const prevRoutes = cab.routes.filter((r) => {
				if (r.shiftId === fallbackShiftId) return false;
				const otherTime = shiftStartTimes.get(r.shiftId) || "";
				return otherTime < currentShiftStartTime;
			});

			if (prevRoutes.length > 0) {
				tripSequence =
					Math.max(...prevRoutes.map((r) => r.tripSequence), 0) + 1;
			}
		}

		if (tripSequence === 1) {
			if (typeof cab.driverX === "number" && typeof cab.driverY === "number") {
				startPoint = { x: cab.driverX, y: cab.driverY };
			} else {
				startPoint = depot;
			}
		} else {
			startPoint = depot;
		}

		cabTripSequenceMap[cab.id] = tripSequence;

		return {
			id: cab.id,
			vehicleNumber: cab.vehicleNumber,
			capacity: cab.capacity,
			vendor: cab.vendor,
			driverName: cab.driverName || "Unassigned",
			driverPhone: cab.driverPhone || "N/A",
			startPoint,
			tripSequence,
		};
	});

	const activeEmployeeCountFinal = optEmployees.length;
	// ── FIXED: Use ALL available cabs — do NOT slice based on min needed.
	// The old logic used cabCapacity of only the first cab to compute minCabsNeeded,
	// then sliced the cabs array to that count — dropping valid cabs and causing
	// employees to be unassigned. Now we pass ALL linked cabs to the optimizer.
	const activeCabs = optCabs.sort((a, b) => b.capacity - a.capacity);
	const totalSeatsAvailable = activeCabs.reduce((s, c) => s + c.capacity, 0);
	const minCabsNeededFinal = activeEmployeeCountFinal > 0
		? Math.ceil(activeEmployeeCountFinal / Math.max(cabCapacity, 1))
		: 0;

	// ── DIAGNOSTIC: Log fleet sizing decision ──
	console.log(`[OPT-DIAG] 📦 FLEET SIZING:`);
	console.log(`[OPT-DIAG]   Active employees: ${activeEmployeeCountFinal}`);
	console.log(`[OPT-DIAG]   Total seats across all cabs: ${totalSeatsAvailable}`);
	console.log(`[OPT-DIAG]   Cabs available for this run: ${activeCabs.length}`);
	if (totalSeatsAvailable < activeEmployeeCountFinal) {
		console.log(`[OPT-DIAG] ⚠️ FLEET CAPACITY EXCEEDED — ${activeEmployeeCountFinal - totalSeatsAvailable} employees CANNOT be seated even with all cabs!`);
		for (const c of activeCabs) {
			console.log(`[OPT-DIAG]   cab: ${c.vehicleNumber} (${c.driverName}) cap=${c.capacity}`);
		}
	} else {
		console.log(`[OPT-DIAG]   ✅ Enough seats (${totalSeatsAvailable}) for all ${activeEmployeeCountFinal} employees`);
	}
	console.log(`[OPT-DIAG] Cabs in run:`);
	for (const c of activeCabs) {
		console.log(`[OPT-DIAG]   ✓ ${c.vehicleNumber} (${c.driverName}) cap=${c.capacity} tripSeq=${c.tripSequence}`);
	}

	const shiftStartTime = shiftStartTimes.get(fallbackShiftId) || "09:00";
	const dbLeaveCount = dbEmployees.filter(
		(emp) => (emp.user?.leaves || []).length > 0,
	).length;
	const overlayAbsentCount = dbEmployees.filter(
		(emp) =>
			absentIdSet.has(emp.id) ||
			absentCodeSet.has(emp.employeeCode.toLowerCase()),
	).length;

	return {
		optEmployees,
		optCabs: activeCabs,
		fallbackShiftId,
		cabTripSequenceMap,
		shiftStartTime,
		activeEmployeeCount: activeEmployeeCountFinal,
		totalEmployeeCount: dbEmployees.length,
		dbLeaveCount,
		overlayAbsentCount,
		minCabsNeeded: minCabsNeededFinal,
		optimizedEmployeeIds: optEmployees.map((e) => e.id),
		optimizedEmployeeNames: optEmployees.map((e) => e.name),
	};
}

// Persist OptimizedRoute[] to DB
async function persistRoutes(
	optimizedRoutes: OptimizedRoute[],
	currentDateStr: string,
	fallbackShiftId: string,
	isPickup: boolean,
	strategyLabel: string,
	cabTripSequenceMap: Record<string, number>,
) {
	await prisma.$transaction(
		async (tx) => {
			const oldRoutes = await tx.route.findMany({
				where: { date: currentDateStr, shiftId: fallbackShiftId },
				select: { id: true },
			});
			const oldIds = oldRoutes.map((r) => r.id);
			if (oldIds.length > 0) {
				await tx.routeStop.deleteMany({ where: { routeId: { in: oldIds } } });
				await tx.violation.deleteMany({ where: { routeId: { in: oldIds } } });
				await tx.route.deleteMany({ where: { id: { in: oldIds } } });
			}

			const nonEmptyRoutes = optimizedRoutes.filter(
				(r) => r.cabId && Array.isArray(r.stops) && r.stops.length > 0,
			);

			for (const [index, optRoute] of nonEmptyRoutes.entries()) {
				const route = await tx.route.create({
					data: {
						cabId: optRoute.cabId,
						date: currentDateStr,
						shiftId: fallbackShiftId,
						isPickup,
						totalDistance: optRoute.totalDistance,
						totalDuration: optRoute.totalDuration,
						status: "PLANNED",
						optimizationScore: optRoute.optimizationScore,
						optimizationMode: strategyLabel,
						tripSequence: cabTripSequenceMap[optRoute.cabId] || 1,
						routeNumber: index + 1,
						zone: optRoute.zone ?? null,
						subZone: optRoute.subZone ?? null,
					},
				});

				for (const stop of optRoute.stops) {
					await tx.routeStop.create({
						data: {
							routeId: route.id,
							employeeId: stop.employeeId,
							stopOrder: stop.stopOrder,
							etaMinutes: stop.etaMinutes,
							status: "PENDING",
						},
					});
				}

				for (const viol of optRoute.violations) {
					await tx.violation.create({
						data: {
							routeId: route.id,
							type: viol.type,
							severity: viol.severity,
							resolved: false,
							notes: viol.notes,
						},
					});
				}
			}

			// Save to permanent OptimizedRouteSnapshot
			const stats = {
				routeCount: nonEmptyRoutes.length,
				totalDistance: nonEmptyRoutes.reduce(
					(s, r) => s + (r.totalDistance || 0),
					0,
				),
				source: "OPTIMIZED",
			};
			await tx.optimizedRouteSnapshot.create({
				data: {
					optimizationId: `opt_${Date.now()}`,
					date: currentDateStr,
					routeData: JSON.stringify(nonEmptyRoutes),
					statistics: JSON.stringify(stats),
				},
			});
		},
		{ timeout: 20000, maxWait: 10000 },
	);
}

async function persistPreviewRoutes(
	previewRoutes: (OptimizedRoute & {
		shiftId?: string;
		shift?: { startTime?: string };
		tripSequence?: number;
	})[],
	currentDateStr: string,
	fallbackShiftId: string,
	isPickup: boolean,
	strategyLabel: string,
) {
	const validRoutes = previewRoutes.filter((route) => {
		const shiftId = route.shiftId || fallbackShiftId;
		return (
			route.cabId &&
			shiftId &&
			Array.isArray(route.stops) &&
			route.stops.length > 0
		);
	});

	if (validRoutes.length === 0) {
		throw new Error("No valid preview routes to apply");
	}

	const affectedShiftIds = Array.from(
		new Set(
			validRoutes
				.map((route) => route.shiftId || fallbackShiftId)
				.filter(Boolean),
		),
	);

	const allShifts = await prisma.shift.findMany({
		select: { id: true, startTime: true },
	});
	const shiftStartTimeById = new Map(
		allShifts.map((shift) => [shift.id, shift.startTime || ""]),
	);

	// Earliest start time among affected shifts — routes from earlier shifts are legitimate "previous trips"
	const earliestAffectedStartTime =
		[...shiftStartTimeById.entries()]
			.filter(([id]) => affectedShiftIds.includes(id))
			.map(([, time]) => time)
			.sort()[0] || "99:99";

	const existingRoutes = await prisma.route.findMany({
		where: {
			date: currentDateStr,
			shiftId: { notIn: affectedShiftIds },
		},
		select: { cabId: true, tripSequence: true, shiftId: true },
	});

	const cabSequenceMap: Record<string, number> = {};
	for (const route of existingRoutes) {
		const otherTime = shiftStartTimeById.get(route.shiftId) || "";
		if (otherTime < earliestAffectedStartTime) {
			cabSequenceMap[route.cabId] = Math.max(
				cabSequenceMap[route.cabId] || 0,
				route.tripSequence || 1,
			);
		}
	}

	const sortedRoutes = [...validRoutes].sort((a, b) => {
		const shiftA = a.shiftId || fallbackShiftId;
		const shiftB = b.shiftId || fallbackShiftId;
		const timeA = shiftStartTimeById.get(shiftA) || a.shift?.startTime || "";
		const timeB = shiftStartTimeById.get(shiftB) || b.shift?.startTime || "";
		if (timeA !== timeB) return timeA.localeCompare(timeB);
		return a.vehicleNumber.localeCompare(b.vehicleNumber);
	});

	await prisma.$transaction(
		async (tx) => {
			const oldRoutes = await tx.route.findMany({
				where: { date: currentDateStr, shiftId: { in: affectedShiftIds } },
				select: { id: true },
			});
			const oldIds = oldRoutes.map((route) => route.id);
			if (oldIds.length > 0) {
				await tx.routeStop.deleteMany({ where: { routeId: { in: oldIds } } });
				await tx.violation.deleteMany({ where: { routeId: { in: oldIds } } });
				await tx.route.deleteMany({ where: { id: { in: oldIds } } });
			}

			const routeRows: any[] = [];
			const stopRows: any[] = [];
			const violationRows: any[] = [];

			for (const [index, optRoute] of sortedRoutes.entries()) {
				const routeId = randomUUID();
				const shiftId = optRoute.shiftId || fallbackShiftId;
				const tripSequence = (cabSequenceMap[optRoute.cabId] || 0) + 1;
				cabSequenceMap[optRoute.cabId] = Math.max(
					cabSequenceMap[optRoute.cabId] || 0,
					tripSequence,
				);

				routeRows.push({
					id: routeId,
					cabId: optRoute.cabId,
					date: currentDateStr,
					shiftId,
					isPickup,
					totalDistance: optRoute.totalDistance,
					totalDuration: optRoute.totalDuration,
					status: "PLANNED",
					optimizationScore: optRoute.optimizationScore,
					optimizationMode: strategyLabel,
					tripSequence,
					routeNumber: index + 1,
					zone: optRoute.zone ?? null,
					subZone: optRoute.subZone ?? null,
				});

				for (const stop of optRoute.stops) {
					stopRows.push({
						routeId,
						employeeId: stop.employeeId,
						stopOrder: stop.stopOrder,
						etaMinutes: stop.etaMinutes,
						status: "PENDING",
					});
				}

				for (const violation of optRoute.violations || []) {
					violationRows.push({
						routeId,
						type: violation.type,
						severity: violation.severity,
						resolved: false,
						notes: violation.notes,
					});
				}
			}

			await tx.route.createMany({ data: routeRows });
			if (stopRows.length > 0) {
				await tx.routeStop.createMany({ data: stopRows });
			}
			if (violationRows.length > 0) {
				await tx.violation.createMany({ data: violationRows });
			}

			// Save to permanent OptimizedRouteSnapshot
			const stats = {
				routeCount: routeRows.length,
				totalDistance: routeRows.reduce((s, r) => s + r.totalDistance, 0),
			};
			await tx.optimizedRouteSnapshot.create({
				data: {
					optimizationId: `opt_${Date.now()}`,
					date: currentDateStr,
					routeData: JSON.stringify(validRoutes),
					statistics: JSON.stringify(stats),
				},
			});
		},
		{ timeout: 30000, maxWait: 10000 },
	);

	return { count: validRoutes.length, shiftCount: affectedShiftIds.length };
}

// POST: Run optimization
export async function POST(req: NextRequest) {
	const ip = reqIp(req);
	try {
		const auth = await requireApiRole(["ADMIN"]);
		if (auth.response) return auth.response;

		const body = await req.json();
		const {
			shiftId,
			isPickup,
			date,
			mode = "FASTEST_TRAVEL",
			selectedStrategy,
			previewRoutes,
			tripSequence: bodyTripSequence,
			cabSequenceCounts,
			absentEmployeeIds,
			absentEmployeeCodes,
			forceOverride = false,
		} = body;
		const currentDateStr = date || new Date().toISOString().split("T")[0];

		// ── CANONICAL LOCK GUARD ─────────────────────────────────────────
		// If routes already exist from the canonical import (optimizationMode=CANONICAL),
		// refuse to overwrite them unless forceOverride=true is explicitly set.
		// This prevents the optimization engine from scrambling hand-crafted transport assignments.
		if (!forceOverride && mode === "APPLY") {
			const canonicalRoutes = await prisma.route.findMany({
				where: {
					date: currentDateStr,
					optimizationMode: "CANONICAL",
					...(shiftId ? { shiftId } : {}),
				},
				select: { id: true },
			});
			if (canonicalRoutes.length > 0) {
				console.warn(`[api] ⚠️ POST /api/optimization blocked — ${canonicalRoutes.length} CANONICAL routes exist for ${currentDateStr}. Set forceOverride=true to override.`);
				return NextResponse.json(
					{
						error: "CANONICAL_LOCK",
						message: `This date (${currentDateStr}) has ${canonicalRoutes.length} canonical route(s) imported from the official transport sheet. Dynamic optimization is disabled to protect driver-employee mappings. Use forceOverride=true only if you intend to discard canonical assignments.`,
						canonicalCount: canonicalRoutes.length,
					},
					{ status: 409 },
				);
			}
		}



		const holiday = await prisma.holiday.findUnique({
			where: { date: currentDateStr },
		});
		if (holiday) {
			return NextResponse.json(
				{
					error: `Cannot generate routes: ${currentDateStr} is a holiday (${holiday.name}).`,
				},
				{ status: 400 },
			);
		}

		const settings = await prisma.systemSettings.upsert({
			where: { id: "default" },
			update: {},
			create: { id: "default" },
		});
		const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);
		const constraints: RouteConstraints = {
			maxRouteDistanceKm: settings.maxRouteDistanceKm ?? 45,
			maxRouteDurationMin: settings.maxRouteDurationMin ?? 90,
			maxClusterRadiusKm: settings.maxClusterRadiusKm ?? 15,
			maxEmployeeDetourKm: settings.maxEmployeeDetourKm ?? 10,
		};
		const apiKeyHeader = req.headers.get("x-google-maps-key") || "";
		const apiKey = apiKeyHeader || process.env.GOOGLE_MAPS_API_KEY || "";

		if (mode === "ALL") {
			const inputs = await fetchOptimizationInputs(
				shiftId,
				currentDateStr,
				depot,
				bodyTripSequence,
				cabSequenceCounts,
				absentEmployeeIds,
				absentEmployeeCodes,
			);
			const { optEmployees, optCabs, shiftStartTime } = inputs;

			if (optEmployees.length === 0) {
				return NextResponse.json({
					skipped: true,
					reason: "no_employees",
					shiftId,
					preview: null,
					fleetSizing: { activeEmployees: 0, activeCabs: 0 },
				});
			}
			if (optCabs.length === 0) {
				return NextResponse.json({
					skipped: true,
					reason: "no_cabs",
					shiftId,
					preview: null,
					fleetSizing: {
						activeEmployees: inputs.activeEmployeeCount,
						activeCabs: 0,
						minCabsNeeded: inputs.minCabsNeeded,
					},
				});
			}

			const plans = await optimizeAllStrategies(
				optEmployees,
				optCabs,
				isPickup ?? true,
				apiKey,
				depot,
				constraints,
				shiftStartTime,
			);
			// ── Diagnostic: log per-strategy optimization result ──
			for (const strategy of [
				"MAXIMIZE_UTILIZATION",
				"MINIMIZE_TIME",
				"BALANCED",
			] as const) {
				const plan = plans[strategy];
				const coveredIds = new Set(
					plan.routes.flatMap((r) => r.stops.map((s: any) => s.employeeId)),
				);
				const unassignedNames = optEmployees
					.filter((e) => !coveredIds.has(e.id))
					.map((e) => e.name);
				console.log(
					`[DIAG] Result | shiftId=${shiftId} | strategy=${strategy} | covered=${coveredIds.size} | routes=${plan.routes.length} | unassigned=${unassignedNames.length} | unassignedNames=[${unassignedNames.join(", ")}]`,
				);
			}

			// Persist strategic plans to OptimizationRun history
			const strategies = ["MAXIMIZE_UTILIZATION", "MINIMIZE_TIME", "BALANCED"] as const;
			for (const strategy of strategies) {
				const plan = plans[strategy];
				if (plan) {
					await prisma.optimizationRun.create({
						data: {
							date: currentDateStr,
							strategy,
							employeeCount: plan.totalEmployeesCovered,
							cabCount: plan.totalCabsUsed,
							distance: plan.totalDistance,
							duration: plan.avgCommuteMins,
							metrics: {
								strategyScore: plan.strategyScore,
								totalViolations: plan.totalViolations,
								releasedCabs: plans.releasedCabs || [],
								isolatedEmployees: plans.isolatedEmployees || [],
							} as any
						}
					});
				}
			}
			invalidateMetricsCache();

			return NextResponse.json({
				preview: plans,
				constraints,
				isolatedEmployees: plans.isolatedEmployees,
				releasedCabs: plans.releasedCabs,
				zoneSummary: plans.zoneSummary,
				fleetSizing: {
					activeEmployees: inputs.activeEmployeeCount,
					totalEmployees: inputs.totalEmployeeCount,
					dbLeaveCount: inputs.dbLeaveCount,
					overlayAbsentCount: inputs.overlayAbsentCount,
					activeCabs: inputs.optCabs.length,
					minCabsNeeded: inputs.minCabsNeeded,
					optimizedEmployeeIds: optEmployees.map((e) => e.id),
				},
			});
		}

		if (mode === "APPLY" && selectedStrategy && Array.isArray(previewRoutes)) {
			if (selectedStrategy === "MANUAL_EXCEL") {
				return NextResponse.json({
					success: true,
					message: "Manual routes published as snapshot",
				});
			}
			const result = await persistPreviewRoutes(
				previewRoutes,
				currentDateStr,
				shiftId || "",
				isPickup ?? true,
				selectedStrategy,
			);
			invalidateRoutesCache();
			invalidateMetricsCache();
			return NextResponse.json({ success: true, ...result });
		}

		const inputs = await fetchOptimizationInputs(
			shiftId,
			currentDateStr,
			depot,
			bodyTripSequence,
			cabSequenceCounts,
			absentEmployeeIds,
			absentEmployeeCodes,
		);
		const { optEmployees, optCabs, fallbackShiftId, cabTripSequenceMap } =
			inputs;

		if (optEmployees.length === 0) {
			return NextResponse.json(
				{ error: "No active employees found for this shift" },
				{ status: 400 },
			);
		}
		if (optCabs.length === 0) {
			return NextResponse.json(
				{ error: "No available cabs found" },
				{ status: 400 },
			);
		}

		const result = await optimizeRoutes(
			optEmployees,
			optCabs,
			isPickup,
			apiKey,
			mode,
			depot,
			constraints,
		);
		await persistRoutes(
			result.routes,
			currentDateStr,
			fallbackShiftId,
			isPickup,
			mode,
			cabTripSequenceMap,
		);
		invalidateRoutesCache();
		invalidateMetricsCache();

		await audit({
			userId: auth.session.userId,
			role: auth.session.role,
			action: "OPTIMIZE",
			entity: "Route",
			after: {
				mode,
				count: result.routes.length,
				usingFallback: result.usingFallback,
				warnings: result.warnings,
			},
			ip,
		});
		console.info("[api] ✅ POST /api/optimization", {
			mode,
			count: result.routes.length,
			usingFallback: result.usingFallback,
			userId: auth.session.userId,
			ip,
		});

		return NextResponse.json({
			success: true,
			count: result.routes.length,
			usingFallback: result.usingFallback,
			warnings: result.warnings,
		});
	} catch (e) {
		console.error("[api] ❌ POST /api/optimization — Failed", { ip }, e);
		return NextResponse.json(
			{ error: "Optimization engine error" },
			{ status: 500 },
		);
	}
}
