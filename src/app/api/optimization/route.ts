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

function reqIp(req: NextRequest | Request): string {
  if (req instanceof NextRequest) {
    return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  }
  return (req as any).headers?.get?.("x-forwarded-for") || (req as any).headers?.get?.("x-real-ip") || "unknown";
}

// GET all routes with details
export async function GET(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    const whereClause: any = {
      date: date || new Date().toISOString().split("T")[0],
      cab: { status: { not: "INACTIVE" } }
    };

    const routes = await prisma.route.findMany({
      where: whereClause,
      include: {
        cab: true,
        shift: true,
        stops: {
          include: { employee: true },
          orderBy: { stopOrder: "asc" },
        },
        violations: true,
      },
      orderBy: { tripSequence: "asc" }
    });

    return NextResponse.json(routes);
  } catch (e) {
    console.error("[api] ❌ GET /api/optimization", { ip }, e);
    return NextResponse.json({ error: "Failed to fetch routes" }, { status: 500 });
  }
}

// Fetch employees + cabs and calculate dynamic start locations based on previous trips
async function fetchOptimizationInputs(shiftId: string, currentDateStr: string, depot: { x: number; y: number }, forceTripSequence?: number, cabSequenceCounts?: Record<string, number>) {
  const dbEmployees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      ...(shiftId ? { shiftId } : {}),
    },
    include: {
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

  const availableEmployees = dbEmployees.filter(emp => (emp.user?.leaves || []).length === 0);
  const fallbackShiftId = availableEmployees[0]?.shiftId || shiftId || "";

  const dbCabs = await prisma.cab.findMany({
    where: {
      status: "AVAILABLE",
      shifts: { some: { id: fallbackShiftId } }
    },
    include: {
      routes: {
        where: { date: currentDateStr },
        include: {
          stops: { include: { employee: true } },
          locations: { orderBy: { timestamp: "desc" }, take: 1 }
        }
      }
    }
  });

  const cabTripSequenceMap: Record<string, number> = {};

  const optEmployees: OptimizeEmployee[] = availableEmployees.map(emp => ({
    id: emp.id,
    name: emp.name,
    gender: emp.gender as "MALE" | "FEMALE",
    x: emp.x,
    y: emp.y,
    address: emp.address,
    department: emp.department,
    phone: emp.phone,
  }));

  const optCabs: OptimizeCab[] = dbCabs.map(cab => {
    let startPoint = undefined;
    let tripSequence = 1;

    if (forceTripSequence !== undefined) {
      tripSequence = forceTripSequence;
    } else if (cabSequenceCounts && cabSequenceCounts[cab.id] !== undefined) {
      tripSequence = cabSequenceCounts[cab.id] + 1;
    } else {
      // We look at routes on this day that are NOT for the current shift (to determine previous trips)
      const prevRoutes = cab.routes
        .filter(r => r.shiftId !== fallbackShiftId)
        .sort((a, b) => a.tripSequence - b.tripSequence);

      if (prevRoutes.length > 0) {
        tripSequence = prevRoutes.length + 1;
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
      tripSequence
    };
  });

  return { optEmployees, optCabs, fallbackShiftId, cabTripSequenceMap };
}

// Persist OptimizedRoute[] to DB
async function persistRoutes(
  optimizedRoutes: OptimizedRoute[],
  currentDateStr: string,
  fallbackShiftId: string,
  isPickup: boolean,
  strategyLabel: string,
  cabTripSequenceMap: Record<string, number>
) {
  await prisma.$transaction(async tx => {
    const oldRoutes = await tx.route.findMany({
      where: { date: currentDateStr, shiftId: fallbackShiftId },
      select: { id: true },
    });
    const oldIds = oldRoutes.map(r => r.id);
    if (oldIds.length > 0) {
      await tx.routeStop.deleteMany({ where: { routeId: { in: oldIds } } });
      await tx.violation.deleteMany({ where: { routeId: { in: oldIds } } });
      await tx.route.deleteMany({ where: { id: { in: oldIds } } });
    }

    const nonEmptyRoutes = optimizedRoutes.filter(
      r => r.cabId && Array.isArray(r.stops) && r.stops.length > 0
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
          status: "PENDING",
          optimizationScore: optRoute.optimizationScore,
          optimizationMode: strategyLabel,
          tripSequence: cabTripSequenceMap[optRoute.cabId] || 1,
          routeNumber: index + 1
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
  }, { timeout: 20000, maxWait: 10000 });
}

async function persistPreviewRoutes(
  previewRoutes: (OptimizedRoute & { shiftId?: string; shift?: { startTime?: string }; tripSequence?: number })[],
  currentDateStr: string,
  fallbackShiftId: string,
  isPickup: boolean,
  strategyLabel: string
) {
  const validRoutes = previewRoutes.filter((route) => {
    const shiftId = route.shiftId || fallbackShiftId;
    return route.cabId && shiftId && Array.isArray(route.stops) && route.stops.length > 0;
  });

  if (validRoutes.length === 0) {
    throw new Error("No valid preview routes to apply");
  }

  const affectedShiftIds = Array.from(
    new Set(validRoutes.map((route) => route.shiftId || fallbackShiftId).filter(Boolean))
  );

  const shifts = await prisma.shift.findMany({
    where: { id: { in: affectedShiftIds } },
    select: { id: true, startTime: true },
  });
  const shiftStartTimeById = new Map(shifts.map((shift) => [shift.id, shift.startTime || ""]));

  const existingRoutes = await prisma.route.findMany({
    where: {
      date: currentDateStr,
      shiftId: { notIn: affectedShiftIds },
    },
    select: { cabId: true, tripSequence: true },
  });

  const cabSequenceMap: Record<string, number> = {};
  for (const route of existingRoutes) {
    cabSequenceMap[route.cabId] = Math.max(cabSequenceMap[route.cabId] || 0, route.tripSequence || 1);
  }

  const sortedRoutes = [...validRoutes].sort((a, b) => {
    const shiftA = a.shiftId || fallbackShiftId;
    const shiftB = b.shiftId || fallbackShiftId;
    const timeA = shiftStartTimeById.get(shiftA) || a.shift?.startTime || "";
    const timeB = shiftStartTimeById.get(shiftB) || b.shift?.startTime || "";
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return a.vehicleNumber.localeCompare(b.vehicleNumber);
  });

  await prisma.$transaction(async tx => {
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
      cabSequenceMap[optRoute.cabId] = Math.max(cabSequenceMap[optRoute.cabId] || 0, tripSequence);

      routeRows.push({
        id: routeId,
        cabId: optRoute.cabId,
        date: currentDateStr,
        shiftId,
        isPickup,
        totalDistance: optRoute.totalDistance,
        totalDuration: optRoute.totalDuration,
        status: "PENDING",
        optimizationScore: optRoute.optimizationScore,
        optimizationMode: strategyLabel,
        tripSequence,
        routeNumber: index + 1,
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
  }, { timeout: 30000, maxWait: 10000 });

  return { count: validRoutes.length, shiftCount: affectedShiftIds.length };
}

// POST: Run optimization
export async function POST(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { shiftId, isPickup, date, mode = "FASTEST_TRAVEL", selectedStrategy, previewRoutes, tripSequence: bodyTripSequence, cabSequenceCounts } = body;
    const currentDateStr = date || new Date().toISOString().split("T")[0];

    const holiday = await prisma.holiday.findUnique({
      where: { date: currentDateStr }
    });
    if (holiday) {
      return NextResponse.json({ error: `Cannot generate routes: ${currentDateStr} is a holiday (${holiday.name}).` }, { status: 400 });
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
      const { optEmployees, optCabs } = await fetchOptimizationInputs(shiftId, currentDateStr, depot, bodyTripSequence, cabSequenceCounts);

      if (optEmployees.length === 0) {
        return NextResponse.json({ error: "No active employees found for this shift" }, { status: 400 });
      }
      if (optCabs.length === 0) {
        return NextResponse.json({ error: "No available cabs found" }, { status: 400 });
      }

      const plans = await optimizeAllStrategies(optEmployees, optCabs, isPickup ?? true, apiKey, depot, constraints);
      return NextResponse.json({ preview: plans, constraints });
    }

    if (mode === "APPLY" && selectedStrategy && Array.isArray(previewRoutes)) {
      const result = await persistPreviewRoutes(previewRoutes, currentDateStr, shiftId || "", isPickup ?? true, selectedStrategy);
      return NextResponse.json({ success: true, ...result });
    }

    const { optEmployees, optCabs, fallbackShiftId, cabTripSequenceMap } = await fetchOptimizationInputs(shiftId, currentDateStr, depot);

    if (optEmployees.length === 0) {
      return NextResponse.json({ error: "No active employees found for this shift" }, { status: 400 });
    }
    if (optCabs.length === 0) {
      return NextResponse.json({ error: "No available cabs found" }, { status: 400 });
    }

    const result = await optimizeRoutes(optEmployees, optCabs, isPickup, apiKey, mode, depot, constraints);
    await persistRoutes(result.routes, currentDateStr, fallbackShiftId, isPickup, mode, cabTripSequenceMap);

    await audit({ userId: auth.session.userId, role: auth.session.role, action: "OPTIMIZE", entity: "Route", after: { mode, count: result.routes.length, usingFallback: result.usingFallback, warnings: result.warnings }, ip });
    console.info("[api] ✅ POST /api/optimization", { mode, count: result.routes.length, usingFallback: result.usingFallback, userId: auth.session.userId, ip });

    return NextResponse.json({ success: true, count: result.routes.length, usingFallback: result.usingFallback, warnings: result.warnings });
  } catch (e) {
    console.error("[api] ❌ POST /api/optimization — Failed", { ip }, e);
    return NextResponse.json({ error: "Optimization engine error" }, { status: 500 });
  }
}
