/**
 * Seed employees, shifts, cabs from GTPL 12-June sheet (source of truth).
 * Run: npm run seed:12june
 */
import { PrismaClient } from "@prisma/client";
import {
  gtplWorkbookPath,
  parseGtlpFileSheet,
  shiftIdFromTime,
} from "../src/lib/gtplParser";
import { assignZone } from "../src/lib/zones";

const prisma = new PrismaClient();
const SEED_DATE = "2026-06-12";
const SHEET_NAME = "12-6-26";

const SHIFTS_CONFIG = [
  { id: "shift-0500", name: "APAC 05:00", startTime: "05:00", endTime: "14:00" },
  { id: "shift-0700", name: "IST 07:00", startTime: "07:00", endTime: "16:00" },
  { id: "shift-0900", name: "IST 09:00", startTime: "09:00", endTime: "18:00" },
  { id: "shift-1000", name: "IST 10:00", startTime: "10:00", endTime: "19:00" },
  { id: "shift-1300", name: "IST 13:00", startTime: "13:00", endTime: "22:00" },
];

async function dedupeEmployeesByName(keepIds: Set<string>) {
  const all = await prisma.employee.findMany({ orderBy: { name: "asc" } });
  const byName = new Map<string, typeof all>();
  for (const e of all) {
    const key = e.name.toLowerCase().trim();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(e);
  }

  for (const [, group] of byName) {
    if (group.length <= 1) continue;
    const keeper =
      group.find((e) => keepIds.has(e.id)) ||
      group.find((e) => e.status === "ACTIVE") ||
      group[0];
    for (const dup of group) {
      if (dup.id === keeper.id) continue;
      await prisma.employee.update({
        where: { id: dup.id },
        data: {
          status: "INACTIVE",
          employeeCode: `DUP-${dup.id.slice(0, 8)}-${dup.employeeCode}`.slice(0, 80),
          email: `dup-${dup.id.slice(0, 8)}-${dup.email}`,
        },
      });
    }
  }
}

