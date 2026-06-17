const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // Check Deepak's current route stop
  const stops = await p.routeStop.findMany({
    where: { employee: { name: { contains: "Deepak", mode: "insensitive" } } },
    include: {
      route: { include: { cab: true, shift: true } },
      employee: true
    }
  });

  console.log("=== Deepak's route stops in DB ===");
  for (const s of stops) {
    console.log(`  Employee: ${s.employee.name}`);
    console.log(`  Stop order: ${s.stopOrder}`);
    console.log(`  Route date: ${s.route.date}`);
    console.log(`  Route shift: ${s.route.shift?.startTime}`);
    console.log(`  Cab: ${s.route.cab?.vehicleNumber} (${s.route.cab?.driverName})`);
    console.log();
  }

  // Check all routes for date 2026-06-16 with their cabs and stop counts
  const routes = await p.route.findMany({
    where: { date: "2026-06-16" },
    include: {
      cab: true,
      shift: true,
      stops: { include: { employee: true }, orderBy: { stopOrder: "asc" } }
    },
    orderBy: { routeNumber: "asc" }
  });

  console.log("=== All routes for 2026-06-16 ===");
  for (const r of routes) {
    const empNames = r.stops.map(s => s.employee?.name || "?").join(", ");
    console.log(`  Route #${r.routeNumber} | ${r.cab?.vehicleNumber} (${r.cab?.driverName}) | ${r.shift?.startTime} | ${r.stops.length} stops`);
    console.log(`    Employees: ${empNames}`);
  }
}

main().catch(console.error).finally(() => p.$disconnect());
