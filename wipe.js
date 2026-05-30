const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function wipeData() {
  console.log("Wiping operational data...");
  try {
    await prisma.$transaction([
      prisma.violation.deleteMany(),
      prisma.routeStop.deleteMany(),
      prisma.operationalEvent.deleteMany(),
      prisma.vehicleLocation.deleteMany(),
      prisma.routeDeviation.deleteMany(),
      prisma.route.deleteMany(),
      prisma.timingChangeRequest.deleteMany(),
      prisma.leaveRequest.deleteMany(),
      prisma.employee.deleteMany(),
      prisma.cab.deleteMany(),
      prisma.shift.deleteMany(),
    ]);
    
    // Also delete any users that aren't the primary ADMIN to ensure a clean slate for the Excel import
    await prisma.user.deleteMany({
      where: {
        email: {
          not: "admin@shaibya.com" // Assuming this is the main admin, or just keep all ADMINs
        },
        role: {
          not: "ADMIN"
        }
      }
    });

    console.log("Data wiped successfully.");
  } catch (e) {
    console.error("Error wiping data:", e);
  } finally {
    await prisma.$disconnect();
  }
}

wipeData();
