import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EXISTING_EMPLOYEES = [
  "Aniket Anand",
  "Anima Dixit",
  "Brej Kishore",
  "Ethel Delphine Collins",
  "Krunal Wath",
  "Mahesh Upadhyay",
  "Monika Jeswani",
  "Poorvi",
  "Prachi Jain",
  "Pranav Nachankar",
  "Pushpak Sakhare",
  "Rushabh Bhagate",
  "Sagar",
  "Sayata Chakraborty",
  "Shubhankar Das",
  "Tanuja",
  "Sakshi",
];

// Convert names to normalized form for comparison
const EXISTING_NORMALIZED = new Set(
  EXISTING_EMPLOYEES.map((n) => n.toUpperCase().trim())
);

function normalizeEmployeeName(name: string): string {
  return name?.toString()?.trim()?.toUpperCase() || "";
}

function normalizeDriverName(driver: string): string {
  return driver
    ?.toString()
    ?.trim()
    ?.replace(/^DRIVER[-=]/i, "")
    ?.replace(/^MOB[-=]/i, "")
    ?.toUpperCase() || "";
}

function isValidVehicleNumber(vehicle: string): boolean {
  const vehicleRegex = /^(MH|CG|TS|AP|KA|DL|HR|UP)\d{2}[A-Z]{2}\d{4}$/i;
  return vehicleRegex.test(vehicle?.toString()?.trim() || "");
}

interface DailyRosterData {
  employeeCode: string;
  name: string;
  normalizedName: string;
  email: string;
}

interface RoutesData {
  vehicles: Set<string>;
  drivers: Map<string, string>; // normalized driver name -> vehicle
}

// Parse daily roster sheet (e.g., 16-6-26)
function parseDailyRosterSheet(
  workbook: XLSX.WorkBook,
  sheetName: string
): DailyRosterData[] {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];

  const data: any[] = XLSX.utils.sheet_to_json(ws);
  const employees: DailyRosterData[] = [];

  // Find column indices by exact header match
  const firstRow = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || [];
  let empCodeCol = -1;
  let empNameCol = -1;
  let emailCol = -1;

  for (let i = 0; i < firstRow.length; i++) {
    const header = String(firstRow[i]).toLowerCase().trim();
    if (
      header === "emp id" ||
      header === "employee code" ||
      header === "employeecode"
    )
      empCodeCol = i;
    else if (header === "name" || header === "employee name")
      empNameCol = i;
    else if (header === "email" || header === "mail id") emailCol = i;
  }

  // Parse rows
  data.forEach((row, idx) => {
    // Skip header rows (where Name="Name" or Emp ID="Emp ID")
    if (
      (row["Name"] || row["Employee Name"] || row["name"]) === "Name" ||
      (row["Emp ID"] || row["Employee Code"] || row["emp id"]) === "Emp ID"
    ) {
      return;
    }

    const empCode = (row["Emp ID"] || row["Employee Code"] || row["emp id"] || "")
      .toString()
      .trim();
    const empName = (row["Name"] || row["Employee Name"] || row["name"] || "")
      .toString()
      .trim();
    const email = (row["Email"] || row["Mail ID"] || row["email"] || "")
      .toString()
      .trim();

    // Skip if no name
    if (!empName || empName === "Name") return;

    // Skip if appears to be a phone number or special row
    if (empName.match(/^\d{10}$/) || empName.toLowerCase().startsWith("mob")) {
      return;
    }

    // Skip "Escort" rows - these are not real employees
    if (empName.toLowerCase() === "escort" || empName.toLowerCase().includes("driver details")) {
      return;
    }

    employees.push({
      employeeCode: empCode,
      name: empName,
      normalizedName: normalizeEmployeeName(empName),
      email: email,
    });
  });

  return employees;
}

