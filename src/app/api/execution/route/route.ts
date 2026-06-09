export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { resolveCabOriginFromSnapshot, getRouteDestinationPoint } from "@/lib/vehicleState";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  let action: string | undefined;
  let routeId: string | undefined;
  try {
  const session = await verifySession();
  // Only Drivers or Admins can manipulate route state in this endpoint
   if (session.role !== "DRIVER" && session.role !== "ADMIN") {
   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }

   const body = await req.json();
   routeId = body.routeId;
   action = body.action;
   const { metadata } = body;

 if (!routeId || !action) {
 return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
 }

  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: {
      stops: { include: { employee: true }, orderBy: { stopOrder: "asc" } },
      cab: true
    }
  });

 if (!route) {
 return NextResponse.json({ error: "Route not found" }, { status: 404 });
 }

 if (session.role === "DRIVER" && route.cab.userId !== session.userId) {
 return NextResponse.json({ error: "Route not assigned to this driver" }, { status: 403 });
 }

  const now = new Date();
  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const depot = { x: settings.defaultDepotLat, y: settings.defaultDepotLng };

  const cabSnapshotRecord = await prisma.cab.findUnique({
    where: { id: route.cab.id },
    include: {
      routes: {
        where: { date: route.date },
        include: {
          stops: { include: { employee: true } },
          locations: { orderBy: { timestamp: "desc" }, take: 1 }
        }
      }
    }
  });

  if (!cabSnapshotRecord) {
    return NextResponse.json({ error: "Cab not found" }, { status: 404 });
  }

  if (action === "START_ROUTE") {
    if (route.status !== "PLANNED" && route.status !== "ASSIGNED" && route.status !== "PENDING") {
      return NextResponse.json({ error: "Route cannot be started from current status" }, { status: 400 });
    }

    const cabSnapshot = {
      id: cabSnapshotRecord.id,
      driverX: cabSnapshotRecord.driverX,
      driverY: cabSnapshotRecord.driverY,
      routes: cabSnapshotRecord.routes.map((historicalRoute) => ({
        id: historicalRoute.id,
        status: historicalRoute.status,
        startedAt: historicalRoute.startedAt,
        completedAt: historicalRoute.completedAt,
        currentLat: historicalRoute.currentLat,
        currentLng: historicalRoute.currentLng,
        lastLocationAt: historicalRoute.lastLocationAt,
        locations: historicalRoute.locations.map((location) => ({
          lat: location.lat,
          lng: location.lng,
          timestamp: location.timestamp,
        })),
        stops: historicalRoute.stops.map((stop) => ({
          stopOrder: stop.stopOrder,
          employee: stop.employee ? { x: stop.employee.x, y: stop.employee.y } : null,
        })),
      })),
    };
    const origin = resolveCabOriginFromSnapshot(cabSnapshot, depot);

    const updatedRoute = await prisma.$transaction(async (tx) => {
      // 1. Update Route Status
      const r = await tx.route.update({
        where: { id: routeId },
        data: {
          status: "IN_PROGRESS",
          startedAt: now,
          currentLat: origin.startPoint.x,
          currentLng: origin.startPoint.y,
          lastLocationAt: now,
        }
      });

      // 2. Set expected times for all stops based on ETAs
      for (const stop of route.stops) {
        const expectedTime = new Date(now.getTime() + stop.etaMinutes * 60000);
        await tx.routeStop.update({
 where: { id: stop.id },
 data: { expectedTime }
 });
 }

 // 3. Log Event
 await tx.operationalEvent.create({
 data: {
 type: "ROUTE_STARTED",
 timestamp: now,
 routeId,
 cabId: route.cab?.id,
 metadata: metadata ? JSON.stringify(metadata) : null,
 }
 });

 return r;
 });

  await audit({ userId: session.userId, role: session.role, action: "UPDATE", entity: "Route", entityId: routeId, after: { status: "IN_PROGRESS", startedAt: now }, ip });

  // NO-AWAIT Notifications for all passengers
  Promise.all(route.stops.map(async (stop) => {
  if (stop.employee?.userId) {
  await createNotification(
  stop.employee.userId,
  "Route Started",
  `Your assigned cab (${route.cab?.vehicleNumber || "Vehicle"}) has started the route.`,
  "ROUTE",
  "/dashboard/employee/route"
  );
  }
  })).catch(console.error);

  return NextResponse.json({ success: true, route: updatedRoute });
  }

  if (action === "COMPLETE_ROUTE") {
    if (route.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "Only IN_PROGRESS routes can be completed" }, { status: 400 });
    }

    const completedPoint = getRouteDestinationPoint({
      id: route.id,
      status: route.status,
      startedAt: route.startedAt,
      completedAt: route.completedAt,
      currentLat: route.currentLat,
      currentLng: route.currentLng,
      lastLocationAt: route.lastLocationAt,
      locations: [],
      stops: route.stops.map((stop) => ({
        stopOrder: stop.stopOrder,
        employee: stop.employee ? { x: stop.employee.x, y: stop.employee.y } : null,
      })),
    }) || { x: route.currentLat ?? settings.defaultDepotLat, y: route.currentLng ?? settings.defaultDepotLng };

    const updatedRoute = await prisma.$transaction(async (tx) => {
      const r = await tx.route.update({
        where: { id: routeId },
        data: {
          status: "COMPLETED",
          completedAt: now,
          currentLat: completedPoint.x,
          currentLng: completedPoint.y,
          lastLocationAt: now,
        }
      });

      await tx.operationalEvent.create({
        data: {
 type: "ROUTE_COMPLETED",
 timestamp: now,
 routeId,
 cabId: route.cab?.id,
 metadata: metadata ? JSON.stringify(metadata) : null,
 }
 });

 return r;
 });

  await audit({ userId: session.userId, role: session.role, action: "UPDATE", entity: "Route", entityId: routeId, after: { status: "COMPLETED", completedAt: now }, ip });

  // NO-AWAIT Notify Admins
  prisma.user.findMany({ where: { role: "ADMIN" } }).then(admins => {
  admins.forEach(admin => {
  createNotification(
  admin.id,
  "Route Completed",
  `Cab ${route.cab?.vehicleNumber || "Vehicle"} has completed its route.`,
  "SYSTEM",
  "/dashboard/admin"
  );
  });
  }).catch(console.error);

  return NextResponse.json({ success: true, route: updatedRoute });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
  console.error("[api] ❌ POST /api/execution/route", { action, routeId, ip }, error);
  return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
