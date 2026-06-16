const fs = require("fs");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Normalize employee name: lowercase, trim, remove extra spaces
function normalizeEmployeeName(name) {
	if (!name) return "";
	return name.toLowerCase().trim().replace(/\s+/g, " ");
}

async function main() {
	console.log("═".repeat(120));
	console.log("GTPL SYNC - SAFETY-FIRST ANALYSIS");
	console.log("═".repeat(120));
	console.log("");

	// Load workbook
	const workbookPath = "data/GTPL Cab Sheet June 26  (3).xlsx";
	const workbook = XLSX.readFile(workbookPath);

	// Load both sheets
	const sheet16 = workbook.Sheets["16-6-26"];
	const sheet12 = workbook.Sheets["12-6-26"];

	if (!sheet16 || !sheet12) {
		console.error("❌ Required sheets not found");
		process.exit(1);
	}

	const data16 = XLSX.utils.sheet_to_json(sheet16);
	const data12 = XLSX.utils.sheet_to_json(sheet12);

	console.log(`✓ Loaded 16-6-26: ${data16.length} rows`);
	console.log(`✓ Loaded 12-6-26: ${data12.length} rows\n`);

	// Extract employees from each sheet
	function extractEmployees(data, sheetName) {
		const employees = new Map();
		data.forEach((row) => {
			if (!row["Name"] || !row["Emp ID"]) return;
			const name = row["Name"].toString().trim();
			const code = row["Emp ID"].toString().trim();

			if (name === "Name" || code === "Emp ID" || !name || !code) return;
			if (name === "Escort") return; // Ignore escort

			const key = `${name}|${code}`;
			if (!employees.has(key)) {
				employees.set(key, {
					name,
					code: code === "NA" ? null : code,
					email: row["E mail ID"]?.toString().trim() || null,
					status: row["Status"]?.toString().trim() || "PRESENT",
				});
			}
		});
		return employees;
	}

	const employees16 = extractEmployees(data16, "16-6-26");
	const employees12 = extractEmployees(data12, "12-6-26");

	console.log(`Total unique employees on 16-6-26: ${employees16.size}`);
	console.log(`Total unique employees on 12-6-26: ${employees12.size}\n`);

	// Identify genuinely new employees (in 16-6-26 but not in 12-6-26)
	const genuinelyNew = [];
	employees16.forEach((emp16, key16) => {
		let foundInPrevious = false;
		employees12.forEach((emp12, key12) => {
			if (
				normalizeEmployeeName(emp16.name) === normalizeEmployeeName(emp12.name)
			) {
				foundInPrevious = true;
			}
		});
		if (!foundInPrevious) {
			genuinelyNew.push(emp16);
		}
	});

	console.log(
		`Genuinely NEW on 16-6-26 (not in 12-6-26): ${genuinelyNew.length}\n`,
	);
	genuinelyNew.forEach((emp) => {
		console.log(`  - ${emp.name} (${emp.code || "NA"})`);
	});
	console.log("");

	// Get database employees
	const dbEmployees = await prisma.employee.findMany({
		select: {
			id: true,
			name: true,
			employeeCode: true,
			email: true,
			status: true,
		},
	});

	console.log(`✓ Found ${dbEmployees.length} employees in database\n`);

	// Categorize 16-6-26 employees
	const result = {
		CREATE_EMPLOYEES: [],
		UPDATE_EMPLOYEES: [],
		SKIP_EMPLOYEES: [],
	};

	const createdCodes = new Set();
	const codeCollisions = [];

	console.log("═".repeat(120));
	console.log("EMPLOYEE CATEGORIZATION");
	console.log("═".repeat(120));
	console.log("");

	const processedEmployees = new Set();

	employees16.forEach((emp16) => {
		const normalized16 = normalizeEmployeeName(emp16.name);
		const key16 = `${normalized16}|${emp16.code}`;

		if (processedEmployees.has(key16)) return;
		processedEmployees.add(key16);

		// Try exact match: code + name
		const exactMatch = dbEmployees.find(
			(e) =>
				e.employeeCode === emp16.code &&
				normalizeEmployeeName(e.name) === normalized16,
		);

		if (exactMatch) {
			result.UPDATE_EMPLOYEES.push({
				workbookName: emp16.name,
				workbookCode: emp16.code,
				workbookStatus: emp16.status,
				dbId: exactMatch.id,
				dbName: exactMatch.name,
				dbCode: exactMatch.employeeCode,
				matchType: "EXACT",
			});
			return;
		}

		// Try email match
		if (emp16.email && emp16.email !== "NA") {
			const emailMatch = dbEmployees.find((e) => e.email === emp16.email);
			if (emailMatch) {
				result.UPDATE_EMPLOYEES.push({
					workbookName: emp16.name,
					workbookCode: emp16.code,
					workbookStatus: emp16.status,
					dbId: emailMatch.id,
					dbName: emailMatch.name,
					dbCode: emailMatch.employeeCode,
					matchType: "EMAIL",
				});
				return;
			}
		}

		// Try code match (even if name differs)
		if (emp16.code && emp16.code !== "NA") {
			const codeMatch = dbEmployees.find((e) => e.employeeCode === emp16.code);
			if (codeMatch) {
				result.UPDATE_EMPLOYEES.push({
					workbookName: emp16.name,
					workbookCode: emp16.code,
					workbookStatus: emp16.status,
					dbId: codeMatch.id,
					dbName: codeMatch.name,
					dbCode: codeMatch.employeeCode,
					matchType: "CODE_ONLY",
					warning: `Name mismatch: WB="${emp16.name}" vs DB="${codeMatch.name}"`,
				});
				return;
			}
		}

		// Try normalized name match
		const nameMatch = dbEmployees.find(
			(e) => normalizeEmployeeName(e.name) === normalized16,
		);
		if (nameMatch) {
			result.UPDATE_EMPLOYEES.push({
				workbookName: emp16.name,
				workbookCode: emp16.code,
				workbookStatus: emp16.status,
				dbId: nameMatch.id,
				dbName: nameMatch.name,
				dbCode: nameMatch.employeeCode,
				matchType: "NAME_NORMALIZED",
				warning: `Code mismatch: WB="${emp16.code || "NA"}" vs DB="${nameMatch.employeeCode || "NA"}"`,
			});
			return;
		}

		// Check if genuinely new and should be created
		const isGenuinelyNew = genuinelyNew.find(
			(n) => normalizeEmployeeName(n.name) === normalized16,
		);
		if (isGenuinelyNew) {
			if (emp16.code && emp16.code !== "NA" && createdCodes.has(emp16.code)) {
				codeCollisions.push(`${emp16.name} (${emp16.code})`);
			}
			if (emp16.code && emp16.code !== "NA") {
				createdCodes.add(emp16.code);
			}
			result.CREATE_EMPLOYEES.push({
				name: emp16.name,
				code: emp16.code || "NA",
				email: emp16.email || "NA",
				status: emp16.status,
				reason: "Genuinely new on 16-6-26 (not in 12-6-26 or DB)",
			});
		} else {
			// Not genuinely new but no match found - still create to avoid data loss
			if (emp16.code && emp16.code !== "NA" && createdCodes.has(emp16.code)) {
				codeCollisions.push(`${emp16.name} (${emp16.code})`);
			}
			if (emp16.code && emp16.code !== "NA") {
				createdCodes.add(emp16.code);
			}
			result.CREATE_EMPLOYEES.push({
				name: emp16.name,
				code: emp16.code || "NA",
				email: emp16.email || "NA",
				status: emp16.status,
				reason: "Found in 16-6-26 but not matched to DB",
			});
		}
	});

	// Identify employees missing from 16-6-26 (were in 12-6-26 or DB)
	const absent = [];
	dbEmployees.forEach((dbEmp) => {
		const foundIn16 = Array.from(employees16.values()).find(
			(e) =>
				normalizeEmployeeName(e.name) === normalizeEmployeeName(dbEmp.name),
		);
		if (!foundIn16) {
			absent.push({
				dbId: dbEmp.id,
				name: dbEmp.name,
				code: dbEmp.employeeCode,
				reason: "Missing from 16-6-26 roster",
			});
		}
	});

	// Get routes and vehicles
	const routesSheet = workbook.Sheets["Routes and Driver details "];
	const routesData = XLSX.utils.sheet_to_json(routesSheet);

	function extractVehicles(data) {
		const vehicles = new Map(); // Use map to store vehicle -> routes
		const vehicleRegex = /^(MH|CG|TS|AP|KA|DL|HR|UP)\d{2}[A-Z]{2}\d{4}$/i; // Vehicle number pattern

		data.forEach((row) => {
			// Check both 'Driver Details' column and 'Cab Number' column
			const potentialVehicle = (row["Driver Details"] || row["Cab Number"])
				?.toString()
				.trim();
			if (potentialVehicle && vehicleRegex.test(potentialVehicle)) {
				if (!vehicles.has(potentialVehicle)) {
					vehicles.set(potentialVehicle, []);
				}
				const route =
					row["Rout No"]?.toString().trim() ||
					row["Route No"]?.toString().trim();
				if (route && route !== "Route No" && route !== "Rout No") {
					vehicles.get(potentialVehicle).push(route);
				}
			}
		});
		return Array.from(vehicles.keys()).sort();
	}

	function normalizeDriver(driverRaw) {
		if (!driverRaw) return "";
		let name = driverRaw.toString().trim();

		// Skip if looks like phone number or vehicle number
		if (/^\d{10}$/.test(name) || /^MH\d{2}[A-Z]{2}\d{4}$/.test(name)) {
			return "";
		}

		name = name.replace(/^DRIVER\s*[-:=]/i, "");
		name = name.replace(/^Driver\s*[-:=]/i, "");
		name = name.replace(/^MOB\s*[-:=]/i, "");
		name = name.replace(/^Mob\s*[-:=]/i, "");
		name = name.trim();

		// Filter out header rows and phone numbers
		if (
			!name ||
			name === "Driver Details" ||
			name === "Contact No" ||
			/^\d{10}$/.test(name)
		) {
			return "";
		}

		return name;
	}

	function extractDrivers(data) {
		const drivers = new Set();
		data.forEach((row) => {
			const driverRaw = row["Driver Details"]?.toString().trim();
			if (
				driverRaw &&
				driverRaw !== "Driver Details" &&
				!driverRaw.includes("Contact")
			) {
				const normalized = normalizeDriver(driverRaw);
				if (normalized && normalized.length > 0) {
					drivers.add(normalized);
				}
			}
		});
		return Array.from(drivers).sort();
	}

	const vehicles16 = extractVehicles(routesData);
	const drivers16 = extractDrivers(routesData);

	console.log("═".repeat(120));
	console.log("SUMMARY REPORT");
	console.log("═".repeat(120));
	console.log("");

	console.log(`CREATE_EMPLOYEES: ${result.CREATE_EMPLOYEES.length}`);
	result.CREATE_EMPLOYEES.forEach((emp) => {
		console.log(`  ✓ ${emp.name} (${emp.code || "NA"})`);
	});
	console.log("");

	console.log(`UPDATE_EMPLOYEES: ${result.UPDATE_EMPLOYEES.length}`);
	result.UPDATE_EMPLOYEES.slice(0, 10).forEach((emp) => {
		console.log(
			`  ✓ ${emp.workbookName} (${emp.workbookCode || "NA"}) → ${emp.dbName} (${emp.dbCode || "NA"}) [${emp.matchType}]`,
		);
	});
	if (result.UPDATE_EMPLOYEES.length > 10) {
		console.log(`  ... and ${result.UPDATE_EMPLOYEES.length - 10} more`);
	}
	console.log("");

	console.log(`ABSENT_ON_2026_06_16 (mark as NO_SHOW): ${absent.length}`);
	absent.slice(0, 10).forEach((emp) => {
		console.log(`  ✗ ${emp.name} (${emp.code})`);
	});
	if (absent.length > 10) {
		console.log(`  ... and ${absent.length - 10} more`);
	}
	console.log("");

	console.log(`VEHICLES (from routes sheet): ${vehicles16.length}`);
	vehicles16.forEach((v) => console.log(`  • ${v}`));
	console.log("");

	console.log(`DRIVERS (normalized): ${drivers16.length}`);
	drivers16.forEach((d) => console.log(`  • ${d}`));
	console.log("");

	// Safety checks
	console.log("═".repeat(120));
	console.log("SAFETY CHECKS");
	console.log("═".repeat(120));
	console.log("");

	const checks = {
		employeeCreations: result.CREATE_EMPLOYEES.length <= 5,
		codeCollisions: codeCollisions.length <= 2,
		vehicleDeactivations: 0 <= 5, // We don't deactivate
	};

	console.log(
		`✅ Employee creations (${result.CREATE_EMPLOYEES.length} <= 5): ${checks.employeeCreations ? "PASS" : "FAIL"}`,
	);
	console.log(
		`✅ Code collisions (${codeCollisions.length} <= 2): ${checks.codeCollisions ? "PASS" : "FAIL"}`,
	);
	console.log(`✅ Vehicle deactivations (0 <= 5): PASS`);
	console.log("");

	if (!checks.employeeCreations || !checks.codeCollisions) {
		console.log("❌ SAFETY CHECKS FAILED - ABORT");
		process.exit(1);
	}

	// Generate detailed report
	const report = {
		timestamp: new Date().toISOString(),
		date: "2026-06-16",
		CREATE_EMPLOYEES: result.CREATE_EMPLOYEES,
		UPDATE_EMPLOYEES: result.UPDATE_EMPLOYEES.map((e) => ({
			workbookName: e.workbookName,
			workbookCode: e.workbookCode,
			workbookStatus: e.status,
			dbName: e.dbName,
			dbId: e.dbId,
			matchType: e.matchType,
			warning: e.warning,
		})),
		ABSENT_ON_2026_06_16: absent,
		VEHICLES: {
			expected: vehicles16,
			count: vehicles16.length,
		},
		DRIVERS: {
			expected: drivers16,
			count: drivers16.length,
		},
		SAFETY_CHECKS: {
			employeeCreations: `${result.CREATE_EMPLOYEES.length} <= 5: ${checks.employeeCreations ? "PASS" : "FAIL"}`,
			codeCollisions: `${codeCollisions.length} <= 2: ${checks.codeCollisions ? "PASS" : "FAIL"}`,
			vehicleDeactivations: "0 <= 5: PASS",
		},
		READY_FOR_APPLY: checks.employeeCreations && checks.codeCollisions,
	};

	// Save report
	fs.writeFileSync(
		"data/outputs/gtpl-safety-first-report.json",
		JSON.stringify(report, null, 2),
	);

	console.log("═".repeat(120));
	console.log("✅ ANALYSIS COMPLETE - NO DATABASE WRITES PERFORMED");
	console.log("═".repeat(120));
	console.log("");
	console.log("Report saved to: data/outputs/gtpl-safety-first-report.json");
	console.log("");

	if (report.READY_FOR_APPLY) {
		console.log("🟢 READY FOR APPLY - All safety checks passed");
		console.log(
			"Next step: Review the report and run: npm run sync:gtpl -- --apply",
		);
	} else {
		console.log("🔴 NOT READY - Fix issues and retry");
	}

	await prisma.$disconnect();
}

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