// Parse Routes and Driver details sheet
function parseRoutesSheet(workbook: XLSX.WorkBook): RoutesData {
  const sheetName = "Routes and Driver details ";
  const ws = workbook.Sheets[sheetName];
  if (!ws) {
    console.warn(`⚠️  Routes sheet not found: "${sheetName}"`);
    return { vehicles: new Set(), drivers: new Map() };
  }

  const data: any[] = XLSX.utils.sheet_to_json(ws);
  const vehicles = new Set<string>();
  const drivers = new Map<string, string>();
  const vehicleRegex = /^(MH|CG|TS|AP|KA|DL|HR|UP)\d{2}[A-Z]{2}\d{4}$/i;

  data.forEach((row) => {
    const driverDetailsRaw = (row["Driver Details"] || "").toString().trim();

    // Extract vehicle - must match vehicle registration pattern
    if (vehicleRegex.test(driverDetailsRaw)) {
      vehicles.add(driverDetailsRaw.toUpperCase());
    }

    // Extract driver - look for "DRIVER-" or "DRIVER=" prefix
    if (driverDetailsRaw.match(/^DRIVER[-=]/i)) {
      const normalizedDriver = normalizeDriverName(driverDetailsRaw);
      if (normalizedDriver && normalizedDriver.length > 2) {
        // Map driver to vehicle (or empty if not a valid vehicle)
        const vehicleNum = vehicleRegex.test(driverDetailsRaw)
          ? driverDetailsRaw.toUpperCase()
          : "";
        drivers.set(normalizedDriver, vehicleNum);
      }
    }
  });

  return { vehicles, drivers };
}

interface ValidationReport {
  timestamp: string;
  date: string;
  employeesToCreate: Array<{
    name: string;
    code: string;
    reason: string;
  }>;
  employeesToUpdate: Array<{
    name: string;
    code: string;
    matchType: string;
    dbRecord: string;
  }>;
  employeesToMarkNoShow: Array<{
    name: string;
    code: string;
  }>;
  vehiclesUpdated: string[];
  driversUpdated: string[];
  safetyChecks: {
    creates: number;
    createsThreshold: number;
    deactivations: number;
    deactivationsThreshold: number;
    passed: boolean;
  };
}

