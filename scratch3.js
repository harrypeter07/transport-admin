const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const baselineRoutes = await prisma.baselineRoute.findMany();
  for (const br of baselineRoutes) {
    console.log(`Baseline ID: ${br.id}, Date: ${br.date}`);
    console.log(`Snapshot ID: ${br.snapshotId}`);
    
    let routeData = br.routeData;
    if (typeof routeData === 'string') {
      routeData = JSON.parse(routeData);
    }
    
    // Check if it's an object with a routes array
    if (routeData && !Array.isArray(routeData) && Array.isArray(routeData.routes)) {
      routeData = routeData.routes;
    }

    console.log(`Contains ${routeData?.length || 0} routes.`);
    
    if (!Array.isArray(routeData)) continue;

    // Check shift for each route
    const shiftIds = [...new Set(routeData.map(r => r.shiftId))];
    console.log(`Shift IDs present:`, shiftIds);
    
    for (const route of routeData) {
      if (route.shiftId === "shift-0800") {
        console.log(`Route Cab: ${route.cabId} | Seq: ${route.tripSequence} | OptimScore: ${route.optimizationScore}`);
        for (const stop of route.stops) {
          console.log(`  Stop: ${stop.employeeId} - Order: ${stop.stopOrder} - Eta: ${stop.etaMinutes}`);
        }
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
