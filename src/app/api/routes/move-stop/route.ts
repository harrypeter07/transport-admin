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

function toOptimizeEmployee(stop: {
  employee: { id: string; name: string; gender: string; x: number; y: number; address: string; department?: string; phone?: string };
}): OptimizeEmployee {
  return {
    id: stop.employee.id,
    name: stop.employee.name,
    gender: stop.employee.gender as "MALE" | "FEMALE",
    x: stop.employee.x,
    y: stop.employee.y,
    address: stop.employee.address,
    department: stop.employee.department || "",
    phone: stop.employee.phone || "",
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
  stops: Array<{ id: string; employee: { id: string; name: string; gender: string; x: number; y: number; address: string; department?: string; phone?: string }; status: string }>,
  isPickup: boolean
) {
  const activeStops = stops.filter((s) => s.status !== "SKIPPED");
  const employees = activeStops.map(toOptimizeEmployee);
  let ordered = getOptimalPermutation(employees, isPickup);
  const { route: safeRoute, resolved } = enforceSafetyRules(ordered, isPickup, false);
  if (!resolved) {
    throw new Error("SAFETY_UNRESOLVED");
  }
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

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { stopId, fromRouteId, toRouteId, targetIndex } = body;

    if (!stopId || !fromRouteId || !toRouteId) {
      return NextResponse.json({ error: "stopId, fromRouteId, and toRouteId are required" }, { status: 400 });
    }

    if (fromRouteId === toRouteId) {
      return NextResponse.json({ error: "Use REORDER action for within-route moves" }, { status: 400 });
    }

    const [fromRoute, toRoute] = await Promise.all([
      prisma.route.findUnique({
        where: { id: fromRouteId },
        include: { cab: true, stops: { include: { employee: true }, orderBy: { stopOrder: "asc" } } },
      }),
      prisma.route.findUnique({
        where: { id: toRouteId },
        include: { cab: true, stops: { include: { employee: true }, orderBy: { stopOrder: "asc" } } },
      }),
    ]);

    if (!fromRoute || !toRoute) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    const movingStop = fromRoute.stops.find((s) => s.id === stopId);
    if (!movingStop) {
      return NextResponse.json({ error: "Stop not found on source route" }, { status: 404 });
    }

    if (movingStop.status === "SKIPPED") {
      return NextResponse.json({ error: "Cannot move a skipped stop" }, { status: 400 });
    }

    const targetActiveCount = toRoute.stops.filter((s) => s.status !== "SKIPPED").length;
    if (targetActiveCount >= toRoute.cab.capacity) {
      return NextResponse.json(
        { error: `Target cab at capacity (${toRoute.cab.capacity}/${toRoute.cab.capacity})` },
        { status: 409 }
      );
    }

    const newFromStops = fromRoute.stops.filter((s) => s.id !== stopId);
    let newToStops = [...toRoute.stops];
    const insertAt = typeof targetIndex === "number"
      ? Math.min(Math.max(targetIndex, 0), newToStops.length)
      : newToStops.length;
    newToStops.splice(insertAt, 0, movingStop);

    const toEmployees = newToStops.filter((s) => s.status !== "SKIPPED").map(toOptimizeEmployee);
    const trialOrdered = getOptimalPermutation(toEmployees, toRoute.isPickup);
    const { resolved } = enforceSafetyRules(trialOrdered, toRoute.isPickup, false);
    if (!resolved) {
      return NextResponse.json(
        { error: "Move would violate safety rules (e.g. isolated female). Choose a different cab." },
        { status: 422 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.routeStop.update({
        where: { id: stopId },
        data: { routeId: toRouteId, stopOrder: insertAt + 1 },
      });

      if (newFromStops.length === 0) {
        await tx.route.update({
          where: { id: fromRouteId },
          data: { status: "CANCELLED", totalDistance: 0, totalDuration: 0 },
        });
      }
    });

    try {
      if (newFromStops.length > 0) {
        await resequenceAndPersist(fromRouteId, newFromStops, fromRoute.isPickup);
      }
      await resequenceAndPersist(toRouteId, newToStops, toRoute.isPickup);
    } catch (e) {
      await prisma.routeStop.update({
        where: { id: stopId },
        data: { routeId: fromRouteId, stopOrder: movingStop.stopOrder },
      });
      throw e;
    }

    await audit({
      userId: auth.session.userId,
      role: auth.session.role,
      action: "UPDATE",
      entity: "Route",
      entityId: stopId,
      after: { fromRouteId, toRouteId },
      ip,
    });

    const updatedRoutes = await prisma.route.findMany({
      where: { id: { in: [fromRouteId, toRouteId] } },
      include: {
        cab: true,
        shift: true,
        stops: { include: { employee: true }, orderBy: { stopOrder: "asc" } },
        violations: true,
      },
    });

    return NextResponse.json({ success: true, routes: updatedRoutes });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "SAFETY_UNRESOLVED") {
      return NextResponse.json({ error: "Could not resolve safety violations after move" }, { status: 422 });
    }
    console.error("[api] ❌ POST /api/routes/move-stop", e);
    return NextResponse.json({ error: "Failed to move stop", details: message }, { status: 500 });
  }
}
