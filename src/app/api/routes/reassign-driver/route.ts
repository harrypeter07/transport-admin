export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiRole } from "@/lib/apiAuth";
import { audit } from "@/lib/audit";
import { fetchGoogleRouteMetrics, getDistance, DEPOT } from "@/lib/optimization";

const reqIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

/**
 * POST /api/routes/reassign-driver
 *
 * Mode A — FULL_DAY: Driver is unavailable for the rest of the day.
 *   All pending/planned routes for this cab today are reassigned.
 *   Cab is marked MAINTENANCE.
 *
 * Mode B — TIME_WINDOW: Driver is temporarily unavailable from fromTime to toTime (HH:mm).
 *   Only routes whose shift.startTime falls inside the window are reassigned.
 *   Cab status is NOT changed — admin can restore when driver returns.
 *
 * Body:
 *   cabId:    string   — departing cab
 *   reason:   string   — DRIVER_UNAVAILABLE | VEHICLE_BREAKDOWN | DRIVER_TEMP_ABSENCE | OTHER
 *   mode:     string   — FULL_DAY | TIME_WINDOW  (default: FULL_DAY)
 *   fromTime?: string  — "HH:mm" (required for TIME_WINDOW)
 *   toTime?:   string  — "HH:mm" (required for TIME_WINDOW)
 *
 * PATCH /api/routes/reassign-driver?cabId=xxx
 *   Restores a cab back to AVAILABLE (after temporary absence).
 */

function timeInWindow(shiftStartTime: string, fromTime: string, toTime: string): boolean {
  // All times are "HH:mm". Returns true if shiftStartTime is within [fromTime, toTime].
  return shiftStartTime >= fromTime && shiftStartTime <= toTime;
}

async function performReassignment(
  cabId: string,
  reason: string,
  routesToReassign: any[],
  today: string,
  authUserId: string,
  authRole: string,
  ip: string
) {
  const settings = await prisma.systemSettings.findUnique({ where: { id: "default" } });
  const depot = settings
    ? { x: settings.defaultDepotLng, y: settings.defaultDepotLat }
    : DEPOT;

  const allAvailableCabs = await prisma.cab.findMany({
    where: { status: "AVAILABLE", id: { not: cabId } },
    include: {
      routes: { where: { date: today }, orderBy: { tripSequence: "asc" } },
      shifts: true,
    },
  });

  const reassigned: {
    routeId: string;
    shiftName: string;
    fromCabId: string;
    toCabId: string;
    toDriverName: string;
    toVehicleNumber: string;
    newTripSequence: number;
  }[] = [];
  const failed: { routeId: string; shiftName: string; reason: string }[] = [];

  for (const route of routesToReassign) {
    const routeShiftId = route.shiftId;
    const requiredSeats = route.stops.length;

    const centroid = route.stops.length > 0
      ? {
          x: route.stops.reduce((s: number, stop: any) => s + stop.employee.x, 0) / route.stops.length,
          y: route.stops.reduce((s: number, stop: any) => s + stop.employee.y, 0) / route.stops.length,
        }
      : depot;

    const candidates = allAvailableCabs.filter(cab =>
      cab.shifts.some(s => s.id === routeShiftId) && cab.capacity >= requiredSeats
    );

    if (candidates.length === 0) {
      failed.push({
        routeId: route.id,
        shiftName: route.shift?.name || route.shiftId,
        reason: "No available cab matching this shift with sufficient capacity",
      });
      continue;
    }

    const scored = candidates.map(cab => {
      const existingRoutesToday = cab.routes.filter((r: any) => r.id !== route.id);
      const newTripSeq = existingRoutesToday.length + 1;
      const startPoint =
        newTripSeq === 1 && typeof cab.driverX === "number" && typeof cab.driverY === "number"
          ? { x: cab.driverX, y: cab.driverY }
          : depot;
      return { cab, newTripSeq, startPoint, dist: getDistance(startPoint, centroid) };
    });

    scored.sort((a, b) => a.dist - b.dist);
    const best = scored[0];

    const stopPoints = route.stops.map((s: any) => ({ x: s.employee.x, y: s.employee.y }));
    const { distance: newDistance, duration: newDuration } = await fetchGoogleRouteMetrics(
      [best.startPoint, ...stopPoints],
      route.isPickup,
      depot
    );

    await prisma.route.update({
      where: { id: route.id },
      data: { cabId: best.cab.id, tripSequence: best.newTripSeq, totalDistance: newDistance, totalDuration: newDuration },
    });

    best.cab.routes.push({ ...route, cabId: best.cab.id, tripSequence: best.newTripSeq } as any);

    const reasonLabel =
      reason === "VEHICLE_BREAKDOWN" ? "a vehicle breakdown" :
      reason === "DRIVER_TEMP_ABSENCE" ? "a temporary driver absence" :
      reason === "DRIVER_UNAVAILABLE" ? "the driver being unavailable" : "an operational change";

    const employeeUserIds: string[] = route.stops
      .map((stop: any) => stop.employee.userId)
      .filter((uid: string | null): uid is string => uid !== null);

    if (employeeUserIds.length > 0) {
      await prisma.notification.createMany({
        data: employeeUserIds.map((userId: string) => ({
          userId,
          title: "Your transport assignment has changed",
          message: `Your cab for ${route.shift?.name || "your shift"} has been reassigned to ${best.cab.driverName} (${best.cab.vehicleNumber}) due to ${reasonLabel}. Please check your route for updated pickup details.`,
          category: "ROUTE",
          actionUrl: "/dashboard/employee/route",
        })),
      });
    }

    reassigned.push({
      routeId: route.id,
      shiftName: route.shift?.name || route.shiftId,
      fromCabId: cabId,
      toCabId: best.cab.id,
      toDriverName: best.cab.driverName,
      toVehicleNumber: best.cab.vehicleNumber,
      newTripSequence: best.newTripSeq,
    });

    await audit({
      userId: authUserId,
      role: authRole,
      action: "UPDATE",
      entity: "Route",
      entityId: route.id,
      before: { cabId, status: route.status },
      after: { cabId: best.cab.id, tripSequence: best.newTripSeq, reason },
      ip,
    });
  }

  return { reassigned, failed };
}

