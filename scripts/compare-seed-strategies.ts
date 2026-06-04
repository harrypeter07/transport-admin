import { PrismaClient } from "@prisma/client";
import {
  optimizeRoutes,
  makeDepot,
  defaultConstraints,
  OptimizeEmployee,
  OptimizeCab,
  Point,
  OptimizedRoute,
} from "@/lib/optimization";

const prisma = new PrismaClient();

interface DayResult {
  date: string;
  shiftId: string;
  depot: {
    totalDeadhead: number;
    totalDistance: number;
    totalDuration: number;
    routeCount: number;
    employeesCovered: number;
    violations: number;
    warnings: number;
    utilizations: number[];
    allDeadheads: number[];
  };
  driver: {
    totalDeadhead: number;
    totalDistance: number;
    totalDuration: number;
    routeCount: number;
    employeesCovered: number;
    violations: number;
    warnings: number;
    utilizations: number[];
    allDeadheads: number[];
  };
}

function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.y - a.y) * Math.PI) / 180;
  const dLng = ((b.x - a.x) * Math.PI) / 180;
  const lat1 = (a.y * Math.PI) / 180;
  const lat2 = (b.y * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function computeDeadhead(route: OptimizedRoute): number {
  if (route.stops.length === 0) return 0;
  const start = route.startPoint;
  const first = route.stops[0];
  if (!start) return 0;
  return haversineKm(start, { x: first.x, y: first.y });
}

async function runStrategy(
  employees: OptimizeEmployee[],
  cabs: OptimizeCab[],
  isPickup: boolean,
  apiKey: string,
  depot: Point,
  seedStrategy: string
): Promise<{
  routes: OptimizedRoute[];
  totalDeadhead: number;
  allDeadheads: number[];
  utilizations: number[];
}> {
  process.env.SEED_STRATEGY = seedStrategy;
  const result = await optimizeRoutes(employees, cabs, isPickup, apiKey, "FASTEST_TRAVEL", depot, defaultConstraints());

  let totalDeadhead = 0;
  const allDeadheads: number[] = [];
  const utilizations: number[] = [];

  for (const route of result.routes) {
    const dh = computeDeadhead(route);
    totalDeadhead += dh;
    allDeadheads.push(Math.round(dh * 10) / 10);
    utilizations.push(route.stops.length);
  }

  return { routes: result.routes, totalDeadhead, allDeadheads, utilizations };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmt(n: number): string {
  return Math.round(n * 100) / 100 + "";
}

async function main() {
  console.log("=== Seed Strategy Comparison ===\n");

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);

  // Get all unique (date, shiftId) pairs from historical routes
  const routeDates = await prisma.route.findMany({
    select: { date: true, shiftId: true },
    distinct: ["date", "shiftId"],
    orderBy: [{ date: "asc" }, { shiftId: "asc" }],
  });

  const allResults: DayResult[] = [];
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";

  for (const { date, shiftId } of routeDates) {
    console.log(`\n📅 ${date} | shift: ${shiftId}`);
    console.log("─".repeat(50));

    // Fetch employees (same logic as fetchOptimizationInputs)
    const dbEmployees = await prisma.employee.findMany({
      where: { status: "ACTIVE", shiftId },
      include: {
        user: {
          include: {
            leaves: {
              where: {
                status: "APPROVED",
                startDate: { lte: date },
                endDate: { gte: date },
              },
            },
          },
        },
      },
    });

    const availableEmployees = dbEmployees.filter(
      (emp) => (emp.user?.leaves || []).length === 0
    );

    if (availableEmployees.length === 0) {
      console.log("  ⏭ No active employees — skip");
      continue;
    }

    const optEmployees: OptimizeEmployee[] = availableEmployees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      gender: emp.gender as "MALE" | "FEMALE",
      x: emp.x,
      y: emp.y,
      address: emp.address,
      department: emp.department,
      phone: emp.phone,
    }));

    // Fetch cabs (same logic as fetchOptimizationInputs)
    const dbCabs = await prisma.cab.findMany({
      where: { status: "AVAILABLE", shifts: { some: { id: shiftId } } },
    });

    if (dbCabs.length === 0) {
      console.log("  ⏭ No available cabs — skip");
      continue;
    }

    const optCabs: OptimizeCab[] = dbCabs.map((cab) => ({
      id: cab.id,
      vehicleNumber: cab.vehicleNumber,
      capacity: cab.capacity,
      vendor: cab.vendor,
      driverName: cab.driverName || "Unassigned",
      driverPhone: cab.driverPhone || "N/A",
      // DB convention: x=lng, y=lat (consistent with optimization engine's getDistance)
      startPoint:
        cab.driverX != null && cab.driverY != null
          ? { x: cab.driverX, y: cab.driverY }
          : undefined,
    }));

    const isPickup = true;
    const employeesCount = optEmployees.length;
    const cabsCount = optCabs.length;
    const totalCapacity = optCabs.reduce((s, c) => s + c.capacity, 0);

    console.log(`  Employees: ${employeesCount} | Cabs: ${cabsCount} (capacity: ${totalCapacity})`);

    // Run depot strategy
    console.log("  Running depot strategy...");
    const depotResult = await runStrategy(optEmployees, optCabs, isPickup, apiKey, depot, "depot");

    // Run driver strategy
    console.log("  Running driver strategy...");
    const driverResult = await runStrategy(optEmployees, optCabs, isPickup, apiKey, depot, "driver");

    // Store results
    allResults.push({
      date,
      shiftId,
      depot: {
        totalDeadhead: depotResult.totalDeadhead,
        totalDistance: depotResult.routes.reduce((s, r) => s + r.totalDistance, 0),
        totalDuration: depotResult.routes.reduce((s, r) => s + r.totalDuration, 0),
        routeCount: depotResult.routes.length,
        employeesCovered: driverResult.routes.reduce((s, r) => s + r.stops.length, 0),
        violations: depotResult.routes.reduce((s, r) => s + r.violations.length, 0),
        warnings: 0,
        utilizations: depotResult.utilizations,
        allDeadheads: depotResult.allDeadheads,
      },
      driver: {
        totalDeadhead: driverResult.totalDeadhead,
        totalDistance: driverResult.routes.reduce((s, r) => s + r.totalDistance, 0),
        totalDuration: driverResult.routes.reduce((s, r) => s + r.totalDuration, 0),
        routeCount: driverResult.routes.length,
        employeesCovered: driverResult.routes.reduce((s, r) => s + r.stops.length, 0),
        violations: driverResult.routes.reduce((s, r) => s + r.violations.length, 0),
        warnings: 0,
        utilizations: driverResult.utilizations,
        allDeadheads: driverResult.allDeadheads,
      },
    });

    // Print day summary
    const dhDepot = Math.round(depotResult.totalDeadhead * 10) / 10;
    const dhDriver = Math.round(driverResult.totalDeadhead * 10) / 10;
    const dhPct =
      dhDepot > 0
        ? ((dhDepot - dhDriver) / dhDepot * 100).toFixed(1)
        : "N/A";
    console.log(`  ✅ Depot:  ${depotResult.routes.length} routes | ${dhDepot} km deadhead`);
    console.log(`  ✅ Driver: ${driverResult.routes.length} routes | ${dhDriver} km deadhead (Δ ${dhPct}%)`);
  }

  // === AGGREGATE ALL RESULTS ===
  console.log("\n\n" + "=".repeat(70));
  console.log("  FINAL COMPARISON — ALL SHIFTS COMBINED");
  console.log("=".repeat(70));

  const aggDepot = {
    totalDeadhead: 0,
    totalDistance: 0,
    totalDuration: 0,
    routeCount: 0,
    employeesCovered: 0,
    violations: 0,
    warnings: 0,
    allDeadheads: [] as number[],
    allUtilizations: [] as number[],
  };
  const aggDriver = {
    totalDeadhead: 0,
    totalDistance: 0,
    totalDuration: 0,
    routeCount: 0,
    employeesCovered: 0,
    violations: 0,
    warnings: 0,
    allDeadheads: [] as number[],
    allUtilizations: [] as number[],
  };

  for (const r of allResults) {
    aggDepot.totalDeadhead += r.depot.totalDeadhead;
    aggDepot.totalDistance += r.depot.totalDistance;
    aggDepot.totalDuration += r.depot.totalDuration;
    aggDepot.routeCount += r.depot.routeCount;
    aggDepot.employeesCovered += r.depot.employeesCovered;
    aggDepot.violations += r.depot.violations;
    aggDepot.allDeadheads.push(...r.depot.allDeadheads);
    aggDepot.allUtilizations.push(...r.depot.utilizations);

    aggDriver.totalDeadhead += r.driver.totalDeadhead;
    aggDriver.totalDistance += r.driver.totalDistance;
    aggDriver.totalDuration += r.driver.totalDuration;
    aggDriver.routeCount += r.driver.routeCount;
    aggDriver.employeesCovered += r.driver.employeesCovered;
    aggDriver.violations += r.driver.violations;
    aggDriver.allDeadheads.push(...r.driver.allDeadheads);
    aggDriver.allUtilizations.push(...r.driver.utilizations);
  }

  const avgDH = (n: number, c: number) => (c > 0 ? n / c : 0);

  const dAvgDeadhead = avgDH(aggDepot.totalDeadhead, aggDepot.routeCount);
  const rAvgDeadhead = avgDH(aggDriver.totalDeadhead, aggDriver.routeCount);

  const dAvgUtil = aggDepot.allUtilizations.length > 0
    ? aggDepot.allUtilizations.reduce((a, b) => a + b, 0) / aggDepot.allUtilizations.length
    : 0;
  const rAvgUtil = aggDriver.allUtilizations.length > 0
    ? aggDriver.allUtilizations.reduce((a, b) => a + b, 0) / aggDriver.allUtilizations.length
    : 0;

  const dhReduction =
    aggDepot.totalDeadhead > 0
      ? ((aggDepot.totalDeadhead - aggDriver.totalDeadhead) / aggDepot.totalDeadhead) * 100
      : 0;
  const distReduction =
    aggDepot.totalDistance > 0
      ? ((aggDepot.totalDistance - aggDriver.totalDistance) / aggDepot.totalDistance) * 100
      : 0;

  console.log("\n  ┌────────────────────────────┬───────────┬───────────┬──────────┐");
  console.log("  │ Metric                     │ Depot     │ Driver    │ Δ %      │");
  console.log("  ├────────────────────────────┼───────────┼───────────┼──────────┤");
  console.log(
    `  │ Total deadhead (km)        │ ${fmt(aggDepot.totalDeadhead).padStart(7)}  │ ${fmt(aggDriver.totalDeadhead).padStart(7)}  │ ${dhReduction.toFixed(1).padStart(5)}%   │`
  );
  console.log(
    `  │ Avg deadhead per route (km)│ ${fmt(dAvgDeadhead).padStart(7)}  │ ${fmt(rAvgDeadhead).padStart(7)}  │         │`
  );
  console.log(
    `  │ Median deadhead (km)       │ ${fmt(median(aggDepot.allDeadheads)).padStart(7)}  │ ${fmt(median(aggDriver.allDeadheads)).padStart(7)}  │         │`
  );
  console.log(
    `  │ Total distance (km)        │ ${fmt(aggDepot.totalDistance).padStart(7)}  │ ${fmt(aggDriver.totalDistance).padStart(7)}  │ ${distReduction.toFixed(1).padStart(5)}%   │`
  );
  console.log(
    `  │ Total duration (min)       │ ${fmt(aggDepot.totalDuration).padStart(7)}  │ ${fmt(aggDriver.totalDuration).padStart(7)}  │         │`
  );
  console.log(
    `  │ Routes                     │ ${aggDepot.routeCount.toString().padStart(7)}  │ ${aggDriver.routeCount.toString().padStart(7)}  │         │`
  );
  console.log(
    `  │ Employees covered          │ ${aggDepot.employeesCovered.toString().padStart(7)}  │ ${aggDriver.employeesCovered.toString().padStart(7)}  │         │`
  );
  console.log(
    `  │ Avg cab utilization        │ ${dAvgUtil.toFixed(2).padStart(7)}  │ ${rAvgUtil.toFixed(2).padStart(7)}  │         │`
  );
  console.log(
    `  │ Safety violations          │ ${aggDepot.violations.toString().padStart(7)}  │ ${aggDriver.violations.toString().padStart(7)}  │         │`
  );
  console.log("  └────────────────────────────┴───────────┴───────────┴──────────┘");

  // Acceptance criteria check
  console.log("\n\n  📋 ACCEPTANCE CRITERIA");
  console.log("  " + "─".repeat(55));

  const checks = [
    {
      name: "Deadhead reduction > 20%",
      pass: dhReduction > 20,
      actual: `${dhReduction.toFixed(1)}%`,
      threshold: "> 20%",
    },
    {
      name: "Fleet distance reduction > 5%",
      pass: distReduction > 5,
      actual: `${distReduction.toFixed(1)}%`,
      threshold: "> 5%",
    },
    {
      name: "Safety violations (0 increase)",
      pass: aggDriver.violations <= aggDepot.violations,
      actual: `${aggDepot.violations} → ${aggDriver.violations}`,
      threshold: "≤ baseline",
    },
    {
      name: "Cab utilization (no reduction)",
      pass: rAvgUtil >= dAvgUtil - 0.01,
      actual: `${dAvgUtil.toFixed(2)} → ${rAvgUtil.toFixed(2)}`,
      threshold: "≥ baseline",
    },
  ];

  let allPass = true;
  for (const check of checks) {
    const status = check.pass ? "✅ PASS" : "❌ FAIL";
    if (!check.pass) allPass = false;
    console.log(`  ${status} | ${check.name}`);
    console.log(`       Actual: ${check.actual}  |  Threshold: ${check.threshold}`);
  }

  // RECOMMENDATION
  console.log("\n\n  📋 RECOMMENDATION");
  console.log("  " + "─".repeat(55));
  if (allPass) {
    console.log("  ✅ All criteria met — SWITCH TO SEED_STRATEGY=driver");
    console.log("\n     Summary: Driver-aware seeding reduces deadhead by " + dhReduction.toFixed(1) + "%");
    console.log("     and fleet distance by " + distReduction.toFixed(1) + "% without regressions.");
    console.log("\n     Next: Change default to `driver`, monitor for 1 week, then remove flag.");
  } else {
    console.log("  ❌ Criteria not fully met — KEEP SEED_STRATEGY=depot (current default)");
    console.log("\n     The driver strategy did not meet all acceptance thresholds.");
    console.log("     Deadhead reduction: " + dhReduction.toFixed(1) + "% (need > 20%)");
    console.log("     Fleet distance reduction: " + distReduction.toFixed(1) + "% (need > 5%)");
  }

  await prisma.$disconnect();
}

main();
