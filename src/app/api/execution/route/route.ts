import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function POST(req: Request) {
  try {
    const session = await verifySession();
    // Only Drivers or Admins can manipulate route state in this endpoint
    if (session.role !== "DRIVER" && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { routeId, action, metadata } = await req.json();

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

    if (action === "START_ROUTE") {
      if (route.status !== "PLANNED" && route.status !== "ASSIGNED" && route.status !== "PENDING") {
        return NextResponse.json({ error: "Route cannot be started from current status" }, { status: 400 });
      }

      const updatedRoute = await prisma.$transaction(async (tx) => {
        // 1. Update Route Status
        const r = await tx.route.update({
          where: { id: routeId },
          data: {
            status: "IN_PROGRESS",
            startedAt: now,
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
            cabId: route.cab.id,
            metadata: metadata ? JSON.stringify(metadata) : null,
          }
        });

        return r;
      });

      // NO-AWAIT Notifications for all passengers
      Promise.all(route.stops.map(async (stop) => {
        if (stop.employee?.userId) {
          await createNotification(
            stop.employee.userId,
            "Route Started",
            `Your assigned cab (${route.cab.vehicleNumber}) has started the route.`,
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

      const updatedRoute = await prisma.$transaction(async (tx) => {
        const r = await tx.route.update({
          where: { id: routeId },
          data: {
            status: "COMPLETED",
            completedAt: now,
          }
        });

        await tx.operationalEvent.create({
          data: {
            type: "ROUTE_COMPLETED",
            timestamp: now,
            routeId,
            cabId: route.cab.id,
            metadata: metadata ? JSON.stringify(metadata) : null,
          }
        });

        return r;
      });

      // NO-AWAIT Notify Admins
      prisma.user.findMany({ where: { role: "ADMIN" } }).then(admins => {
        admins.forEach(admin => {
          createNotification(
            admin.id,
            "Route Completed",
            `Cab ${route.cab.vehicleNumber} has completed its route.`,
            "SYSTEM",
            "/dashboard/admin"
          );
        });
      }).catch(console.error);

      return NextResponse.json({ success: true, route: updatedRoute });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
