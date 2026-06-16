import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface WorkbookData {
	employees: Map<string, any>;
	cabs: Set<string>;
}

function normalizeEmployee(name: string): string {
	return name?.toString()?.trim()?.toUpperCase() || "";
}

function normalizeVehicle(vehicle: string): string {
	return vehicle?.toString()?.trim()?.toUpperCase() || "";
}

async function parseWorkbookSheet(
	workbook: XLSX.WorkBook,
	sheetName: string,
): Promise<WorkbookData> {
	const ws = workbook.Sheets[sheetName];
	if (!ws) {
		return { employees: new Map(), cabs: new Set() };
	}

	const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

	const employees = new Map<string, any>();
	const cabs = new Set<string>();

	// Auto-detect columns
	let headerRow = rows[0] || [];
	let empNameCol = -1;
	let empCodeCol = -1;
	let vehicleCol = -1;
	let driverCol = -1;
	let phoneCol = -1;

	for (let i = 0; i < headerRow.length; i++) {
		const col = normalizeEmployee(headerRow[i]);
		if (col.includes("EMPLOYEE") && col.includes("CODE")) empCodeCol = i;
		else if (col.includes("NAME") || col.includes("EMPLOYEE")) empNameCol = i;
		else if (col.includes("CAB") || col.includes("VEHICLE")) vehicleCol = i;
		else if (col.includes("DRIVER")) driverCol = i;
		else if (col.includes("PHONE") || col.includes("MOBILE")) phoneCol = i;
	}

	// Fallback column detection
	if (empNameCol === -1) empNameCol = 4;
	if (vehicleCol === -1) vehicleCol = 6;
	if (driverCol === -1) driverCol = 12;
	if (phoneCol === -1) phoneCol = 11;

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (!row || row.length < 2) continue;

		const empName = normalizeEmployee(row[empNameCol]);
		if (!empName || empName === "NAME") continue;

		const empCode = normalizeEmployee(row[empCodeCol] || "");
		const vehicle = normalizeVehicle(row[vehicleCol] || "");
		const driver = row[driverCol] || "";
		const phone = row[phoneCol] || "";

		employees.set(empName, {
			name: row[empNameCol],
			code: empCode,
			vehicle,
			driver,
			phone,
		});

		if (vehicle) cabs.add(vehicle);
	}

	return { employees, cabs };
}

