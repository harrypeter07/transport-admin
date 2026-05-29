import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";

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
        ...(search && {
          OR: [
            { vehicleNumber: { contains: search, mode: "insensitive" } },
            { vendor: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(shiftId && { shiftId }),
      },
      include: {
        driver: true,
        shift: true,
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
    const { vehicleNumber, capacity, vendor, status, driverId, shiftId } = body;

    const newCab = await prisma.cab.create({
      data: {
        vehicleNumber,
        capacity: parseInt(capacity),
        vendor,
        status,
        driverId: driverId || null,
        shiftId: shiftId || null
      },
      include: { driver: true, shift: true }
    });
    return NextResponse.json(newCab);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
