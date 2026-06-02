import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";
import { mapsProvider } from "@/lib/maps";

export async function GET(req: Request) {
  const session = await verifySession();
  if (session.role !== "ADMIN" && session.role !== "MANAGER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const shiftId = searchParams.get("shiftId");

  try {
    const cabs = await prisma.cab.findMany({
      where: {
        status: { not: "INACTIVE" },
        ...(search && {
          OR: [
            { vehicleNumber: { contains: search, mode: "insensitive" } },
            { vendor: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(shiftId && { shifts: { some: { id: shiftId } } }),
      },
      include: {
        shifts: true,
      },
      orderBy: { vehicleNumber: "asc" },
    });
    return NextResponse.json(cabs);
  } catch (e) {
    console.error("Error fetching cabs:", e);
    return NextResponse.json({ error: "Failed to fetch cabs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await verifySession();
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { vehicleNumber, capacity, vendor, status, driverName, driverPhone, licenseNumber, driverAddress, shiftIds } = body;
    const formattedAddress = body.formattedAddress || driverAddress;
    const placeId = body.placeId || null;
    const autoLat = body.lat ? Number(body.lat) : null;
    const autoLon = body.lon ? Number(body.lon) : null;

    let finalDriverX = null;
    let finalDriverY = null;
    let finalDriverPlaceId = null;
    if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
      finalDriverX = autoLon;
      finalDriverY = autoLat;
      finalDriverPlaceId = placeId;
    } else if (driverAddress) {
      const coords = await mapsProvider.geocode(driverAddress);
      if (coords) {
        finalDriverX = coords.x;
        finalDriverY = coords.y;
        finalDriverPlaceId = coords.placeId || null;
      }
    }

    const newCab = await prisma.cab.create({
      data: {
        vehicleNumber,
        capacity: parseInt(capacity),
        vendor,
        status,
        driverName: driverName || "Unassigned",
        driverPhone: driverPhone || "",
        licenseNumber: licenseNumber || "",
        driverAddress: driverAddress || null,
        formattedAddress,
        driverX: finalDriverX,
        driverY: finalDriverY,
        placeId: finalDriverPlaceId,
        shifts: shiftIds && shiftIds.length > 0 ? {
          connect: shiftIds.map((id: string) => ({ id }))
        } : undefined
      },
      include: { shifts: true }
    });
    return NextResponse.json(newCab);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