export async function POST(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { cabId, reason, mode = "FULL_DAY", fromTime, toTime } = body;

    if (!cabId || !reason) {
      return NextResponse.json({ error: "cabId and reason are required" }, { status: 400 });
    }
    if (!["DRIVER_UNAVAILABLE", "VEHICLE_BREAKDOWN", "DRIVER_TEMP_ABSENCE", "OTHER"].includes(reason)) {
      return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
    }
    if (mode === "TIME_WINDOW" && (!fromTime || !toTime)) {
      return NextResponse.json({ error: "fromTime and toTime are required for TIME_WINDOW mode" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    const departingCab = await prisma.cab.findUnique({
      where: { id: cabId },
      include: {
        routes: {
          where: { date: today, status: { in: ["PENDING", "PLANNED"] } },
          include: {
            stops: { include: { employee: true }, orderBy: { stopOrder: "asc" } },
            shift: true,
          },
          orderBy: { tripSequence: "asc" },
        },
      },
    });

    if (!departingCab) {
      return NextResponse.json({ error: "Cab not found" }, { status: 404 });
    }

    let routesToReassign = departingCab.routes;

    if (mode === "TIME_WINDOW") {
      // Only reassign routes whose shift.startTime falls in the unavailability window
      routesToReassign = routesToReassign.filter(r =>
        r.shift?.startTime ? timeInWindow(r.shift.startTime, fromTime, toTime) : false
      );
    }

    if (routesToReassign.length === 0) {
      return NextResponse.json({
        reassigned: [],
        failed: [],
        cabStatusChanged: false,
        message: "No pending routes found in the specified window.",
      });
    }

    // For FULL_DAY: mark cab as MAINTENANCE. For TIME_WINDOW: leave AVAILABLE (driver returns).
    if (mode === "FULL_DAY") {
      await prisma.cab.update({ where: { id: cabId }, data: { status: "MAINTENANCE" } });
    }

    const { reassigned, failed } = await performReassignment(
      cabId, reason, routesToReassign, today,
      auth.session.userId, auth.session.role, ip
    );

    console.info(`[api] ✅ POST /api/routes/reassign-driver`, { mode, cabId, reason, reassigned: reassigned.length, failed: failed.length });

    return NextResponse.json({
      reassigned,
      failed,
      cabStatusChanged: mode === "FULL_DAY",
      mode,
      message: `${reassigned.length} route(s) reassigned. ${failed.length} could not be reassigned.`,
    });
  } catch (e) {
    console.error("[api] ❌ POST /api/routes/reassign-driver", { ip }, e);
    return NextResponse.json({ error: "Failed to reassign driver routes" }, { status: 500 });
  }
}

/** PATCH — Restore a cab back to AVAILABLE after a temporary absence */
export async function PATCH(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { cabId } = body;
    if (!cabId) return NextResponse.json({ error: "cabId is required" }, { status: 400 });

    await prisma.cab.update({ where: { id: cabId }, data: { status: "AVAILABLE" } });

    await audit({
      userId: auth.session.userId,
      role: auth.session.role,
      action: "UPDATE",
      entity: "Cab",
      entityId: cabId,
      before: { status: "MAINTENANCE" },
      after: { status: "AVAILABLE" },
      ip,
    });

    console.info(`[api] ✅ PATCH /api/routes/reassign-driver — restored cab ${cabId}`, { ip });
    return NextResponse.json({ success: true, message: "Driver has been restored to available status." });
  } catch (e) {
    console.error("[api] ❌ PATCH /api/routes/reassign-driver", { ip }, e);
    return NextResponse.json({ error: "Failed to restore driver availability" }, { status: 500 });
  }
}
