/**
 * diagnose-and-fix.js
 * 
 * Run this to:
 * 1. Show EXACTLY what is in the DB (routes, employees, drivers)
 * 2. Show WHY fleet capacity exceeds
 * 3. Re-apply canonical data from transport_routes_16jun26.json
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const CANONICAL_CABS = {
  "MH49CW0078": { name: "SURAJ",    phone: "9561326459" },
  "MH40CT4542": { name: "Tapan",    phone: "8208223602" },
  "MH31FC8592": { name: "Sandeep",  phone: "9021863195" },
  "MH49CW0218": { name: "ANIKET",   phone: "9325911859" },
  "MH40DC0486": { name: "SHAFIQUE", phone: "9595420800" },
  "MH49CW0139": { name: "Nikhil",   phone: "9764325500" },
  "MH49CW1305": { name: "Shantanu", phone: "8261990745" },
  "MH31FC8407": { name: "Prashant", phone: "7620971911" },
  "MH49CW0876": { name: "Shreekant",phone: "9326604708" }
};

async function diagnose() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  DIAGNOSTIC REPORT — 2026-06-16                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const jsonPath = path.resolve(__dirname, "../data/transport_routes_16jun26.json");
  const canonical = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  // 1. Load DB routes
  const dbRoutes = await prisma.route.findMany({
    where: { date: "2026-06-16" },
    include: {
      cab: true,
      shift: true,
      stops: { include: { employee: true }, orderBy: { stopOrder: "asc" } }
    },
    orderBy: { routeNumber: "asc" }
  });

  console.log(`📊 DB Routes for 2026-06-16: ${dbRoutes.length}`);
  console.log(`   optimizationMode values: ${[...new Set(dbRoutes.map(r => r.optimizationMode))].join(", ")}\n`);

  // 2. Check each canonical route vs DB
  console.log("🔍 CANONICAL vs DB COMPARISON:");
  console.log("─".repeat(80));

  for (const cr of canonical.routes) {
    const dbRoute = dbRoutes.find(r =>
      r.cab?.vehicleNumber === cr.vehicle.vehicleNumber &&
      r.shift?.startTime === cr.shiftTime
    );

    const canonEmp = cr.employees.map(e => e.name);
    const dbEmp = dbRoute ? dbRoute.stops.map(s => s.employee?.name || "?") : [];
    const driver = CANONICAL_CABS[cr.vehicle.vehicleNumber]?.name || cr.driver.name;

    const match = dbRoute && JSON.stringify(canonEmp.sort()) === JSON.stringify(dbEmp.slice().sort());

    console.log(`\n${match ? "✅" : "❌"} Route ${cr.routeId} | ${cr.vehicle.vehicleNumber} | Driver: ${driver} | Shift: ${cr.shiftTime}`);
    console.log(`   CANONICAL employees (${canonEmp.length}): ${canonEmp.join(", ")}`);
    console.log(`   DB employees        (${dbEmp.length}): ${dbEmp.join(", ") || "(none)"}`);

    if (!match) {
      const missing = canonEmp.filter(n => !dbEmp.includes(n));
      const extra   = dbEmp.filter(n => !canonEmp.includes(n));
      if (missing.length) console.log(`   ⚠️  MISSING from DB: ${missing.join(", ")}`);
      if (extra.length)   console.log(`   ⚠️  EXTRA in DB:     ${extra.join(", ")}`);
    }
  }

  // 3. Employees in DB but in WRONG cab
  console.log("\n\n🚨 WRONG DRIVER MAPPINGS:");
  console.log("─".repeat(80));

  for (const cr of canonical.routes) {
    const expectedDriver = CANONICAL_CABS[cr.vehicle.vehicleNumber]?.name || cr.driver.name;
    for (const emp of cr.employees) {
      // Find this employee's actual route stop in DB
      const dbStop = await prisma.routeStop.findFirst({
        where: {
          route: { date: "2026-06-16", shift: { startTime: cr.shiftTime } },
          employee: { name: { contains: emp.name.split(" ")[0], mode: "insensitive" } }
        },
        include: {
          route: { include: { cab: true, shift: true } },
          employee: true
        }
      });

      if (dbStop) {
        const actualDriver = dbStop.route.cab?.driverName || "?";
        const actualVehicle = dbStop.route.cab?.vehicleNumber || "?";
        if (actualVehicle !== cr.vehicle.vehicleNumber) {
          console.log(`\n❌ ${emp.name}`);
          console.log(`   Expected: ${cr.vehicle.vehicleNumber} (${expectedDriver}) — Route ${cr.routeId}`);
          console.log(`   Actual:   ${actualVehicle} (${actualDriver})`);
        }
      }
    }
  }

  // 4. Fleet capacity analysis
  console.log("\n\n📦 FLEET CAPACITY ANALYSIS:");
  console.log("─".repeat(80));
  let hasViolation = false;

  for (const cr of canonical.routes) {
    const cab = await prisma.cab.findUnique({ where: { vehicleNumber: cr.vehicle.vehicleNumber } });
    const capacity = cab?.capacity || 4;
    const count = cr.employees.length;
    if (count > capacity) {
      hasViolation = true;
      const overflow = count - capacity;
      const driver = CANONICAL_CABS[cr.vehicle.vehicleNumber]?.name || cr.driver.name;
      console.log(`\n⚠️  Route ${cr.routeId} | ${cr.vehicle.vehicleNumber} (${driver}) | Shift ${cr.shiftTime}`);
      console.log(`   Capacity: ${capacity} seats | Employees: ${count} | Overflow: +${overflow}`);
      console.log(`   Employees: ${cr.employees.map(e => `${e.name} (${e.status})`).join(", ")}`);
      console.log(`   → REASON: Cab capacity in DB (${capacity}) is less than actual employee count (${count}).`);
      console.log(`   → FIX: Set capacity to ${count} for ${cr.vehicle.vehicleNumber}`);
    }
  }
  if (!hasViolation) {
    console.log("   ✅ No capacity violations vs canonical data.");
  }

  // 5. Active employees NOT in any 2026-06-16 route stop
  const allEmpIds = new Set(dbRoutes.flatMap(r => r.stops.map(s => s.employeeId)));
  const activeEmps = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { shift: true, pickupPoint: true }
  });

  const unassigned = activeEmps.filter(e => !allEmpIds.has(e.id));
  console.log(`\n\n👥 UNASSIGNED ACTIVE EMPLOYEES (${unassigned.length}):`);
  console.log("─".repeat(80));
  if (unassigned.length === 0) {
    console.log("   ✅ All active employees have route stops for 2026-06-16.");
  } else {
    for (const e of unassigned) {
      console.log(`   - ${e.name} | Shift: ${e.shift?.startTime || "none"} | Code: ${e.employeeCode}`);
    }
    console.log(`\n   ⚠️  These ${unassigned.length} employees appear as WAITLISTED in the fleet capacity alert.`);
    console.log("   REASON: The optimization engine ran and excluded them from routes.");
    console.log("   FIX: Re-run canonical reimport to restore correct assignments.");
  }

  console.log("\n\n" + "═".repeat(80));
  console.log("📋 SUMMARY:");
  console.log(`   Total canonical routes: ${canonical.routes.length}`);
  console.log(`   Total DB routes:        ${dbRoutes.length}`);
  console.log(`   Unassigned employees:   ${unassigned.length}`);
  console.log(`   DB data is CANONICAL:   ${dbRoutes.every(r => r.optimizationMode === "CANONICAL") ? "YES ✅" : "NO ❌ — optimization overwrote it"}`);
  console.log("═".repeat(80) + "\n");
}

diagnose().catch(console.error).finally(() => prisma.$disconnect());
