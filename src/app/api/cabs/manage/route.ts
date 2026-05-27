import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST: Manually create a Cab and its Driver
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vehicleNumber, capacity, vendor, driverName, driverPhone, licenseNumber } = body;

    if (!vehicleNumber || !capacity || !driverName) {
      return NextResponse.json({ error: "Missing required fields (vehicleNumber, capacity, driverName)" }, { status: 400 });
    }

    const cab = await prisma.$transaction(async (tx) => {
      // Create Driver
      const driver = await tx.driver.create({
        data: {
          name: driverName,
          phone: driverPhone || "+91 99000 00000",
          licenseNumber: licenseNumber || `DL-MANUAL-${Math.floor(1000 + Math.random() * 9000)}`,
          status: "AVAILABLE",
        },
      });

      // Create Cab
      return await tx.cab.create({
        data: {
          vehicleNumber,
          capacity: parseInt(capacity),
          vendor: vendor || "Manual Registry",
          status: "AVAILABLE",
          driverId: driver.id,
        },
        include: {
          driver: true,
        },
      });
    });

    return NextResponse.json(cab);
  } catch (e) {
    console.error("Error creating cab manually:", e);
    return NextResponse.json({ error: "Failed to create cab record" }, { status: 500 });
  }
}

// DELETE: Delete a Cab and its associated Driver
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Cab ID is required" }, { status: 400 });
    }

    const cab = await prisma.cab.findUnique({
      where: { id },
    });

    if (!cab) {
      return NextResponse.json({ error: "Cab not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Delete Cab
      await tx.cab.delete({
        where: { id },
      });
      // Delete associated Driver if exists
      if (cab.driverId) {
        await tx.driver.delete({
          where: { id: cab.driverId },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Error deleting cab:", e);
    return NextResponse.json({ error: "Failed to delete cab record" }, { status: 500 });
  }
}
