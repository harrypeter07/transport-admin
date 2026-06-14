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

const ROSTER_PATH = path.join(process.cwd(), "data", "test-rosters", "roster.xlsx");
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
  let currentRoute = "";
  let shiftTime = "05:00";
  let vehicle = "";
  let driverName = "Driver";
  let driverPhone = "9999999999";

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const col0 = row[0] ? String(row[0]).trim() : "";
    if (col0.toLowerCase() === "rout no") continue;

    if (col0) {
      currentRoute = col0;
      const t = row[8];
      if (typeof t === "number") {
        const mins = Math.round(t * 24 * 60);
        shiftTime = `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      }
    }

    const dCol = row[12] ? String(row[12]).trim() : "";
    if (/^MH/i.test(dCol)) vehicle = dCol;
    else if (/^\d{10}$/.test(dCol.replace(/[- ]/g, ""))) driverPhone = dCol.replace(/[- ]/g, "");
    else if (dCol && !/^(MOB|mob)/i.test(dCol) && dCol.length > 3 && !row[3]) driverName = dCol;

    const code = row[3] ? String(row[3]).trim() : "";
    const name = row[4] ? String(row[4]).trim() : "";
    if (!code || !name || name.toLowerCase() === "escort") continue;

    const status = row[11] ? String(row[11]).trim().toUpperCase() : "";
    if (status.includes("NO SHOW") || status === "ABSENT") continue;

    if (vehicle && !cabMap.has(vehicle)) {
      cabMap.set(vehicle, {
        vehicleNumber: vehicle,
        driverName,
        driverPhone,
        capacity: 6,
        shiftStartTime: shiftTime,
      });
    }

    if (!empMap.has(code)) {
      empMap.set(code, {
        employeeCode: code,
        name,
        gender: row[13] === "F" ? "FEMALE" : "MALE",
        email: `${code.toLowerCase().replace(/[^a-z0-9]/g, ".")}@globallogic.com`,
        phone: "9999999999",
        address: row[7] ? String(row[7]) : "Nagpur, Maharashtra",
        x: 79.05,
        y: 21.06,
        shiftStartTime: shiftTime,
        pickupPoint: row[9] ? String(row[9]).trim() : undefined,
      });
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

  let upserted = 0;
  for (const emp of employees) {
    const shiftId = shiftCache.get(emp.shiftStartTime)!;
    const zoneInfo = assignZone(emp.y, emp.x);
    const pickupPointId = emp.pickupPoint ? pickupPoints.get(emp.pickupPoint) : undefined;

    await prisma.employee.upsert({
      where: { employeeCode: emp.employeeCode },
      update: {
        name: emp.name,
        gender: emp.gender,
        address: emp.address,
        x: emp.x,
        y: emp.y,
        shiftId,
        status: "ACTIVE",
        zone: zoneInfo.zone,
        subZone: zoneInfo.subZone,
        distanceRing: zoneInfo.distanceRing,
        distanceFromDepotKm: zoneInfo.distanceFromDepotKm,
        pickupPointId,
      },
      create: {
        employeeCode: emp.employeeCode,
        name: emp.name,
        gender: emp.gender,
        phone: emp.phone,
        email: emp.email,
        address: emp.address,
        x: emp.x,
        y: emp.y,
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
    upserted++;
  }

  for (const cab of cabs) {
    const shiftId = shiftCache.get(cab.shiftStartTime) || (await upsertShift(cab.shiftStartTime)).id;
    await prisma.cab.upsert({
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
  }

  console.log(`\nDone. Upserted ${upserted} employees, ${cabs.length} cabs.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