async function main() {
  const filePath = gtplWorkbookPath();
  console.log(`Seeding from GTPL workbook: ${filePath}`);
  console.log(`Sheet: ${SHEET_NAME}, date: ${SEED_DATE}`);

  const parsed = parseGtlpFileSheet(SHEET_NAME, filePath);
  console.log(
    `Parsed: ${parsed.uniqueEmployeeCount} unique employees, ` +
      `${parsed.presentRowCount} present rows, ${parsed.absentRowCount} absent rows, ` +
      `${parsed.cabsUsed} P-routes`
  );

  for (const s of SHIFTS_CONFIG) {
    await prisma.shift.upsert({
      where: { id: s.id },
      update: { name: s.name, startTime: s.startTime, endTime: s.endTime },
      create: s,
    });
  }

  const existingEmployees = await prisma.employee.findMany();
  const byCode = new Map(existingEmployees.map((e) => [e.employeeCode.toLowerCase(), e]));
  const byName = new Map(existingEmployees.map((e) => [e.name.toLowerCase(), e]));
  const byEmail = new Map(existingEmployees.map((e) => [e.email.toLowerCase(), e]));

  const activeEmployeeIds = new Set<string>();
  const { geocodePlace } = await import("../src/lib/optimization");

  for (const emp of parsed.employees) {
    const nameKey = emp.name.toLowerCase();
    let existing =
      (emp.empId ? byCode.get(emp.empId.toLowerCase()) : null) ||
      byName.get(nameKey) ||
      byEmail.get(emp.email.toLowerCase());

    let x = 79.0526;
    let y = 21.0625;
    let address = emp.address;

    if (existing?.x != null && existing?.y != null) {
      x = existing.x;
      y = existing.y;
      address = existing.address;
    } else if (emp.address && emp.address.length > 10) {
      try {
        const geo = await geocodePlace(emp.address, "Nagpur", "India", { x: 79.0526, y: 21.0625 }, 70);
        if (geo) {
          x = geo.x;
          y = geo.y;
        }
      } catch {
        /* use defaults */
      }
    }

    const zoneInfo = assignZone(y, x);
    const shiftId = shiftIdFromTime(emp.shiftTime);
    const empCode = emp.empId || `EXCEL-${nameKey.replace(/\s+/g, "-").toUpperCase()}`;

    await prisma.employee.updateMany({
      where: { employeeCode: empCode, ...(existing ? { id: { not: existing.id } } : {}) },
      data: {
        status: "INACTIVE",
        employeeCode: `STALE-${Date.now().toString().slice(-6)}-${empCode}`.slice(0, 80),
      },
    });

    const empData = {
      employeeCode: empCode,
      name: emp.name,
      gender: emp.gender,
      phone: emp.phone,
      email: emp.email,
      address,
      x,
      y,
      department: "Engineering",
      shiftId,
      status: "ACTIVE" as const,
      zone: zoneInfo.zone,
      subZone: zoneInfo.subZone,
      distanceRing: zoneInfo.distanceRing,
      distanceFromDepotKm: zoneInfo.distanceFromDepotKm,
    };

    let record;
    if (existing) {
      record = await prisma.employee.update({ where: { id: existing.id }, data: empData });
    } else {
      record = await prisma.employee.create({ data: empData });
    }

    activeEmployeeIds.add(record.id);
    byCode.set(empCode.toLowerCase(), record);
    byName.set(nameKey, record);

    let userId = record.userId;
    if (!userId) {
      let user = await prisma.user.findUnique({ where: { email: emp.email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: emp.email,
            name: emp.name,
            password: "$2a$10$dummyhashedpasswordforseedingpurposeonly",
            role: "EMPLOYEE",
            isActive: true,
            requiresPasswordChange: false,
          },
        });
      }
      await prisma.employee.update({ where: { id: record.id }, data: { userId: user.id } });
      userId = user.id;
    }

    await prisma.leaveRequest.deleteMany({
      where: { applicantId: userId!, startDate: SEED_DATE, endDate: SEED_DATE },
    });

    if (emp.absent) {
      await prisma.leaveRequest.create({
        data: {
          applicantId: userId!,
          startDate: SEED_DATE,
          endDate: SEED_DATE,
          status: "APPROVED",
          comments: "GTPL 12-June NO SHOW",
        },
      });
    }
  }

  await prisma.employee.updateMany({
    where: { id: { notIn: [...activeEmployeeIds] } },
    data: { status: "INACTIVE" },
  });

  await dedupeEmployeesByName(activeEmployeeIds);

  const cabSeen = new Set<string>();
  for (const route of parsed.routes) {
    const vehicleNumber = route.vehicleNumber.startsWith("MH")
      ? route.vehicleNumber.replace(/\s+/g, "")
      : `ROUTE-${route.routeNo}-${route.driver.replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`;

    if (cabSeen.has(vehicleNumber)) continue;
    cabSeen.add(vehicleNumber);

    const shiftTime = route.employees.find((e) => e.status === "YES")?.shiftTime || "05:00";
    const shiftId = shiftIdFromTime(shiftTime);

    await prisma.cab.upsert({
      where: { vehicleNumber },
      update: {
        capacity: 6,
        vendor: "FT",
        status: "AVAILABLE",
        driverName: route.driver.replace(/^(DRIVER-|Driver-|Driver=|MOB-|Mob-)/i, "") || route.driver,
        driverPhone: "9999999999",
        shifts: { set: [{ id: shiftId }] },
      },
      create: {
        vehicleNumber,
        capacity: 6,
        vendor: "FT",
        status: "AVAILABLE",
        driverName: route.driver.replace(/^(DRIVER-|Driver-|Driver=|MOB-|Mob-)/i, "") || route.driver,
        driverPhone: "9999999999",
        licenseNumber: `DL-${vehicleNumber.slice(-6)}`,
        shifts: { connect: { id: shiftId } },
      },
    });
  }

  for (const v of parsed.vehicles) {
    if (cabSeen.has(v)) continue;
    cabSeen.add(v);
    await prisma.cab.upsert({
      where: { vehicleNumber: v },
      update: { capacity: 6, vendor: "FT", status: "AVAILABLE" },
      create: {
        vehicleNumber: v,
        capacity: 6,
        vendor: "FT",
        status: "AVAILABLE",
        driverName: "Driver",
        driverPhone: "9999999999",
        licenseNumber: `DL-${v.slice(-6)}`,
        shifts: { connect: SHIFTS_CONFIG.map((s) => ({ id: s.id })) },
      },
    });
  }

  const active = await prisma.employee.count({ where: { status: "ACTIVE" } });
  const absent = await prisma.leaveRequest.count({
    where: { status: "APPROVED", startDate: { lte: SEED_DATE }, endDate: { gte: SEED_DATE } },
  });
  const cabs = await prisma.cab.count({ where: { status: "AVAILABLE" } });

  console.log("\nSeed complete:");
  console.log(`  Active employees: ${active}`);
  console.log(`  Approved leaves on ${SEED_DATE}: ${absent}`);
  console.log(`  Available cabs: ${cabs}`);
  console.log(`  Expected: ~70 active, ~6-8 absent, 17+ cabs`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
