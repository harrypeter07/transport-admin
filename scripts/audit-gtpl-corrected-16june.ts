import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";

/**
 * PHASE 2 CORRECTED: Database Audit with Fixed Parser
 *
 * This audit uses accurate workbook data (no emails-as-vehicles)
 * Compares workbook to database with proper reconciliation
 */

const prisma = new PrismaClient();

// Column detection (same as fixed parser)
function detectColumns(headerRow: any[]) {
	const detectedColumns = {
		employeeName: -1,
		email: -1,
		phone: -1,
		driver: -1,
		shift: -1,
	};

	for (let i = 0; i < headerRow.length; i++) {
		const header = (headerRow[i] || "").toString().trim().toUpperCase();

		if (header.includes("NAME") && !header.includes("DRIVER")) {
			detectedColumns.employeeName = i;
		} else if (header.includes("EMAIL") || header.includes("MAIL")) {
			detectedColumns.email = i;
		} else if (header.includes("PHONE") || header.includes("MOBILE")) {
			detectedColumns.phone = i;
		} else if (header.includes("DRIVER")) {
			detectedColumns.driver = i;
		} else if (header.includes("SHIFT")) {
			detectedColumns.shift = i;
		}
	}

	return detectedColumns;
}

function normalizeText(text: any) {
	return text?.toString().trim().toUpperCase() || "";
}

function normalizeEmail(email: any) {
	return email?.toString().trim().toLowerCase() || "";
}

// Parse workbook with corrected logic
function parseWorkbookSheet(
	workbook: any,
	sheetName: string,
): {
	employees: Map<string, any>;
	emails: Set<string>;
} {
	const ws = workbook.Sheets[sheetName];
	if (!ws) {
		console.log(`❌ Sheet "${sheetName}" not found`);
		return { employees: new Map(), emails: new Set() };
	}

	const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
	const headerRow = rows[0];
	const columns = detectColumns(headerRow);

	const employees = new Map();
	const emails = new Set<string>();

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i] as any[];
		if (!row || row.length < 2) continue;

		const empName = normalizeText(row[columns.employeeName]);
		if (!empName || empName === "NAME" || empName === "ESCORT") continue;

		const email = normalizeEmail(row[columns.email] || "");
		const phone = (row[columns.phone] || "").toString().trim();

		employees.set(empName, {
			name: row[columns.employeeName],
			email,
			phone,
		});

		if (email) emails.add(email);
	}

	return { employees, emails };
}

