/**
 * Seed employees, shifts, and cabs from Excel roster or excel_routes.json fallback.
 * Run: npx ts-node --transpile-only scripts/seed-from-excel.ts [--sheet 2026-06-01]
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { assignZone } from "../src/lib/zones";

const prisma = new PrismaClient();

const ROSTER_PATH_1 = path.join(process.cwd(), "data", "test-roasters", "GTPL Cab Sheet June 26  (2).xlsx");
const ROSTER_PATH_2 = path.join(process.cwd(), "data", "test-rosters", "roster.xlsx");
const ROSTER_PATH = fs.existsSync(ROSTER_PATH_1) ? ROSTER_PATH_1 : ROSTER_PATH_2;
const JSON_PATH = path.join(process.cwd(), "data", "excel_routes.json");

type SeedEmployee = {
  employeeCode: string;
  name: string;
  gender: "MALE" | "FEMALE";
  email: string;
  phone: string;
  address: string;
  x: number;
  y: number;
  shiftStartTime: string;
  pickupPoint?: string;
};

type SeedCab = {
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  capacity: number;
  shiftStartTime: string;
};

function normalizeGender(g: string): "MALE" | "FEMALE" {
  return g.toUpperCase().startsWith("F") ? "FEMALE" : "MALE";
}

function extractFromJson(): { employees: SeedEmployee[]; cabs: SeedCab[] } {
  const routes = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
  const empMap = new Map<string, SeedEmployee>();
  const cabMap = new Map<string, SeedCab>();

  for (const route of routes) {
    const shiftStartTime = route.shift?.startTime || "05:00";
    const vehicle = route.cab?.vehicleNumber || "UNKNOWN";
    if (!cabMap.has(vehicle)) {
      cabMap.set(vehicle, {
        vehicleNumber: vehicle,
        driverName: route.cab?.driverName || "Driver",
        driverPhone: route.cab?.driverPhone || "9999999999",
        capacity: route.cab?.capacity || 6,
        shiftStartTime,
      });
    }

    for (const stop of route.stops || []) {
      const e = stop.employee;
      if (!e) continue;
      const code = e.employeeCode || e.name.replace(/\s+/g, "-").toUpperCase();
      if (empMap.has(code)) continue;
      empMap.set(code, {
        employeeCode: code,
        name: e.name,
        gender: normalizeGender(e.gender || "MALE"),
        email: e.email || `${code.toLowerCase().replace(/[^a-z0-9]/g, ".")}@globallogic.com`,
        phone: e.phone || "9999999999",
        address: e.address || "Nagpur, Maharashtra",
        x: e.x ?? 79.05,
        y: e.y ?? 21.06,
        shiftStartTime,
      });
    }
  }

  return { employees: [...empMap.values()], cabs: [...cabMap.values()] };
}

function extractFromExcel(sheetName?: string): { employees: SeedEmployee[]; cabs: SeedCab[] } {
  const wb = XLSX.readFile(ROSTER_PATH);
  const sheet = sheetName || wb.SheetNames[0];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });

  const empMap = new Map<string, SeedEmployee>();
  const cabMap = new Map<string, SeedCab>();

  // Group rows by Route No (row[0])
  const routeGroups = new Map<string, unknown[][]>();
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const col0 = row[0] ? String(row[0]).trim() : "";
    if (!col0 || col0.toLowerCase() === "rout no" || col0 === "-") continue;
    if (!routeGroups.has(col0)) {
      routeGroups.set(col0, []);
    }
    routeGroups.get(col0)!.push(row);
  }

  for (const [routeNo, rRows] of routeGroups) {
    // Extract driver and vehicle info
    let vehicle = "";
    let driverName = "Driver";
    let driverPhone = "9999999999";
    let shiftTime = "05:00";

    for (const row of rRows) {
      // Shift time
      const t = row[8];
      if (typeof t === "number") {
        const mins = Math.round(t * 24 * 60);
        shiftTime = `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      } else if (typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t.trim())) {
        shiftTime = t.trim();
      }

      // Driver details in column 12
      const d = row[12] ? String(row[12]).trim() : "";
      if (!d) continue;
      if (/^MH/i.test(d)) {
        vehicle = d;
      } else if (/^(MOB|mob|Mob)-?/.test(d)) {
        driverPhone = d.replace(/^(MOB|mob|Mob)-?/i, "");
      } else if (/^\d{10}$/.test(d.replace(/[- ]/g, ""))) {
        driverPhone = d.replace(/[- ]/g, "");
      } else {
        driverName = d;
      }
    }

    if (!vehicle) {
      vehicle = `DUMMY-${routeNo}`;
    }

    if (!cabMap.has(vehicle)) {
      cabMap.set(vehicle, {
        vehicleNumber: vehicle,
        driverName,
        driverPhone,
        capacity: 6,
        shiftStartTime: shiftTime,
      });
    }

    // Parse passenger employees
    for (const row of rRows) {
      const code = row[3] ? String(row[3]).trim() : "";
      const name = row[4] ? String(row[4]).trim() : "";
      if (!code || !name || name.toLowerCase() === "escort" || name.toLowerCase() === "employee name" || name.toLowerCase() === "name") continue;

      const status = row[11] ? String(row[11]).trim().toUpperCase() : "";
      if (status.includes("NO SHOW") || status === "ABSENT") continue;

      if (!empMap.has(code)) {
        empMap.set(code, {
          employeeCode: code,
          name,
          gender: row[13] === "F" ? "FEMALE" : "MALE",
          email: `${code.toLowerCase().replace(/[^a-z0-9]/g, ".")}@globallogic.com`,
          phone: "9999999999",
          address: row[7] ? String(row[7]).trim() : "Nagpur, Maharashtra",
          x: 79.05,
          y: 21.06,
          shiftStartTime: shiftTime,
          pickupPoint: row[9] ? String(row[9]).trim() : undefined,
        });
      }
    }
  }

  return { employees: [...empMap.values()], cabs: [...cabMap.values()] };
}

async function upsertShift(startTime: string) {
  const id = `shift-${startTime.replace(":", "")}`;
  return prisma.shift.upsert({
    where: { id },
    update: { startTime, name: `${startTime} Shift` },
    create: {
      id,
      name: `${startTime} Shift`,
      startTime,
      endTime: "23:59",
    },
  });
}

async function main() {
  const sheetArg = process.argv.find((a) => a.startsWith("--sheet="))?.split("=")[1];

  let employees: SeedEmployee[];
  let cabs: SeedCab[];
  let source: string;

  if (fs.existsSync(ROSTER_PATH)) {
    source = `Excel: ${ROSTER_PATH}${sheetArg ? ` (sheet ${sheetArg})` : ""}`;
    ({ employees, cabs } = extractFromExcel(sheetArg));
  } else if (fs.existsSync(JSON_PATH)) {
    source = `JSON fallback: ${JSON_PATH}`;
    ({ employees, cabs } = extractFromJson());
  } else {
    console.error("No roster.xlsx or excel_routes.json found.");
    process.exit(1);
  }

  console.log(`Seeding from ${source}`);
  console.log(`  Employees: ${employees.length}, Cabs: ${cabs.length}`);

  const shiftCache = new Map<string, string>();
  for (const emp of employees) {
    if (!shiftCache.has(emp.shiftStartTime)) {
      const shift = await upsertShift(emp.shiftStartTime);
      shiftCache.set(emp.shiftStartTime, shift.id);
    }
  }

  const pickupPoints = new Map<string, string>();
  for (const emp of employees) {
    if (emp.pickupPoint && !pickupPoints.has(emp.pickupPoint)) {
      const zoneInfo = assignZone(emp.y, emp.x);
      const pp = await prisma.pickupPoint.upsert({
        where: { id: `pp-${emp.pickupPoint.replace(/\s+/g, "-").slice(0, 40)}` },
        update: {},
        create: {
          id: `pp-${emp.pickupPoint.replace(/\s+/g, "-").slice(0, 40)}`,
          name: emp.pickupPoint,
          x: emp.x,
          y: emp.y,
          zone: zoneInfo.zone,
          subZone: zoneInfo.subZone,
          distanceRing: zoneInfo.distanceRing,
          address: emp.address,
        },
      });
      pickupPoints.set(emp.pickupPoint, pp.id);
    }
  }

  // Fetch existing employee coordinates to avoid overwriting them
  const existingEmployees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, name: true, x: true, y: true, address: true }
  });
  const existingByCode = new Map<string, typeof existingEmployees[0]>();
  const existingByName = new Map<string, typeof existingEmployees[0]>();
  for (const emp of existingEmployees) {
    existingByCode.set(emp.employeeCode.toLowerCase(), emp);
    existingByName.set(emp.name.toLowerCase(), emp);
  }

  let upserted = 0;
  for (const emp of employees) {
    const shiftId = shiftCache.get(emp.shiftStartTime)!;
    
    const existing = existingByCode.get(emp.employeeCode.toLowerCase()) || existingByName.get(emp.name.toLowerCase());
    let finalX = emp.x;
    let finalY = emp.y;
    let finalAddress = emp.address;

    if (existing && existing.x != null && existing.y != null) {
      finalX = existing.x;
      finalY = existing.y;
      if (existing.address && (!emp.address || emp.address === "Nagpur, Maharashtra")) {
        finalAddress = existing.address;
      }
    } else {
      if (emp.address && emp.address !== "Nagpur, Maharashtra") {
        try {
          const { geocodePlace } = await import("../src/lib/optimization");
          const geo = await geocodePlace(emp.address, "Nagpur", "India", { x: 79.0526, y: 21.0625 }, 70);
          if (geo) {
            finalX = geo.x;
            finalY = geo.y;
            console.log(`Geocoded new employee ${emp.name} to (${finalX}, ${finalY})`);
          }
        } catch (e: any) {
          console.warn(`Geocoding failed for ${emp.name} (${emp.address}): ${e.message}`);
        }
      }
    }

    const zoneInfo = assignZone(finalY, finalX);
    const pickupPointId = emp.pickupPoint ? pickupPoints.get(emp.pickupPoint) : undefined;

    const codeVal = emp.employeeCode;
    const isNew = !existingByCode.has(codeVal.toLowerCase());

    const dbEmp = await prisma.employee.upsert({
      where: { employeeCode: codeVal },
      update: {
        name: emp.name,
        gender: emp.gender,
        address: finalAddress,
        x: finalX,
        y: finalY,
        shiftId,
        status: "ACTIVE",
        zone: zoneInfo.zone,
        subZone: zoneInfo.subZone,
        distanceRing: zoneInfo.distanceRing,
        distanceFromDepotKm: zoneInfo.distanceFromDepotKm,
        pickupPointId,
      },
      create: {
        employeeCode: codeVal,
        name: emp.name,
        gender: emp.gender,
        phone: emp.phone,
        email: emp.email,
        address: finalAddress,
        x: finalX,
        y: finalY,
        department: "Engineering",
        shiftId,
        status: "ACTIVE",
        zone: zoneInfo.zone,
        subZone: zoneInfo.subZone,
        distanceRing: zoneInfo.distanceRing,
        distanceFromDepotKm: zoneInfo.distanceFromDepotKm,
        pickupPointId,
      },
    });

    if (isNew) {
      console.log(`[SYNC] Employee Created: ${dbEmp.name} (${dbEmp.employeeCode})`);
    } else {
      console.log(`[SYNC] Employee Updated: ${dbEmp.name} (${dbEmp.employeeCode})`);
    }
    upserted++;
  }

  const dbCabs = await prisma.cab.findMany({ select: { vehicleNumber: true } });
  const dbCabNumbers = new Set(dbCabs.map(c => c.vehicleNumber.toUpperCase()));

  for (const cab of cabs) {
    const shiftId = shiftCache.get(cab.shiftStartTime) || (await upsertShift(cab.shiftStartTime)).id;
    const isNewCab = !dbCabNumbers.has(cab.vehicleNumber.toUpperCase());
    const dbCab = await prisma.cab.upsert({
      where: { vehicleNumber: cab.vehicleNumber },
      update: {
        capacity: cab.capacity,
        driverName: cab.driverName,
        driverPhone: cab.driverPhone,
        status: "AVAILABLE",
        vendor: "FT",
        shifts: { set: [{ id: shiftId }] },
      },
      create: {
        vehicleNumber: cab.vehicleNumber,
        capacity: cab.capacity,
        vendor: "FT",
        status: "AVAILABLE",
        driverName: cab.driverName,
        driverPhone: cab.driverPhone,
        licenseNumber: `DL-${cab.vehicleNumber.slice(-6)}`,
        shifts: { connect: { id: shiftId } },
      },
    });

    if (isNewCab) {
      console.log(`[SYNC] Cab Created: ${dbCab.vehicleNumber}`);
    } else {
      console.log(`[SYNC] Cab Updated: ${dbCab.vehicleNumber}`);
    }
  }

  console.log(`\nDone. Upserted ${upserted} employees, ${cabs.length} cabs.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
