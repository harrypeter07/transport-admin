import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocodeNagpurPlace } from "@/lib/optimization";

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

// PATCH: Edit Cab and associated Driver details
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, vehicleNumber, capacity, vendor, driverName, driverPhone, licenseNumber, driverStartAddress, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Cab ID is required" }, { status: 400 });
    }

    const cab = await prisma.cab.findUnique({
      where: { id },
      include: { driver: true }
    });

    if (!cab) {
      return NextResponse.json({ error: "Cab not found" }, { status: 404 });
    }

    const updatedCab = await prisma.$transaction(async (tx) => {
      // Update Driver if exists and driver details are provided
      if (cab.driverId && (driverName !== undefined || driverPhone !== undefined || licenseNumber !== undefined || driverStartAddress !== undefined)) {
        let startX, startY;
        if (driverStartAddress) {
           const coords = await geocodeNagpurPlace(driverStartAddress);
           startX = coords.x;
           startY = coords.y;
        }

        await tx.driver.update({
          where: { id: cab.driverId },
          data: {
            name: driverName !== undefined ? driverName : undefined,
            phone: driverPhone !== undefined ? driverPhone : undefined,
            licenseNumber: licenseNumber !== undefined ? licenseNumber : undefined,
            startAddress: driverStartAddress !== undefined ? driverStartAddress : undefined,
            startX: startX,
            startY: startY,
          },
        });
      }

      // Update Cab
      return await tx.cab.update({
        where: { id },
        data: {
          vehicleNumber: vehicleNumber !== undefined ? vehicleNumber : undefined,
          capacity: capacity !== undefined ? parseInt(capacity) : undefined,
          vendor: vendor !== undefined ? vendor : undefined,
          status: status !== undefined ? status : undefined,
        },
        include: {
          driver: true,
        },
      });
    });

    return NextResponse.json(updatedCab);
  } catch (e) {
    console.error("Error updating cab details:", e);
    return NextResponse.json({ error: "Failed to update cab details" }, { status: 500 });
  }
}
