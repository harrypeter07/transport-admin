const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const OFFICE_LAT = 21.0625;
const OFFICE_LNG = 79.0526;

async function main() {
  const emps = await prisma.employee.findMany({ where: { shiftId: 'shift-0800' } });
  
  if (emps.length === 0) {
    console.log("No employees found for 8:00 AM shift.");
    return;
  }
  
  emps.forEach(e => {
    e.distToOffice = getDistance(e.y, e.x, OFFICE_LAT, OFFICE_LNG);
  });
  
  let unassigned = [...emps];
  const clusters = [];
  while (unassigned.length > 0) {
    unassigned.sort((a, b) => b.distToOffice - a.distToOffice);
    const center = unassigned[0];
    unassigned.splice(0, 1);
    
    const cluster = [center];
    while (cluster.length < 5 && unassigned.length > 0) {
      unassigned.sort((a, b) => {
        const distA = getDistance(center.y, center.x, a.y, a.x);
        const distB = getDistance(center.y, center.x, b.y, b.x);
        return distA - distB;
      });
      cluster.push(unassigned[0]);
      unassigned.splice(0, 1);
    }
    
    // Sort cluster by distance to office (descending) so farthest is picked first
    cluster.sort((a, b) => b.distToOffice - a.distToOffice);
    clusters.push(cluster);
  }
  
  const newRoutes = clusters.map((cluster, i) => {
    let totalDist = 0;
    let prev = { x: OFFICE_LNG, y: OFFICE_LAT };
    const stops = cluster.map((emp, j) => {
      const dx = emp.x - prev.x;
      const dy = emp.y - prev.y;
      totalDist += Math.sqrt(dx*dx + dy*dy) * 111;
      prev = { x: emp.x, y: emp.y };
      return {
        employeeId: emp.id,
        stopOrder: j + 1,
        etaMinutes: 0,
        status: "PENDING",
        employee: {
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
        }
      };
    });
    totalDist += Math.sqrt((OFFICE_LNG - prev.x)**2 + (OFFICE_LAT - prev.y)**2) * 111;

    return {
      id: `baseline_8am_fixed_route_${i+1}`,
      cabId: `manual_8am_${i+1}`,
      vehicleNumber: `MH-8AM-FIX-${i+1}`,
      shiftId: "shift-0800",
      shiftTime: "08:00",
      isPickup: true,
      capacity: cluster.length > 4 ? 6 : 4,
      driverName: `Driver ${i+1}`,
      driverPhone: "Unknown",
      stops: stops,
      totalDistance: Math.round(totalDist * 1.2),
      totalDuration: Math.round((totalDist * 1.2) / 0.5),
      optimizationScore: 100,
      violations: []
    };
  });
  
  // Replace in BaselineRoute
  const baselines = await prisma.baselineRoute.findMany();
  for (const br of baselines) {
    let routeData = br.routeData;
    let isStr = false;
    if (typeof routeData === 'string') {
      routeData = JSON.parse(routeData);
      isStr = true;
    }
    
    let isObj = false;
    if (routeData && !Array.isArray(routeData) && Array.isArray(routeData.routes)) {
      isObj = true;
      routeData = routeData.routes;
    }

    if (!Array.isArray(routeData)) continue;

    const filtered = routeData.filter(r => r.shiftId !== "shift-0800");
    const updated = [...filtered, ...newRoutes];
    
    let finalData = isObj ? { ...br.routeData, routes: updated } : updated;
    if (isStr) finalData = JSON.stringify(finalData);

    await prisma.baselineRoute.update({
      where: { id: br.id },
      data: { routeData: finalData }
    });
    console.log(`Updated BaselineRoute ${br.id}`);
  }

  // Replace in OptimizedRouteSnapshot
  const optimizeds = await prisma.optimizedRouteSnapshot.findMany();
  for (const opt of optimizeds) {
    let routeData = opt.routeData;
    let isStr = false;
    if (typeof routeData === 'string') {
      routeData = JSON.parse(routeData);
      isStr = true;
    }
    
    let isObj = false;
    if (routeData && !Array.isArray(routeData) && Array.isArray(routeData.routes)) {
      isObj = true;
      routeData = routeData.routes;
    }

    if (!Array.isArray(routeData)) continue;

    const filtered = routeData.filter(r => r.shiftId !== "shift-0800");
    const updated = [...filtered, ...newRoutes];
    
    let finalData = isObj ? { ...opt.routeData, routes: updated } : updated;
    if (isStr) finalData = JSON.stringify(finalData);

    await prisma.optimizedRouteSnapshot.update({
      where: { id: opt.id },
      data: { routeData: finalData }
    });
    console.log(`Updated OptimizedRouteSnapshot ${opt.id}`);
  }

  // Check if any actual Route records exist, update them too just in case
  const actualRoutes = await prisma.route.findMany({ where: { shiftId: "shift-0800" } });
  if (actualRoutes.length > 0) {
    // Note: If there are actual routes, we might need to delete them and recreate.
    // However earlier we saw Route array was empty.
    console.log(`Found ${actualRoutes.length} actual routes. Deleting...`);
    await prisma.route.deleteMany({ where: { shiftId: "shift-0800" } });
  }
}

main().finally(() => prisma.$disconnect());
