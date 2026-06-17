import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Starting Shift Normalization Migration ===");

  try {
    // 1. Ensure canonical shifts exist
    console.log("Ensuring canonical shifts exist...");
    const canonical0700 = await prisma.shift.upsert({
      where: { id: "shift-0700" },
      update: { name: "Shift 07:00", startTime: "07:00", endTime: "16:00" },
      create: { id: "shift-0700", name: "Shift 07:00", startTime: "07:00", endTime: "16:00" },
    });
    console.log(`Canonical shift 07:00: ${canonical0700.id}`);

    const canonical0900 = await prisma.shift.upsert({
      where: { id: "shift-0900" },
      update: { name: "Shift 09:00", startTime: "09:00", endTime: "18:00" },
      create: { id: "shift-0900", name: "Shift 09:00", startTime: "09:00", endTime: "18:00" },
    });
    console.log(`Canonical shift 09:00: ${canonical0900.id}`);

    const old0700Id = "1b66fec0-f7d3-473e-8665-2721ba2c7f72";
    const old0900Id = "1be10596-ddbe-4867-951f-3826040ec683";

    // 2. Migrate Employees
    console.log("Migrating employees...");
    const emp0700Update = await prisma.employee.updateMany({
      where: { shiftId: old0700Id },
      data: { shiftId: "shift-0700" },
    });
    console.log(`Updated ${emp0700Update.count} employees from Shift 07:00 UUID to canonical`);

    const emp0900Update = await prisma.employee.updateMany({
      where: { shiftId: old0900Id },
      data: { shiftId: "shift-0900" },
    });
    console.log(`Updated ${emp0900Update.count} employees from Shift 09:00 UUID to canonical`);

    // 3. Migrate Routes
    console.log("Migrating routes...");
    const route0700Update = await prisma.route.updateMany({
      where: { shiftId: old0700Id },
      data: { shiftId: "shift-0700" },
    });
    console.log(`Updated ${route0700Update.count} routes from Shift 07:00 UUID to canonical`);

    const route0900Update = await prisma.route.updateMany({
      where: { shiftId: old0900Id },
      data: { shiftId: "shift-0900" },
    });
    console.log(`Updated ${route0900Update.count} routes from Shift 09:00 UUID to canonical`);

    // 4. Migrate Cab-Shift Relations
    console.log("Migrating cab shift relation connections...");
    // Find all cabs associated with old Shift 07:00
    const cabsWithOld0700 = await prisma.cab.findMany({
      where: { shifts: { some: { id: old0700Id } } },
    });
    for (const cab of cabsWithOld0700) {
      await prisma.cab.update({
        where: { id: cab.id },
        data: {
          shifts: {
            connect: { id: "shift-0700" },
            disconnect: { id: old0700Id },
          },
        },
      });
      console.log(`Migrated cab ${cab.vehicleNumber} from Shift 07:00 UUID to canonical`);
    }

    // Find all cabs associated with old Shift 09:00
    const cabsWithOld0900 = await prisma.cab.findMany({
      where: { shifts: { some: { id: old0900Id } } },
    });
    for (const cab of cabsWithOld0900) {
      await prisma.cab.update({
        where: { id: cab.id },
        data: {
          shifts: {
            connect: { id: "shift-0900" },
            disconnect: { id: old0900Id },
          },
        },
      });
      console.log(`Migrated cab ${cab.vehicleNumber} from Shift 09:00 UUID to canonical`);
    }

    // 5. Clean up old UUID shifts
    console.log("Deleting old UUID shifts...");
    const deleted0700 = await prisma.shift.deleteMany({
      where: { id: old0700Id },
    });
    console.log(`Deleted Shift 07:00 UUID records: ${deleted0700.count}`);

    const deleted0900 = await prisma.shift.deleteMany({
      where: { id: old0900Id },
    });
    console.log(`Deleted Shift 09:00 UUID records: ${deleted0900.count}`);

    console.log("=== Shift Normalization Migration Completed Successfully ===");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
