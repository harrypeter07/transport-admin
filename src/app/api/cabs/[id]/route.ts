import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";
import { geocodeNagpurPlace } from "@/lib/optimization";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { vehicleNumber, capacity, vendor, status, driverName, driverPhone, licenseNumber, driverAddress, shiftIds } = body;

    let finalDriverX = undefined;
    let finalDriverY = undefined;
    if (driverAddress !== undefined) {
      if (driverAddress) {
        const coords = await geocodeNagpurPlace(driverAddress);
        if (coords) {
          finalDriverX = coords.x;
          finalDriverY = coords.y;
        }
      } else {
        finalDriverX = null;
        finalDriverY = null;
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
        ...(finalDriverX !== undefined && { driverX: finalDriverX }),
        ...(finalDriverY !== undefined && { driverY: finalDriverY }),
        shifts: shiftIds ? {
          set: shiftIds.map((sid: string) => ({ id: sid }))
        } : undefined
      },
      include: { shifts: true }
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const routeReferences = await prisma.route.count({
      where: { cabId: id },
    });

    if (routeReferences > 0) {
      const cab = await prisma.cab.findUnique({ where: { id } });
      if (cab) {
        await prisma.cab.update({
          where: { id },
          data: { 
            status: "INACTIVE", 
            vehicleNumber: `${cab.vehicleNumber}_deleted_${Date.now()}` 
          }
        });
      }
      return NextResponse.json({ success: true });
    }

    await prisma.cab.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
