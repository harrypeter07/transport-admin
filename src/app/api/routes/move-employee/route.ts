export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  checkSafetyViolations,
  enforceSafetyRules,
  getOptimalPermutation,
  getDistance,
  DEPOT,
  type OptimizeEmployee,
} from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";
import { audit } from "@/lib/audit";

function toOptimizeEmployee(stop: any): OptimizeEmployee {
  const emp = stop.employee;
  const usePickup = emp.pickupPointId && emp.pickupPoint;
  return {
    id: emp.id,
    name: emp.name,
    gender: emp.gender as "MALE" | "FEMALE",
    x: usePickup ? emp.pickupPoint.x : emp.x,
    y: usePickup ? emp.pickupPoint.y : emp.y,
    address: usePickup ? (emp.pickupPoint.address || emp.pickupPoint.name) : emp.address,
    department: emp.department || "",
    phone: emp.phone || "",
  };
}

function computeRouteMetrics(stops: OptimizeEmployee[], isPickup: boolean): { totalDistance: number; totalDuration: number; etas: number[] } {
  if (stops.length === 0) return { totalDistance: 0, totalDuration: 0, etas: [] };

  let totalDistance = 0;
  let cumulative = 0;
  const etas: number[] = [];

  if (isPickup) {
    totalDistance += getDistance(DEPOT, stops[0]);
    cumulative += totalDistance * 2.4;
    etas.push(Math.round(cumulative));
    for (let i = 1; i < stops.length; i++) {
      const leg = getDistance(stops[i - 1], stops[i]);
      totalDistance += leg;
      cumulative += leg * 2.4;
      etas.push(Math.round(cumulative));
    }
    totalDistance += getDistance(stops[stops.length - 1], DEPOT);
  } else {
    totalDistance += getDistance(DEPOT, stops[0]);
    cumulative += totalDistance * 2.4;
    etas.push(Math.round(cumulative));
    for (let i = 1; i < stops.length; i++) {
      const leg = getDistance(stops[i - 1], stops[i]);
      totalDistance += leg;
      cumulative += leg * 2.4;
      etas.push(Math.round(cumulative));
    }
  }

  return {
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalDuration: Math.round(totalDistance * 2.4),
    etas,
  };
}

async function resequenceAndPersist(
  routeId: string,
  stops: any[],
  isPickup: boolean
) {
  const activeStops = stops.filter((s) => s.status !== "SKIPPED");
  const employees = activeStops.map(toOptimizeEmployee);
  let ordered = getOptimalPermutation(employees, isPickup);
  const { route: safeRoute } = enforceSafetyRules(ordered, isPickup, false);
  ordered = safeRoute;

  const { totalDistance, totalDuration, etas } = computeRouteMetrics(ordered, isPickup);

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ordered.length; i++) {
      const stop = activeStops.find((s) => s.employee.id === ordered[i].id);
      if (!stop) continue;
      await tx.routeStop.update({
        where: { id: stop.id },
        data: { stopOrder: i + 1, etaMinutes: etas[i] ?? 0 },
      });
    }

    await tx.route.update({
      where: { id: routeId },
      data: { totalDistance, totalDuration },
    });

    const mockStops = ordered.map((e) => ({ name: e.name, gender: e.gender }));
    const violations = checkSafetyViolations(mockStops, isPickup, false);
    await tx.violation.deleteMany({ where: { routeId } });
    for (const v of violations) {
      await tx.violation.create({
        data: {
          routeId,
          type: v.type,
          severity: v.severity,
          resolved: false,
          notes: v.notes,
        },
      });
    }
  });

  return { totalDistance, totalDuration };
}

export async function PATCH(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { employeeId, fromRouteId, toRouteId } = body;

    if (!employeeId || !fromRouteId || !toRouteId) {
      return NextResponse.json({ error: "employeeId, fromRouteId, and toRouteId are required" }, { status: 400 });
    }

    if (fromRouteId === toRouteId) {
      return NextResponse.json({ error: "Cannot move employee to the same route" }, { status: 400 });
    }

    const [fromRoute, toRoute] = await Promise.all([
      prisma.route.findUnique({
        where: { id: fromRouteId },
        include: { stops: { include: { employee: { include: { pickupPoint: true } } }, orderBy: { stopOrder: "asc" } } },
      }),
      prisma.route.findUnique({
        where: { id: toRouteId },
        include: { stops: { include: { employee: { include: { pickupPoint: true } } }, orderBy: { stopOrder: "asc" } } },
      }),
    ]);

    if (!fromRoute || !toRoute) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    const movingStop = fromRoute.stops.find((s) => s.employeeId === employeeId);
    if (!movingStop) {
      return NextResponse.json({ error: "Employee not found on source route" }, { status: 404 });
    }

    // Move in DB: update routeId and set temporary stopOrder
    await prisma.$transaction(async (tx) => {
      await tx.routeStop.update({
        where: { id: movingStop.id },
        data: { routeId: toRouteId, stopOrder: toRoute.stops.length + 1 },
      });

      if (fromRoute.stops.length === 1) {
        await tx.route.update({
          where: { id: fromRouteId },
          data: { status: "CANCELLED", totalDistance: 0, totalDuration: 0 },
        });
      }
    });

    // Resequence fromRoute if it still has stops
    const updatedFromStops = fromRoute.stops.filter((s) => s.employeeId !== employeeId);
    if (updatedFromStops.length > 0) {
      await resequenceAndPersist(fromRouteId, updatedFromStops, fromRoute.isPickup);
    }

    // Resequence toRoute
    const updatedToStops = [...toRoute.stops, movingStop];
    await resequenceAndPersist(toRouteId, updatedToStops, toRoute.isPickup);

    await audit({
      userId: auth.session.userId,
      role: auth.session.role,
      action: "UPDATE",
      entity: "Route",
      entityId: movingStop.id,
      after: { fromRouteId, toRouteId },
      ip,
    });

    // Retrieve updated routes to return
    const updatedRoutes = await prisma.route.findMany({
      where: { id: { in: [fromRouteId, toRouteId] } },
      include: {
        cab: true,
        shift: true,
        stops: { include: { employee: { include: { pickupPoint: true } } }, orderBy: { stopOrder: "asc" } },
        violations: true,
      },
    });

    const fromRouteUpdated = updatedRoutes.find((r) => r.id === fromRouteId);
    const toRouteUpdated = updatedRoutes.find((r) => r.id === toRouteId);

    return NextResponse.json({
      success: true,
      fromRoute: fromRouteUpdated,
      toRoute: toRouteUpdated,
    });
  } catch (e: any) {
    console.error("[api] ❌ PATCH /api/routes/move-employee", e);
    return NextResponse.json({ error: "Failed to move employee", details: e.message }, { status: 500 });
  }
}
