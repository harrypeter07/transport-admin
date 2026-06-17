import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parseExcelBufferToRoutes, haversineKm } from "../src/lib/excelParser";
import { geocodePlace, makeDepot } from "../src/lib/optimization";

const prisma = new PrismaClient();

async function main() {
  console.log("=== REPARSING BASELINE ROUTES FOR 2026-06-12 ===");

  // 1. Fetch references
  const dbEmployees = await prisma.employee.findMany({ where: { status: "ACTIVE" } });
  const dbShifts = await prisma.shift.findMany();
  const settings = await prisma.systemSettings.findFirst();

  // Print Deepak and Yash details in DB
  const deepak = dbEmployees.find(e => e.name.toLowerCase().includes("deepak"));
  const yash = dbEmployees.find(e => e.name.toLowerCase().includes("yash karambe"));

  console.log("Deepak in DB:", deepak ? { name: deepak.name, code: deepak.employeeCode } : "NOT FOUND");
  console.log("Yash in DB:", yash ? { name: yash.name, code: yash.employeeCode } : "NOT FOUND");

  const depotLat = settings?.defaultDepotLat ?? 21.0625;
  const depotLng = settings?.defaultDepotLng ?? 79.0526;
  const depot = makeDepot(depotLat, depotLng);

  // Read excel file
  const filePath = path.join(process.cwd(), "data", "uploads", "upload_1781628810814_i4palxr.xlsx");
  if (!fs.existsSync(filePath)) {
    console.error("Upload file not found at:", filePath);
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const sheetName = "Routes and Driver details ";

  // Call the excelParser
  const { routes: parsedRoutes, summary } = await parseExcelBufferToRoutes(
    buffer,
    dbEmployees,
    dbShifts,
    depotLat,
    depotLng,
    async (data) => {
      const existing = await prisma.shift.findFirst({
        where: { startTime: data.startTime },
      });
      if (existing) return existing;
      return prisma.shift.create({ data });
    },
    { sheetName }
  );

  console.log("Excel parsing complete. Summary:", summary);

  // Check geocoding & rebuild routes
  const geocodeCache = new Map<string, { x: number; y: number } | null>();
  const baselineRoutes = [];

  for (const route of parsedRoutes) {
    const stops = [];
    for (const stop of route.stops) {
      const emp = stop.employee;
      if (Math.abs(emp.x) < 0.01 && Math.abs(emp.y) < 0.01) {
        let coords = geocodeCache.get(emp.address);
        if (coords === undefined) {
          try {
            const result = await geocodePlace(emp.address, "Nagpur", "India", depot, 70);
            coords = result ? { x: result.x, y: result.y } : null;
          } catch (err) {
            coords = null;
          }
          geocodeCache.set(emp.address, coords);
        }
        if (coords) {
          emp.x = coords.x;
          emp.y = coords.y;
          stop.employee.x = coords.x;
          stop.employee.y = coords.y;
        } else {
          emp.x = depotLng;
          emp.y = depotLat;
          stop.employee.x = depotLng;
          stop.employee.y = depotLat;
        }
      }
      stops.push(stop);
    }
    baselineRoutes.push({ ...route, stops });
  }

  // Recompute totalDistance and totalDuration
  for (const route of baselineRoutes) {
    let cumDist = 0;
    let prevPt = depot;
    for (const stop of route.stops) {
      const pt = { x: stop.employee.x, y: stop.employee.y };
      const leg = haversineKm(prevPt, pt);
      cumDist += leg;
      prevPt = pt;
    }
    const depotLeg = haversineKm(prevPt, depot);
    cumDist += depotLeg;

    route.totalDistance = Math.round(cumDist * 10) / 10;
    route.totalDuration = Math.round(cumDist / 0.5);
  }

  // Print mapped details for Deepak and Yash
  console.log("\n--- VERIFYING EMPLOYEE MAPPINGS IN GENERATED ROUTES ---");
  let deepakMappedCount = 0;
  let yashMappedCount = 0;

  for (const r of baselineRoutes) {
    for (const s of r.stops) {
      if (s.employee.name.toLowerCase().includes("deepak")) {
        deepakMappedCount++;
        console.log(`Deepak is mapped to Route: ${r.routeNo}, Shift: ${r.shiftTime}, Pickup Point: ${s.pickupPoint || s.employee.address}`);
      }
      if (s.employee.name.toLowerCase().includes("yash karambe")) {
        yashMappedCount++;
        console.log(`Yash Karambe is mapped to Route: ${r.routeNo}, Shift: ${r.shiftTime}, Pickup Point: ${s.pickupPoint || s.employee.address}`);
      }
    }
  }
  console.log(`Verification: Deepak mapped ${deepakMappedCount} times, Yash Karambe mapped ${yashMappedCount} times.`);

  // Safety violations & underfilled calculations
  const safetyViolations: string[] = [];
  const underfilled: any[] = [];
  for (const r of baselineRoutes) {
    const activeStops = r.stops.filter((s) => s.status !== "SKIPPED");
    if (activeStops.length === 0) continue;
    if (activeStops.length < 3) {
      underfilled.push({ route: r.routeNo, count: activeStops.length });
    }
    if (!r.hasEscort) {
      const females = activeStops.filter((s) => s.employee.gender === "FEMALE");
      if (females.length > 0) {
        const isSoleFemale = activeStops.length === 1 && activeStops[0].employee.gender === "FEMALE";
        const allFemale = activeStops.every((s) => s.employee.gender === "FEMALE");
        const isFemaleFirst = activeStops[0].employee.gender === "FEMALE" && !allFemale;
        const isFemaleLast = activeStops[activeStops.length - 1].employee.gender === "FEMALE" && !allFemale;
        if (isSoleFemale || (r.isPickup && isFemaleFirst) || (!r.isPickup && isFemaleLast)) {
          safetyViolations.push(r.routeNo);
        }
      }
    }
  }

  const finalSummary = {
    source: "MANUAL_EXCEL",
    sheetName,
    date: "2026-06-12",
    routeCount: baselineRoutes.length,
    cabsUsed: baselineRoutes.length,
    presentCount: summary.employeeCount,
    presentUniqueCount: summary.employeeCount,
    absentCount: summary.noShowCount,
    noShowCount: summary.noShowCount,
    safetyViolations,
    underfilled,
    absentEmployeeCodes: summary.absentEmployeeCodes || [],
    unmatchedEmployeeCodes: summary.unmatchedEmployeeCodes || [],
  };

  // Persist to DB
  await prisma.baselineRoute.deleteMany({ where: { date: "2026-06-12" } });
  await prisma.baselineRoute.create({
    data: {
      snapshotId: `baseline_parsed_${Date.now()}`,
      date: "2026-06-12",
      routeData: JSON.stringify(baselineRoutes),
      statistics: JSON.stringify(finalSummary),
    },
  });

  console.log("Successfully persisted updated baseline routes for 2026-06-12 to database!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
