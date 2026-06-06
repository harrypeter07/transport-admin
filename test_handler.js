const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { fetchGoogleRouteMetrics } = require('./src/lib/optimization');

async function test() {
  const route = await prisma.route.findFirst({ include: { stops: { include: { employee: true } } } });
  if (!route) return console.log("No route");
  
  const targetCab = await prisma.cab.findFirst({ where: { id: { not: route.cabId } }, include: { routes: true } });
  if (!targetCab) return console.log("No cab");

  console.log("Found route", route.id, "and cab", targetCab.id);

  const existingRoutesForCab = targetCab.routes.filter(r => r.id !== route.id);
  const newTripSequence = existingRoutesForCab.length + 1;
  const depot = { x: 79.0526, y: 21.0625 };
  
  let newStartPoint;
  if (newTripSequence === 1 && typeof targetCab.driverX === "number" && typeof targetCab.driverY === "number") {
    newStartPoint = { x: targetCab.driverX, y: targetCab.driverY };
  } else {
    newStartPoint = depot;
  }

  const stopPoints = route.stops.map(s => ({ x: s.employee.x, y: s.employee.y }));
  const metricsPoints = route.isPickup ? [newStartPoint, ...stopPoints] : [...stopPoints, newStartPoint];

  console.log("Metrics points:", metricsPoints.length);
  try {
    const res = await fetchGoogleRouteMetrics(metricsPoints, route.isPickup, depot);
    console.log("Res:", res);
  } catch(e) {
    console.error("fetch error:", e);
  }
}
test().catch(console.error).finally(() => prisma.$disconnect());