async function main() {
	const args = process.argv.slice(2);
	const dryRun = !args.includes("--apply");

	console.log("=".repeat(80));
	console.log("PHASE 2: DATABASE AUDIT - GTPL JUNE 16 SYNC");
	console.log("=".repeat(80));
	console.log(
		`\n🔍 MODE: ${dryRun ? "DRY RUN (preview only)" : "APPLY (will make changes)"}`,
	);

	const excelPath = path.join(
		process.cwd(),
		"data",
		"GTPL Cab Sheet June 26  (3).xlsx",
	);

	if (!fs.existsSync(excelPath)) {
		console.error(`❌ Excel file not found: ${excelPath}`);
		process.exit(1);
	}

	const workbook = XLSX.readFile(excelPath);
	const { employees: workbookEmployees, cabs: workbookCabs } =
		await parseWorkbookSheet(workbook, "16-6-26");

	console.log(`\n📊 WORKBOOK DATA (16-6-26 sheet):`);
	console.log(`   Employees: ${workbookEmployees.size}`);
	console.log(`   Cabs: ${workbookCabs.size}`);
	console.log(
		`   Unique cabs found: ${Array.from(workbookCabs).slice(0, 5).join(", ")}...`,
	);

	// ========== LOAD DATABASE DATA ==========
	console.log(`\n📁 LOADING DATABASE DATA...`);

	const dbEmployees = await prisma.employee.findMany({
		select: {
			id: true,
			name: true,
			employeeCode: true,
			status: true,
		},
	});

	const dbCabs = await prisma.cab.findMany({
		select: {
			id: true,
			vehicleNumber: true,
			status: true,
			driverName: true,
			driverPhone: true,
		},
	});

	console.log(`   DB Employees: ${dbEmployees.length}`);
	console.log(`   DB Cabs: ${dbCabs.length}`);

	// ========== EMPLOYEES AUDIT ==========
	console.log(`\n${"=".repeat(80)}`);
	console.log("EMPLOYEES AUDIT");
	console.log("=".repeat(80));

	console.log(`\n✅ EMPLOYEES IN WORKBOOK: ${workbookEmployees.size}`);
	const workbookEmpNames = Array.from(workbookEmployees.keys());
	console.log(`   Sample: ${workbookEmpNames.slice(0, 5).join(", ")}`);

	console.log(`\n✅ EMPLOYEES IN DB: ${dbEmployees.length}`);
	const dbEmpNames = dbEmployees.map((e) => e.name.toUpperCase());
	console.log(
		`   Sample: ${dbEmployees
			.slice(0, 5)
			.map((e) => e.name)
			.join(", ")}`,
	);

	// Missing from DB
	const missingFromDb = workbookEmpNames.filter(
		(emp) => !dbEmpNames.includes(emp),
	);
	console.log(`\n❌ MISSING FROM DB: ${missingFromDb.length}`);
	missingFromDb.forEach((emp) => {
		const details = workbookEmployees.get(emp);
		console.log(`   - ${emp} (code: ${details.code})`);
	});

	// Missing from Workbook
	const missingFromWorkbook = dbEmpNames.filter(
		(emp) => !workbookEmpNames.includes(emp),
	);
	console.log(
		`\n⚠️  MISSING FROM WORKBOOK (NO_SHOW): ${missingFromWorkbook.length}`,
	);
	missingFromWorkbook.slice(0, 10).forEach((emp) => {
		console.log(`   - ${emp}`);
	});
	if (missingFromWorkbook.length > 10) {
		console.log(`   ... and ${missingFromWorkbook.length - 10} more`);
	}

	// ========== CABS AUDIT ==========
	console.log(`\n${"=".repeat(80)}`);
	console.log("CABS AUDIT");
	console.log("=".repeat(80));

	console.log(`\n✅ CABS IN WORKBOOK: ${workbookCabs.size}`);
	const workbookCabsList = Array.from(workbookCabs);
	console.log(`   ${workbookCabsList.join(", ")}`);

	console.log(`\n✅ CABS IN DB: ${dbCabs.length}`);
	const dbCabNumbers = dbCabs.map((c) => c.vehicleNumber.toUpperCase());
	console.log(
		`   Sample: ${dbCabs
			.slice(0, 10)
			.map((c) => c.vehicleNumber)
			.join(", ")}`,
	);

	// Missing cabs
	const missingCabs = workbookCabsList.filter(
		(cab) => !dbCabNumbers.includes(cab),
	);
	console.log(`\n❌ MISSING FROM DB: ${missingCabs.length}`);
	missingCabs.forEach((cab) => {
		console.log(`   - ${cab}`);
	});

	// Inactive cabs (in DB but not in workbook)
	const inactiveCabs = dbCabNumbers.filter(
		(cab) => !workbookCabsList.includes(cab),
	);
	console.log(
		`\n⚠️  NOT IN WORKBOOK (will be marked inactive): ${inactiveCabs.length}`,
	);
	inactiveCabs.slice(0, 10).forEach((cab) => {
		console.log(`   - ${cab}`);
	});

	// ========== SUMMARY & DRY RUN ACTIONS ==========
	console.log(`\n${"=".repeat(80)}`);
	console.log("DRY RUN SUMMARY - ACTIONS THAT WOULD BE TAKEN");
	console.log("=".repeat(80));

	console.log(`\n1️⃣  TRANSPORT ROSTER UPDATES:`);
	console.log(
		`   - Mark ${workbookEmpNames.length} employees as PRESENT for 2026-06-16`,
	);
	console.log(
		`   - Mark ${missingFromWorkbook.length} employees as NO_SHOW for 2026-06-16`,
	);

	console.log(`\n2️⃣  CAB STATUS UPDATES:`);
	console.log(
		`   - Mark ${workbookCabsList.length} cabs as ACTIVE for 2026-06-16`,
	);
	console.log(
		`   - Mark ${inactiveCabs.length} cabs as INACTIVE for 2026-06-16`,
	);

	console.log(`\n3️⃣  ISSUES TO INVESTIGATE:`);
	console.log(
		`   - Missing from DB: ${missingFromDb.length} employees need to be created`,
	);
	console.log(
		`   - Missing from DB: ${missingCabs.length} cabs need to be created`,
	);

	console.log(`\n${"=".repeat(80)}`);
	if (dryRun) {
		console.log("✅ DRY RUN COMPLETE - Use --apply flag to execute changes");
		console.log("Example: npm run audit:gtpl -- --apply");
	} else {
		console.log("⚠️  APPLY MODE: Changes would be made now");
	}
	console.log("=".repeat(80));

	// Save audit report
	const auditReport = {
		timestamp: new Date().toISOString(),
		date: "2026-06-16",
		workbook: {
			employees: workbookEmpNames,
			cabs: workbookCabsList,
		},
		database: {
			employees: dbEmpNames,
			cabs: dbCabNumbers,
		},
		audit: {
			employeesInWorkbook: workbookEmpNames.length,
			employeesInDb: dbEmpNames.length,
			employeesMissingFromDb: missingFromDb,
			employeesMissingFromWorkbook: missingFromWorkbook,
			cabsInWorkbook: workbookCabsList.length,
			cabsInDb: dbCabNumbers.length,
			cabsMissingFromDb: missingCabs,
			cabsNotInWorkbook: inactiveCabs,
		},
	};

	const reportPath = path.join(
		process.cwd(),
		"data",
		"outputs",
		"gtpl-audit-report-16june.json",
	);

	const outputDir = path.dirname(reportPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2));
	console.log(`\n📄 Report saved to: ${reportPath}`);

	await prisma.$disconnect();
}

main().catch((err) => {
	console.error("❌ Error:", err);
	process.exit(1);
});
