const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    const baselines = await prisma.baselineRoute.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    console.log(`Found ${baselines.length} BaselineRoute records`);
    baselines.forEach((b, i) => {
      console.log(`\n--- Baseline Record ${i + 1} ---`);
      console.log(`ID: ${b.id}, Date: "${b.date}", Created: ${b.createdAt}`);
      console.log(`Statistics:`, JSON.stringify(b.statistics));
      const routes = typeof b.routeData === 'string' ? JSON.parse(b.routeData) : b.routeData;
      console.log(`Number of routes in routeData: ${routes?.length}`);
      if (routes && routes.length > 0) {
        console.log(`Sample Route details:`);
        routes.slice(0, 3).forEach((r, idx) => {
          console.log(`  Route ${idx + 1}: totalDistance = ${r.totalDistance}, totalDuration = ${r.totalDuration}`);
        });
      }
    });

    const snapshots = await prisma.optimizedRouteSnapshot.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    console.log(`\nFound ${snapshots.length} OptimizedRouteSnapshot records`);
    snapshots.forEach((s, i) => {
      console.log(`\n--- Optimized Snapshot Record ${i + 1} ---`);
      console.log(`ID: ${s.id}, Date: "${s.date}", Created: ${s.createdAt}`);
      const routes = typeof s.routeData === 'string' ? JSON.parse(s.routeData) : s.routeData;
      console.log(`Number of routes in routeData: ${routes?.length}`);
      if (routes && routes.length > 0) {
        routes.slice(0, 3).forEach((r, idx) => {
          console.log(`  Route ${idx + 1}: totalDistance = ${r.totalDistance}, totalDuration = ${r.totalDuration}`);
        });
      }
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
