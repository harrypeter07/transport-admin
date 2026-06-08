const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const dummyCabs = await prisma.cab.findMany({
    where: {
      vehicleNumber: { contains: "_deleted_" }
    }
  });

  console.log(`Found ${dummyCabs.length} dummy cabs.`);

  for (const cab of dummyCabs) {
    console.log(`Deleting cab ${cab.vehicleNumber}...`);
    
    // Find all routes for this cab
    const routes = await prisma.route.findMany({
      where: { cabId: cab.id }
    });
    const routeIds = routes.map(r => r.id);

    if (routeIds.length > 0) {
      await prisma.routeStop.deleteMany({ where: { routeId: { in: routeIds } } });
      await prisma.violation.deleteMany({ where: { routeId: { in: routeIds } } });
      await prisma.operationalEvent.deleteMany({ where: { routeId: { in: routeIds } } });
      await prisma.vehicleLocation.deleteMany({ where: { routeId: { in: routeIds } } });
      await prisma.route.deleteMany({ where: { id: { in: routeIds } } });
    }

    if (cab.userId) {
      await prisma.user.delete({ where: { id: cab.userId } }).catch(() => {});
    }

    await prisma.cab.delete({ where: { id: cab.id } });
    console.log(`Successfully deleted ${cab.vehicleNumber}`);
  }

  console.log("Done.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
