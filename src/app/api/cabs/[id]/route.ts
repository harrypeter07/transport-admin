import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";
import { mapsProvider } from "@/lib/maps";
import { audit } from "@/lib/audit";

function reqIp(req: NextRequest | Request): string {
  return (req as any).headers?.get?.("x-forwarded-for") || (req as any).headers?.get?.("x-real-ip") || "unknown";
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  const ip = reqIp(req);
  if (session.role !== "ADMIN") {
    console.warn("[api] 🔒 PUT /api/cabs/[id] — UNAUTHORIZED", { role: session.role, ip });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const before = await prisma.cab.findUnique({ where: { id } });
    const body = await req.json();
    const { vehicleNumber, capacity, vendor, status, driverName, driverPhone, licenseNumber, driverAddress, shiftIds } = body;
    const formattedAddress = body.formattedAddress;
    const placeId = body.placeId;
    const autoLat = body.lat ? Number(body.lat) : null;
    const autoLon = body.lon ? Number(body.lon) : null;

    let finalDriverX = undefined;
    let finalDriverY = undefined;
    let finalDriverPlaceId = undefined;
    if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
      finalDriverX = autoLon;
      finalDriverY = autoLat;
      finalDriverPlaceId = placeId || null;
    } else if (driverAddress !== undefined) {
      if (driverAddress) {
        const coords = await mapsProvider.geocode(driverAddress);
        if (coords) {
          finalDriverX = coords.x;
          finalDriverY = coords.y;
          finalDriverPlaceId = coords.placeId || null;
        }
      } else {
        finalDriverX = null;
        finalDriverY = null;
        finalDriverPlaceId = null;
      }
    }

    const updated = await prisma.cab.update({
      where: { id },
      data: {
        vehicleNumber,
        ...(capacity !== undefined && { capacity: parseInt(capacity) }),
        vendor,
        status,
        ...(driverName !== undefined && { driverName }),
        ...(driverPhone !== undefined && { driverPhone }),
        ...(licenseNumber !== undefined && { licenseNumber }),
        ...(driverAddress !== undefined && { driverAddress: driverAddress || null }),
        ...(formattedAddress !== undefined && { formattedAddress }),
        ...(finalDriverX !== undefined && { driverX: finalDriverX }),
        ...(finalDriverY !== undefined && { driverY: finalDriverY }),
        ...(finalDriverPlaceId !== undefined && { placeId: finalDriverPlaceId }),
        shifts: shiftIds ? {
          set: shiftIds.map((sid: string) => ({ id: sid }))
        } : undefined
      },
      include: { shifts: true }
    });

    const pendingRoutes = await prisma.route.findMany({
      where: { cabId: id, status: { in: ["PENDING", "PLANNED"] } },
      select: { id: true }
    });
    if (pendingRoutes.length > 0) {
      const routeIds = pendingRoutes.map(r => r.id);
      await prisma.routeStop.deleteMany({ where: { routeId: { in: routeIds } } });
      await prisma.violation.deleteMany({ where: { routeId: { in: routeIds } } });
      await prisma.route.deleteMany({ where: { id: { in: routeIds } } });
      console.info(`[api] Deleted ${routeIds.length} pending routes for updated cab ${id} to ensure fresh data.`);
    }

    await audit({ userId: session.userId, role: session.role, action: "UPDATE", entity: "Cab", entityId: id, before, after: { vehicleNumber: updated.vehicleNumber }, ip });
    console.info("[api] ✅ PUT /api/cabs/[id] — OK", { vehicleNumber: updated.vehicleNumber, id, userId: session.userId, ip });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[api] ❌ PUT /api/cabs/[id] — Failed", { ip }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  const ip = reqIp(req);
  if (session.role !== "ADMIN") {
    console.warn("[api] 🔒 DELETE /api/cabs/[id] — UNAUTHORIZED", { role: session.role, ip });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const before = await prisma.cab.findUnique({ where: { id } });

    await prisma.$transaction(async (tx) => {
      // First, find all routes for this cab
      const allRoutes = await tx.route.findMany({
        where: { cabId: id },
        select: { id: true }
      });
      const allRouteIds = allRoutes.map(r => r.id);

      if (allRouteIds.length > 0) {
        // Cascade delete all references to these routes
        await tx.routeStop.deleteMany({ where: { routeId: { in: allRouteIds } } });
        await tx.violation.deleteMany({ where: { routeId: { in: allRouteIds } } });
        await tx.operationalEvent.deleteMany({ where: { routeId: { in: allRouteIds } } });
        await tx.vehicleLocation.deleteMany({ where: { routeId: { in: allRouteIds } } });
        await tx.route.deleteMany({ where: { id: { in: allRouteIds } } });
      }

      // Then delete the user account if it exists
      if (before?.userId) {
        await tx.user.delete({ where: { id: before.userId } }).catch(() => {});
      }
      
      // Finally, delete the cab itself
      await tx.cab.delete({ where: { id } });
    });

    await audit({ userId: session.userId, role: session.role, action: "DELETE", entity: "Cab", entityId: id, before, ip });
    console.info("[api] ✅ DELETE /api/cabs/[id] — Hard deleted", { id, userId: session.userId, ip });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[api] ❌ DELETE /api/cabs/[id] — Failed", { ip }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
