import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

const AVG_SPEED = 0.5;

function haversineKm(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const R = 6371;
  const dLat = ((p2.y - p1.y) * Math.PI) / 180;
  const dLon = ((p2.x - p1.x) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.y * Math.PI) / 180) *
      Math.cos((p2.y * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function roadKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return haversineKm(a, b) * 1.3;
}

const DEPOT: { x: number; y: number } = { x: 79.0526, y: 21.0625 };

interface ParsedRow {
  email: string;
  address: string;
  cabKey: string;
  driverName: string;
  gender: string;
  passengerCount: number;
  pickupTime: number;
}

async function main() {
  const excelPath = path.join(process.cwd(), "roster demo.xlsx");
  console.log("Reading Excel:", excelPath);

  if (!fs.existsSync(excelPath)) {
    console.error("Excel file not found");
    process.exit(1);
  }

  const wb = XLSX.readFile(excelPath);
  const ws = wb.Sheets["Sheet1"];
  if (!ws) {
    console.error("Sheet 'Sheet1' not found");
    process.exit(1);
  }

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Collect valid rows
  const validRows: ParsedRow[] = [];
  let skippedRows = 0;

  for (const row of rows) {
    try {
      const email = row[0]?.toString()?.trim();
      const address = row[1]?.toString()?.trim();
      const cabKey = row[6]?.toString()?.trim();
      const driverName = row[9]?.toString()?.trim() || "";
      const genderRaw = row[7]?.toString()?.trim();
      const passengerCount = parseInt(row[10], 10);
      const pickupTime = typeof row[4] === "number" ? row[4] : 0;

      if (!email || email === "E mail ID") continue;
      if (!address) continue;
      if (!cabKey) continue;

      const gender = genderRaw?.toUpperCase() === "F" ? "FEMALE" : "MALE";

      validRows.push({
        email: email.toLowerCase(),
        address,
        cabKey,
        driverName,
        gender,
        passengerCount: isNaN(passengerCount) ? 4 : passengerCount,
        pickupTime,
      });
    } catch {
      skippedRows++;
    }
  }

  console.log(`Valid rows: ${validRows.length}, skipped: ${skippedRows}`);

  if (validRows.length === 0) {
    console.log("No data to process");
    process.exit(0);
  }

  // Look up employees by email in bulk
  const emails = [...new Set(validRows.map((r) => r.email))];
  const dbEmployees = await prisma.employee.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, email: true, name: true, gender: true, x: true, y: true, address: true, employeeCode: true, phone: true },
  });
  const empByEmail = new Map<string, typeof dbEmployees[0]>();
  for (const e of dbEmployees) {
    if (e.email) empByEmail.set(e.email.toLowerCase(), e);
  }

  console.log(`DB matches: ${dbEmployees.length} / ${emails.length}`);

  // Try to geocode unmatched addresses
  const geocodeCache = new Map<string, { x: number; y: number } | null>();

  async function resolveCoords(member: ParsedRow): Promise<{ x: number; y: number } | null> {
    const emp = empByEmail.get(member.email);

    if (emp && emp.x != null && emp.y != null) {
      return { x: emp.x, y: emp.y };
    }

    if (!geocodeCache.has(member.address)) {
      // Use dynamic import so the script doesn't require maps key at import time
      let result: { x: number; y: number } | null = null;
      try {
        const { geocodePlace } = await import("@/lib/optimization");
        const geo = await geocodePlace(member.address, "Nagpur", "India", DEPOT, 70);
        if (geo) result = { x: geo.x, y: geo.y };
      } catch (e) {
        console.warn(`Geocode failed for "${member.address}":`, (e as Error).message);
      }
      geocodeCache.set(member.address, result);
    }

    return geocodeCache.get(member.address) ?? null;
  }

  // Build route groups keyed by cab identifier
  const routeGroups = new Map<string, ParsedRow[]>();

  for (const row of validRows) {
    const group = routeGroups.get(row.cabKey);
    if (group) {
      group.push(row);
    } else {
      routeGroups.set(row.cabKey, [row]);
    }
  }

  // Build Route[] objects
  const routes: any[] = [];
  let routeIndex = 0;
  let skippedStops = 0;

  for (const [cabKey, members] of routeGroups) {
    members.sort((a, b) => a.pickupTime - b.pickupTime);

    const cabId = `excel-cab-${cabKey}`;
    const routeId = `excel-route-${routeIndex}`;

    const stops: any[] = [];
    let totalDuration = 0;
    let prevPoint: { x: number; y: number } | null = null;
    let totalDist = 0;
    let maxCapacity = 0;

    for (const member of members) {
      const coords = await resolveCoords(member);

      if (!coords) {
        skippedStops++;
        continue;
      }

      const emp = empByEmail.get(member.email);

      if (prevPoint) {
        const leg = roadKm(prevPoint, coords);
        totalDist += leg;
        totalDuration += leg / AVG_SPEED;
      }
      prevPoint = coords;
      maxCapacity = Math.max(maxCapacity, member.passengerCount);

      stops.push({
        employeeId: emp?.id || `excel-emp-${member.email}`,
        employee: {
          id: emp?.id || `excel-emp-${member.email}`,
          name: emp?.name || member.email.split("@")[0],
          gender: emp?.gender || member.gender,
          x: coords.x,
          y: coords.y,
          address: emp?.address || member.address,
          email: member.email,
          employeeCode: emp?.employeeCode || "",
          phone: emp?.phone || "",
          department: "",
          shiftId: "",
          status: "ACTIVE",
        },
        stopOrder: stops.length + 1,
        etaMinutes: Math.max(1, Math.round(totalDuration)),
        status: "PENDING",
        id: `excel-stop-${routeId}-${stops.length}`,
        routeId,
      });
    }

    if (stops.length === 0) continue;

    const lastStop = stops[stops.length - 1];
    const lastPt = { x: lastStop.employee.x, y: lastStop.employee.y };
    const depotLeg = roadKm(lastPt, DEPOT);
    totalDist += depotLeg;
    totalDuration += depotLeg / AVG_SPEED;

    routes.push({
      id: routeId,
      cabId,
      cab: {
        id: cabId,
        vehicleNumber: cabKey,
        capacity: maxCapacity,
        vendor: "Excel Roster",
        status: "AVAILABLE",
        driverName: members[0]?.driverName || cabKey,
        driverPhone: "",
      },
      date: new Date().toISOString().split("T")[0],
      shiftId: "excel",
      shift: { id: "excel", name: "Excel Roster", startTime: "00:00", endTime: "23:59" },
      isPickup: true,
      totalDistance: Math.round(totalDist * 10) / 10,
      totalDuration: Math.round(totalDuration),
      status: "PENDING",
      optimizationScore: 0,
      stops,
      violations: [],
      hasEscort: false,
      tripSequence: 1,
      routeNumber: routeIndex + 1,
    });

    routeIndex++;
  }

  // Write output
  const output = {
    generatedAt: new Date().toISOString(),
    totalEmployees: validRows.length,
    totalRoutes: routes.length,
    skippedRows,
    skippedStops,
    routes,
  };

  const outPath = path.join(process.cwd(), "data", "excel-routes.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten ${outPath}`);
  console.log(`Routes: ${routes.length}, Employees: ${validRows.length}, Skipped rows: ${skippedRows}, Skipped stops: ${skippedStops}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