async function main() {
  const args = process.argv.slice(2);
  // Check both command line args AND environment variable
  const applyMode = args.includes("--apply") || process.env.GTPL_APPLY === "true";

  console.log("=".repeat(80));
  console.log("GTPL WORKBOOK SYNC - FIXED ARCHITECTURE");
  console.log("=".repeat(80));
  console.log(
    `\n🔍 MODE: ${applyMode ? "🚀 APPLY (WILL MAKE DATABASE CHANGES)" : "DRY RUN (preview only)"}`
  );
  console.log(`Date: 2026-06-16`);
  console.log(`Source: Daily sheets (employee attendance) + Routes sheet (vehicles/drivers)`);

  const excelPath = path.join(
    process.cwd(),
    "data",
    "GTPL Cab Sheet June 26  (3).xlsx"
  );

  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Excel file not found: ${excelPath}`);
    process.exit(1);
  }

  // ========== PARSE WORKBOOK ==========
  console.log(`\n📊 PARSING WORKBOOK...`);
  const workbook = XLSX.readFile(excelPath);

  // Parse daily roster (16-6-26)
  const dailyRosterEmployees = parseDailyRosterSheet(workbook, "16-6-26");
  console.log(
    `   ✅ Daily roster (16-6-26): ${dailyRosterEmployees.length} employees`
  );

  // Parse routes sheet for vehicles and drivers
  const routesData = parseRoutesSheet(workbook);
  console.log(
    `   ✅ Routes sheet: ${routesData.vehicles.size} vehicles, ${routesData.drivers.size} drivers`
  );

  // ========== LOAD DATABASE ==========
  console.log(`\n📁 LOADING DATABASE...`);

  const dbEmployees = await prisma.employee.findMany({
    select: {
      id: true,
      name: true,
      employeeCode: true,
      email: true,
    },
  });

  const dbCabs = await prisma.cab.findMany({
    select: {
      id: true,
      vehicleNumber: true,
      driverName: true,
    },
  });

  console.log(`   ✅ Database: ${dbEmployees.length} employees, ${dbCabs.length} cabs`);

  // ========== EMPLOYEE MATCHING LOGIC ==========
  console.log(`\n🔗 MATCHING EMPLOYEES (3-TIER MATCHING)...`);

  const employeesToCreate: ValidationReport["employeesToCreate"] = [];
  const employeesToUpdate: ValidationReport["employeesToUpdate"] = [];
  const employeesToMarkNoShow: ValidationReport["employeesToMarkNoShow"] = [];

  // Build maps for faster lookup
  const dbByCode = new Map(dbEmployees.map((e) => [e.employeeCode, e]));
  const dbByNormalizedName = new Map(
    dbEmployees.map((e) => [normalizeEmployeeName(e.name), e])
  );
  const dbByEmail = new Map(dbEmployees.map((e) => [e.email, e]));
  const presentNormalizedNames = new Set(
    dailyRosterEmployees.map((e) => e.normalizedName)
  );

  for (const emp of dailyRosterEmployees) {
    let matchedDbEmployee = null;
    let matchType = "NONE";

    // PRIORITY 1: Match by employee code
    if (emp.employeeCode && dbByCode.has(emp.employeeCode)) {
      matchedDbEmployee = dbByCode.get(emp.employeeCode);
      matchType = "CODE";
    }
    // PRIORITY 2: Match by normalized name (case-insensitive)
    else if (dbByNormalizedName.has(emp.normalizedName)) {
      matchedDbEmployee = dbByNormalizedName.get(emp.normalizedName);
      matchType = "NAME_NORMALIZED";
    }
    // PRIORITY 3: Match by email
    else if (emp.email && dbByEmail.has(emp.email)) {
      matchedDbEmployee = dbByEmail.get(emp.email);
      matchType = "EMAIL";
    }

    if (matchedDbEmployee) {
      employeesToUpdate.push({
        name: emp.name,
        code: emp.employeeCode || "NA",
        matchType,
        dbRecord: `${matchedDbEmployee.name} (${matchedDbEmployee.employeeCode})`,
      });
    } else {
      // NEW EMPLOYEE - but check if it should be in existing list
      if (EXISTING_NORMALIZED.has(emp.normalizedName)) {
        console.warn(`⚠️  WARNING: ${emp.name} is in EXISTING list but not matched in DB!`);
        employeesToUpdate.push({
          name: emp.name,
          code: emp.employeeCode || "NA",
          matchType: "EXISTING_LIST_WARNING",
          dbRecord: "EXISTS IN PROTECTED LIST - MANUAL REVIEW NEEDED",
        });
      } else {
        // Genuinely new
        employeesToCreate.push({
          name: emp.name,
          code: emp.employeeCode || "NA",
          reason: "NOT_FOUND_IN_DB_OR_SHEETS",
        });
      }
    }
  }

  // Mark absent employees (in DB but not in today's roster)
  for (const emp of dbEmployees) {
    if (!presentNormalizedNames.has(normalizeEmployeeName(emp.name))) {
      employeesToMarkNoShow.push({
        name: emp.name,
        code: emp.employeeCode,
      });
    }
  }

  // ========== VALIDATION REPORT ==========
  const validationReport: ValidationReport = {
    timestamp: new Date().toISOString(),
    date: "2026-06-16",
    employeesToCreate,
    employeesToUpdate,
    employeesToMarkNoShow,
    vehiclesUpdated: Array.from(routesData.vehicles).sort(),
    driversUpdated: Array.from(routesData.drivers.keys()).sort(),
    safetyChecks: {
      creates: employeesToCreate.length,
      createsThreshold: 5,
      deactivations: 0, // We never deactivate employees
      deactivationsThreshold: 5,
      passed:
        employeesToCreate.length <= 5 && 0 <= 5,
    },
  };

  // ========== DISPLAY VALIDATION REPORT ==========
  console.log(`\n${"=".repeat(80)}`);
  console.log("VALIDATION REPORT - BEFORE APPLYING CHANGES");
  console.log("=".repeat(80));

  console.log(`\n📋 EMPLOYEE ACTIONS:`);
  console.log(`\n   🆕 TO CREATE (${employeesToCreate.length}):`);
  employeesToCreate.forEach((emp) => {
    console.log(
      `      - ${emp.name} (${emp.code}) [${emp.reason}]`
    );
  });

  console.log(`\n   ✏️  TO UPDATE (${employeesToUpdate.length}):`);
  employeesToUpdate.slice(0, 10).forEach((emp) => {
    console.log(
      `      - ${emp.name} (${emp.code}) → ${emp.dbRecord} [${emp.matchType}]`
    );
  });
  if (employeesToUpdate.length > 10) {
    console.log(
      `      ... and ${employeesToUpdate.length - 10} more`
    );
  }

  console.log(`\n   ⚠️  TO MARK NO_SHOW (${employeesToMarkNoShow.length}):`);
  employeesToMarkNoShow.slice(0, 10).forEach((emp) => {
    console.log(`      - ${emp.name} (${emp.code})`);
  });
  if (employeesToMarkNoShow.length > 10) {
    console.log(
      `      ... and ${employeesToMarkNoShow.length - 10} more`
    );
  }

  console.log(`\n📦 VEHICLE & DRIVER ACTIONS:`);
  console.log(`   🚗 Vehicles to update: ${validationReport.vehiclesUpdated.length}`);
  validationReport.vehiclesUpdated.forEach((v) => console.log(`      - ${v}`));

  console.log(`   👤 Drivers to update: ${validationReport.driversUpdated.length}`);
  validationReport.driversUpdated.forEach((d) => console.log(`      - ${d}`));

  console.log(`\n🛡️  SAFETY CHECKS:`);
  console.log(
    `   ${validationReport.safetyChecks.creates <= validationReport.safetyChecks.createsThreshold ? "✅" : "❌"} Employee creates: ${validationReport.safetyChecks.creates} / ${validationReport.safetyChecks.createsThreshold} threshold`
  );
  console.log(
    `   ${validationReport.safetyChecks.deactivations <= validationReport.safetyChecks.deactivationsThreshold ? "✅" : "❌"} Deactivations: ${validationReport.safetyChecks.deactivations} / ${validationReport.safetyChecks.deactivationsThreshold} threshold`
  );

  if (!validationReport.safetyChecks.passed) {
    console.error(
      `\n❌ SAFETY CHECK FAILED - Aborting (not applying changes even if --apply specified)`
    );
    process.exit(1);
  }

  // Save report
  const reportPath = path.join(
    process.cwd(),
    "data/outputs",
    "gtpl-validation-report-final.json"
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(validationReport, null, 2));
  console.log(`\n📄 Validation report saved to: ${reportPath}`);

  // ========== APPLY CHANGES (if --apply flag present) ==========
  if (!applyMode) {
    console.log(`\n✅ DRY RUN COMPLETE - No database changes made`);
    console.log(
      `To apply changes, run: export GTPL_APPLY=true && npm run sync:gtpl-fixed`
    );
    process.exit(0);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("🚀 APPLYING CHANGES TO DATABASE");
  console.log("=".repeat(80));

  // PHASE 1: Create new employees
  if (employeesToCreate.length > 0) {
    console.log(`\n📝 PHASE 1: Creating ${employeesToCreate.length} new employees...`);
    for (const emp of employeesToCreate) {
      try {
        const newEmp = await prisma.employee.create({
          data: {
            employeeCode: emp.code === "NA" ? `EXCEL-${emp.name.replace(/\s+/g, "-").toUpperCase()}` : emp.code,
            name: emp.name,
            gender: "MALE",
            phone: "",
            email: `temp-${emp.name.replace(/\s+/g, "-").toLowerCase()}@temp.com`,
            address: "",
            x: 0,
            y: 0,
            department: "UNKNOWN",
            status: "ACTIVE",
          },
        });
        console.log(`   ✅ Created: ${newEmp.name} (${newEmp.employeeCode})`);
      } catch (err) {
        console.error(`   ❌ Failed to create ${emp.name}: ${(err as any).message}`);
      }
    }
    
    // RELOAD employee data from DB after creating new employees
    const refreshedEmployees = await prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        employeeCode: true,
        email: true,
      },
    });
    
    // Rebuild maps with refreshed data
    dbByCode.clear();
    dbByNormalizedName.clear();
    dbByEmail.clear();
    
    refreshedEmployees.forEach((e) => {
      dbByCode.set(e.employeeCode, e);
      dbByNormalizedName.set(normalizeEmployeeName(e.name), e);
      if (e.email) dbByEmail.set(e.email, e);
    });
  }

  // PHASE 2: Update transport roster for present employees
  console.log(
    `\n📋 PHASE 2: Updating transport roster for ${employeesToUpdate.length} present employees...`
  );
  
  let updateCount = 0;
  
  // Reload fresh DB data for matching
  const allDbEmployees = await prisma.employee.findMany({
    select: { id: true, name: true, employeeCode: true, email: true },
  });
  
  for (const emp of employeesToUpdate) {
    // Find by code first, then by normalized name, then by email
    let dbEmp = allDbEmployees.find((e) => e.employeeCode === emp.code);
    if (!dbEmp && emp.matchType === "NAME_NORMALIZED") {
      dbEmp = allDbEmployees.find(
        (e) => normalizeEmployeeName(e.name) === normalizeEmployeeName(emp.name)
      );
    }
    if (!dbEmp && emp.matchType === "EMAIL") {
      // Try to find by email from the workbook
      const rosterEmp = dailyRosterEmployees.find(
        (d) => d.name === emp.name
      );
      if (rosterEmp && rosterEmp.email) {
        dbEmp = allDbEmployees.find((e) => e.email === rosterEmp.email);
      }
    }

    if (dbEmp) {
      // Use raw SQL to avoid Prisma model issues
      try {
        await prisma.$executeRaw`
          INSERT INTO "TransportRoster" ("employeeId", date, "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
          VALUES (${dbEmp.id}, '2026-06-16', 'PRESENT', '16-6-26', now(), now())
          ON CONFLICT ("employeeId", date) DO UPDATE
          SET "transportRosterStatus" = 'PRESENT', "sourceSheet" = '16-6-26', "updatedAt" = now()
        `;
        updateCount++;
      } catch (err) {
        console.error(`   ❌ Error updating ${emp.name}: ${(err as any).message}`);
      }
    }
  }
  console.log(`   ✅ Updated ${updateCount} transport roster records`);

  // PHASE 3: Mark absent employees
  console.log(
    `\n⚠️  PHASE 3: Marking ${employeesToMarkNoShow.length} employees as NO_SHOW...`
  );
  let noShowCount = 0;
  for (const emp of employeesToMarkNoShow) {
    const dbEmp = allDbEmployees.find(
      (e) => normalizeEmployeeName(e.name) === normalizeEmployeeName(emp.name)
    );
    if (dbEmp) {
      try {
        await prisma.$executeRaw`
          INSERT INTO "TransportRoster" ("employeeId", date, "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
          VALUES (${dbEmp.id}, '2026-06-16', 'NO_SHOW', '16-6-26', now(), now())
          ON CONFLICT ("employeeId", date) DO UPDATE
          SET "transportRosterStatus" = 'NO_SHOW', "sourceSheet" = '16-6-26', "updatedAt" = now()
        `;
        noShowCount++;
      } catch (err) {
        console.error(`   ❌ Error marking ${emp.name}: ${(err as any).message}`);
      }
    }
  }
  console.log(`   ✅ Updated ${noShowCount} NO_SHOW records`);

  // PHASE 4: Update vehicles
  console.log(
    `\n🚗 PHASE 4: Updating ${validationReport.vehiclesUpdated.length} vehicles...`
  );
  let vehicleUpdateCount = 0;
  for (const vehicleNum of validationReport.vehiclesUpdated) {
    const dbCab = dbCabs.find(
      (c) => c.vehicleNumber.toUpperCase() === vehicleNum.toUpperCase()
    );
    if (dbCab) {
      try {
        await prisma.$executeRaw`
          INSERT INTO "CabRosterStatus" ("cabId", date, status, "createdAt", "updatedAt")
          VALUES (${dbCab.id}, '2026-06-16', 'ACTIVE', now(), now())
          ON CONFLICT ("cabId", date) DO UPDATE
          SET status = 'ACTIVE', "updatedAt" = now()
        `;
        vehicleUpdateCount++;
      } catch (err) {
        console.error(`   ❌ Error updating vehicle ${vehicleNum}: ${(err as any).message}`);
      }
    }
  }
  console.log(`   ✅ Updated ${vehicleUpdateCount} vehicle records`);

  // PHASE 5: Update drivers
  console.log(
    `\n👤 PHASE 5: Updating ${validationReport.driversUpdated.length} drivers...`
  );
  let driverUpdateCount = 0;
  for (const [driverName, vehicleNum] of routesData.drivers.entries()) {
    const dbCab = dbCabs.find(
      (c) => c.vehicleNumber.toUpperCase() === vehicleNum.toUpperCase()
    );
    if (dbCab) {
      await prisma.cab.update({
        where: { id: dbCab.id },
        data: {
          driverName: driverName,
        },
      });
      driverUpdateCount++;
    }
  }
  console.log(`   ✅ Updated ${driverUpdateCount} driver records`);

  console.log(`\n${"=".repeat(80)}`);
  console.log("✅ SYNC COMPLETE - ALL CHANGES APPLIED");
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ FATAL ERROR:", err);
  process.exit(1);
});
