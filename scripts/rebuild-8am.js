const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OFFICE_LAT = 21.0625;
const OFFICE_LNG = 79.0526;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDistance(stops) {
  let total = 0;
  let prev = { lat: OFFICE_LAT, lng: OFFICE_LNG };
  for (const s of stops) {
    total += haversine(prev.lat, prev.lng, s.employee.y, s.employee.x);
    prev = { lat: s.employee.y, lng: s.employee.x };
  }
  total += haversine(prev.lat, prev.lng, OFFICE_LAT, OFFICE_LNG);
  return Math.round(total * 1.2);
}

const CAB_MAP = {
  SURAJ: { id: "13889e1c-b315-4b02-b4d1-4022e3b371e7", vehicleNumber: "MH49CW0078", capacity: 6 },
  ANIKET: { id: "25da87f0-7f02-4650-ad1e-8659c7773f6b", vehicleNumber: "MH49CW0218", capacity: 6 },
  PRASHANT: { id: "e122c294-6c20-415a-978f-593d3880986e", vehicleNumber: "MH31FC8407", capacity: 4 },
  SHREEKANT: { id: "d2cf2361-b075-434e-8605-5d9d8384d9fe", vehicleNumber: "MH49CW0876", capacity: 6 },
  ASHISH: { id: "005c1974-843c-444e-b01b-acfb308132b4", vehicleNumber: "MH49BZ0910", capacity: 4 },
};

const SHIFT_ID = "shift-0800";
const SHIFT_TIME = "08:00";

// Route definitions: [driver key, [employee names in farthest-first order]]
const ROUTE_DEFS = [
  ["SURAJ", ["Manjiri Dombale", "Girivardhan", "Shubhankar Das", "Ethel Delphine Collins"]],
  ["ANIKET", ["Shravan Meshram", "Pushpak Sakhare", "Likesh Barve", "Aryan Shende", "Vansh Rewaskar"]],
  ["PRASHANT", ["Ayush Thakre", "Krunal Wath", "Deepak singh kushwah", "Prashanth Pathlavath"]],
  ["SHREEKANT", ["Shreya karale", "Azad Bhasme", "Yash karambe", "Sayata Chakraborty"]],
  ["ASHISH", ["Geeta Rajput", "Prachi Jain", "Sejal Shahare"]],
];

async function main() {
  console.log("Fetching 8:00 AM employees from DB...");
  const allEmps = await prisma.employee.findMany({ where: { shiftId: SHIFT_ID } });
  const empMap = new Map(allEmps.map(e => [e.name.toLowerCase().trim(), e]));

  // Verify all employees exist
  for (const [, names] of ROUTE_DEFS) {
    for (const name of names) {
      const key = name.toLowerCase().trim();
      if (!empMap.has(key)) {
        console.error(`ERROR: Employee "${name}" not found in DB for 8:00 AM shift!`);
        process.exit(1);
      }
    }
  }
  console.log(`  Found ${allEmps.length} employees, all route names match.`);

  // Build new 8:00 AM routes
  const newRoutes = ROUTE_DEFS.map(([driverKey, empNames], idx) => {
    const cab = CAB_MAP[driverKey];

    const stops = empNames.map((name, stopIdx) => {
      const emp = empMap.get(name.toLowerCase().trim());
      return {
        employeeId: emp.id,
        stopOrder: stopIdx + 1,
        etaMinutes: 0,
        status: "PENDING",
        employee: {
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
        },
      };
    });

    const totalDist = estimateDistance(stops);
    return {
      id: `baseline_8am_rebuilt_route_${idx + 1}`,
      cabId: cab.id,
      vehicleNumber: cab.vehicleNumber,
      shiftId: SHIFT_ID,
      shiftTime: SHIFT_TIME,
      isPickup: true,
      capacity: stops.length > 4 ? 6 : 4,
      driverName: driverKey.charAt(0).toUpperCase() + driverKey.slice(1).toLowerCase(),
      driverPhone: "Unknown",
      stops,
      totalDistance: totalDist,
      totalDuration: Math.round(totalDist / 0.5),
      optimizationScore: 100,
      violations: [],
    };
  });

  // Log the new routes
  console.log("\n=== NEW 8:00 AM ROUTES ===");
  for (const r of newRoutes) {
    console.log(`\n${r.driverName} (${r.vehicleNumber}) — ${r.stops.length} employees, ${r.totalDistance}km, ${r.totalDuration}min`);
    for (const s of r.stops) {
      const e = s.employee;
      console.log(`  ${s.stopOrder}. ${e.name}  (${e.x.toFixed(4)}, ${e.y.toFixed(4)})`);
    }
  }

  // Update BaselineRoute records
  console.log("\n\nUpdating BaselineRoute records...");
  const baselines = await prisma.baselineRoute.findMany();
  for (const br of baselines) {
    let routeData = br.routeData;
    if (typeof routeData === 'string') routeData = JSON.parse(routeData);

    // Handle both array and { routes: [...] } shapes
    let routesArr = routeData;
    let isObj = false;
    if (!Array.isArray(routeData) && Array.isArray(routeData?.routes)) {
      routesArr = routeData.routes;
      isObj = true;
    }
    if (!Array.isArray(routesArr)) continue;

    // Filter out old 8:00 AM routes and add new ones
    const filtered = routesArr.filter(r => r.shiftId !== SHIFT_ID);
    const updated = [...filtered, ...newRoutes];
    const finalData = isObj ? { ...routeData, routes: updated } : updated;

    await prisma.baselineRoute.update({
      where: { id: br.id },
      data: { routeData: finalData },
    });
    console.log(`  Updated BaselineRoute ${br.id}`);
  }

  // Update OptimizedRouteSnapshot records
  console.log("\nUpdating OptimizedRouteSnapshot records...");
  const optimizeds = await prisma.optimizedRouteSnapshot.findMany();
  for (const opt of optimizeds) {
    let routeData = opt.routeData;
    if (typeof routeData === 'string') routeData = JSON.parse(routeData);

    let routesArr = routeData;
    let isObj = false;
    if (!Array.isArray(routeData) && Array.isArray(routeData?.routes)) {
      routesArr = routeData.routes;
      isObj = true;
    }
    if (!Array.isArray(routesArr)) continue;

    const filtered = routesArr.filter(r => r.shiftId !== SHIFT_ID);
    const updated = [...filtered, ...newRoutes];
    const finalData = isObj ? { ...routeData, routes: updated } : updated;

    await prisma.optimizedRouteSnapshot.update({
      where: { id: opt.id },
      data: { routeData: finalData },
    });
    console.log(`  Updated OptimizedRouteSnapshot ${opt.id}`);
  }

  // Delete live Route records for 8:00 AM (they're stale)
  console.log("\nCleaning up live Route records for 8:00 AM...");
  const liveRoutes = await prisma.route.findMany({ where: { shiftId: SHIFT_ID } });
  if (liveRoutes.length > 0) {
    await prisma.route.deleteMany({ where: { shiftId: SHIFT_ID } });
    console.log(`  Deleted ${liveRoutes.length} stale Route records`);
  } else {
    console.log("  No live Route records found.");
  }

  console.log("\n✓ 8:00 AM rebuild complete!");
}

main().finally(() => prisma.$disconnect());
