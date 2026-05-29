import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function POST(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "DRIVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { routeId, lat, lng } = await req.json();

    if (!routeId || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const route = await prisma.route.findUnique({
      where: { id: routeId }
    });

    if (!route || route.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "Route not active" }, { status: 400 });
    }

    const now = new Date();

    // Upsert latest location directly on Route and insert trail
    await prisma.$transaction([
      prisma.route.update({
        where: { id: routeId },
        data: {
          currentLat: lat,
          currentLng: lng,
          lastLocationAt: now
        }
      }),
      prisma.vehicleLocation.create({
        data: {
          routeId,
          lat,
          lng,
          timestamp: now
        }
      })
    ]);

    // Simple Deviation Check: STALLED
    // If we want to check if stalled, we could check the previous location. 
    // In this basic version, we will only log the location.

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