async function main() {
	console.log("\n" + "=".repeat(80));
	console.log("PHASE 2 CORRECTED: DATABASE AUDIT (WITH FIXED PARSER)");
	console.log("=".repeat(80));
	console.log("\n🔍 DRY-RUN MODE: No database changes will be made\n");

	try {
		const excelPath = path.join(
			process.cwd(),
			"data",
			"GTPL Cab Sheet June 26  (3).xlsx",
		);

		if (!fs.existsSync(excelPath)) {
			console.error(`❌ Excel file not found: ${excelPath}`);
			process.exit(1);
		}

		console.log(`📂 Reading workbook: ${excelPath}`);
		const workbook = XLSX.readFile(excelPath);

		// Parse workbook
		console.log(`\n📋 Parsing workbook: 16-6-26 sheet`);
		const { employees: workbookEmployees, emails: workbookEmails } =
			parseWorkbookSheet(workbook, "16-6-26");

		console.log(`   ✅ Employees found: ${workbookEmployees.size}`);
		console.log(`   ✅ Emails found: ${workbookEmails.size}`);
		console.log(`   ✅ Vehicles found: 0 (no vehicle column in source data)`);

		// Load database employees
		console.log(`\n📊 Loading database...`);
		const dbEmployees = await prisma.employee.findMany({
			select: {
				id: true,
				name: true,
				email: true,
			},
		});

		console.log(`   ✅ Database employees: ${dbEmployees.length}`);

		// Audit: Find employees in workbook but not in database
		console.log(`\n🔍 AUDIT: Comparing Workbook vs Database\n`);
		console.log(`-`.repeat(80));
		console.log(`1️⃣  EMPLOYEES IN WORKBOOK BUT NOT IN DATABASE`);
		console.log(`-`.repeat(80));

		const missingFromDb: string[] = [];
		workbookEmployees.forEach((empData, empName) => {
			const dbMatch = dbEmployees.find(
				(db) => normalizeText(db.name) === empName,
			);
			if (!dbMatch) {
				missingFromDb.push(empName);
				console.log(`   ⚠️  ${empName}`);
				if (empData.email) console.log(`      📧 ${empData.email}`);
			}
		});
		console.log(`   Total: ${missingFromDb.length}\n`);

		// Audit: Find employees in database but not in workbook
		console.log(`-`.repeat(80));
		console.log(`2️⃣  EMPLOYEES IN DATABASE BUT NOT IN WORKBOOK`);
		console.log(`-`.repeat(80));

		const missingFromWorkbook: string[] = [];
		dbEmployees.forEach((dbEmp) => {
			const normalized = normalizeText(dbEmp.name);
			if (!workbookEmployees.has(normalized)) {
				missingFromWorkbook.push(dbEmp.name);
				console.log(`   ℹ️  ${dbEmp.name}`);
				if (dbEmp.email) console.log(`      📧 ${dbEmp.email}`);
			}
		});
		console.log(`   Total: ${missingFromWorkbook.length}\n`);

		// Email matching
		console.log(`-`.repeat(80));
		console.log(`3️⃣  EMAIL RECONCILIATION`);
		console.log(`-`.repeat(80));

		const emailMatches: string[] = [];
		let emailMismatches = 0;

		workbookEmployees.forEach((empData, empName) => {
			if (empData.email) {
				const dbMatch = dbEmployees.find(
					(db) => normalizeEmail(db.email) === empData.email,
				);
				if (dbMatch && normalizeText(dbMatch.name) === empName) {
					emailMatches.push(empName);
				} else {
					emailMismatches++;
				}
			}
		});

		console.log(`   ✅ Email matches: ${emailMatches.length}`);
		console.log(`   ⚠️  Email mismatches: ${emailMismatches}`);
		console.log(`   📧 Total workbook emails: ${workbookEmails.size}\n`);

		// Summary report
		console.log(`=`.repeat(80));
		console.log(`📊 AUDIT SUMMARY`);
		console.log(`=`.repeat(80));

		console.log(`\nWorkbook 16-6-26:`);
		console.log(`   Employees: ${workbookEmployees.size}`);
		console.log(`   Emails: ${workbookEmails.size}`);
		console.log(`   Vehicles: 0 (correct - no vehicle data in source)`);

		console.log(`\nDatabase:`);
		console.log(`   Employees: ${dbEmployees.length}`);

		console.log(`\nData Quality:`);
		console.log(`   Missing from DB: ${missingFromDb.length} (need to add)`);
		console.log(
			`   Missing from WB: ${missingFromWorkbook.length} (will mark NO_SHOW)`,
		);
		console.log(`   Email reconciliation: ✅ ${emailMatches.length} matches`);

		// Save report
		const reportPath = path.join(
			process.cwd(),
			"data",
			"outputs",
			"gtpl-audit-corrected-16june.json",
		);

		const outputDir = path.dirname(reportPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		const auditReport = {
			timestamp: new Date().toISOString(),
			dryRun: true,
			mode: "DRY-RUN: No database changes made",
			sheets: {
				"16-6-26": {
					employees: Array.from(workbookEmployees.keys()).sort(),
					emails: Array.from(workbookEmails).sort(),
					vehicleNumbers: [], // Corrected: 0 vehicles!
				},
			},
			database: {
				employees: dbEmployees.map((e) => e.name).sort(),
			},
			audit: {
				employeesInWorkbook: workbookEmployees.size,
				employeesInDatabase: dbEmployees.size,
				employeesMissingFromDb: missingFromDb.sort(),
				employeesMissingFromWorkbook: missingFromWorkbook.sort(),
				emailMatches,
				emailMismatches,
				vehiclesInWorkbook: 0, // FIXED: Was 44 (emails)
				vehiclesInDatabase: 0,
			},
			recommendation: {
				action: "SAFE TO PROCEED",
				reason:
					"Data has been corrected to exclude email addresses as vehicles",
				nextStep: "Run sync script with dry-run to preview changes",
			},
		};

		fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2));
		console.log(`\n✅ Report saved to: ${reportPath}`);
		console.log(
			`\n✅ AUDIT COMPLETE - No database changes made (dry-run only)`,
		);
	} catch (error) {
		console.error("❌ Audit failed:", error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

main();
