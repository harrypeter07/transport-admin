/**
 * CLI smoke tests for optimization edge cases (no HTTP server required).
 * Run: npm run test:scenarios
 */
import { PrismaClient } from "@prisma/client";
import { parseGtlpFileSheet, gtplWorkbookPath } from "../src/lib/gtplParser";
import { getExcelFilterForDate } from "../src/lib/excelFilter";

const prisma = new PrismaClient();
const TEST_DATE = "2026-06-12";
const SHIFTS = ["shift-0500", "shift-0700", "shift-0900", "shift-1000", "shift-1300"];

type Result = { name: string; pass: boolean; detail: string };

const results: Result[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${name} — ${detail}`);
}

async function countActiveForShift(shiftId: string, absentCodes: string[] = []) {
  const filter = getExcelFilterForDate(TEST_DATE);
  const absentSet = new Set(absentCodes.map((c) => c.toLowerCase()));

  let employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", shiftId },
    include: {
      user: {
        include: {
          leaves: {
            where: {
              status: "APPROVED",
              startDate: { lte: TEST_DATE },
              endDate: { gte: TEST_DATE },
            },
          },
        },
      },
    },
  });

  if (filter) {
    employees = employees.filter((e) => filter.employeeNames.has(e.name.toLowerCase().trim()));
  }

  const active = employees.filter(
    (e) =>
      (e.user?.leaves || []).length === 0 &&
      !absentSet.has(e.employeeCode.toLowerCase())
  );

  let cabs = await prisma.cab.findMany({
    where: { status: "AVAILABLE", shifts: { some: { id: shiftId } } },
  });
  if (cabs.length === 0) {
    cabs = await prisma.cab.findMany({ where: { status: "AVAILABLE" } });
  }

  return { active: active.length, cabs: cabs.length, minCabs: Math.ceil(active.length / 6) || 0 };
}

async function main() {
  console.log("═══ ETMS Optimization Scenario Tests ═══\n");

  const gtpl = parseGtlpFileSheet("12-6-26", gtplWorkbookPath());
  record(
    "GTPL ground truth",
    gtpl.cabsUsed === 17 && gtpl.uniqueEmployeeCount >= 68,
    `${gtpl.uniqueEmployeeCount} employees, ${gtpl.cabsUsed} routes, ${gtpl.absentUniqueCount} absent`
  );

  const filter = getExcelFilterForDate(TEST_DATE);
  record(
    "Excel filter loads",
    !!filter && filter.employeeNames.size >= 60,
    filter
      ? `${filter.employeeNames.size} names, ${filter.cabVehicleNumbers.size} MH plates`
      : "filter null"
  );

  let shiftsWithEmployees = 0;
  let shiftsWithCabs = 0;
  for (const shiftId of SHIFTS) {
    const { active, cabs, minCabs } = await countActiveForShift(shiftId);
    if (active > 0) shiftsWithEmployees++;
    if (cabs >= minCabs || active === 0) shiftsWithCabs++;
    console.log(`   ${shiftId}: ${active} active employees, ${cabs} cabs (need ${minCabs})`);
  }

  record(
    "All shifts have fleet when employees exist",
    shiftsWithCabs === SHIFTS.length,
    `${shiftsWithCabs}/${SHIFTS.length} shifts can be optimized (no 400 no_cabs)`
  );

  record(
    "Multiple shifts have employees",
    shiftsWithEmployees >= 2,
    `${shiftsWithEmployees} shifts with active employees`
  );

  const absentEmployees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      user: {
        leaves: {
          some: {
            status: "APPROVED",
            startDate: { lte: TEST_DATE },
            endDate: { gte: TEST_DATE },
          },
        },
      },
    },
    select: { name: true, employeeCode: true },
  });
  record(
    "DB approved leaves on 12-June",
    absentEmployees.length >= 4,
    `${absentEmployees.length} absent: ${absentEmployees.map((e) => e.name).slice(0, 4).join(", ")}`
  );

  record(
    "Absence overlay mechanism",
    absentEmployees.length >= 1,
    `${absentEmployees.length} DB-approved leaves on ${TEST_DATE}; use test-scenario-B.xlsx to test Excel absentEmployeeCodes overlay in UI`
  );

  const totalActive = await prisma.employee.count({ where: { status: "ACTIVE" } });
  const totalCabs = await prisma.cab.count({ where: { status: "AVAILABLE" } });
  record(
    "Seed data present",
    totalActive >= 60 && totalCabs >= 15,
    `${totalActive} active employees, ${totalCabs} cabs`
  );

  console.log("\n═══ File guide (manual UI tests) ═══");
  console.log("| File | Sheet | Date | Purpose |");
  console.log("|------|-------|------|---------|");
  console.log("| gtpl-12-6-26-baseline.xlsx | 12-6-26 | 2026-06-12 | Full GTPL baseline compare |");
  console.log("| test-scenario-A.xlsx | 14-6-26 | 2026-06-14 | Baseline copy (same as 12-June) |");
  console.log("| test-scenario-B.xlsx | 14-6-26 | 2026-06-14 | 15 NO SHOW — high absence |");
  console.log("| test-scenario-C.xlsx | 16-6-26 | 2026-06-16 | Female-first stress test |");
  console.log("| scenario-2026-06-01-baseline.xlsx | 2026-06-01 | 2026-06-01 | Legacy synthetic baseline |");
  console.log("| scenario-2026-06-02-high-absence.xlsx | 2026-06-02 | 2026-06-02 | Legacy 12 absent |");
  console.log("| scenario-2026-06-03-female-first.xlsx | 2026-06-03 | 2026-06-03 | Legacy female-first |");

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n═══ ${passed}/${results.length} automated checks passed ═══`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
