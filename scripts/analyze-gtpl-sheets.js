const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

function normalizePhone(phone) {
	return phone?.toString()?.trim()?.toUpperCase() || "";
}

function normalizeVehicle(vehicle) {
	return vehicle?.toString()?.trim()?.toUpperCase() || "";
}

function normalizeEmployee(name) {
	return name?.toString()?.trim()?.toUpperCase() || "";
}

function parseSheet(workbook, sheetName) {
	const ws = workbook.Sheets[sheetName];
	if (!ws) {
		console.error(`❌ Sheet "${sheetName}" not found`);
		return {
			employees: new Set(),
			employeeNames: new Map(),
			vehicles: new Set(),
			employeeDetails: new Map(),
		};
	}

	const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
	console.log(`\n📊 Parsing sheet: ${sheetName}`);
	console.log(`   Total rows: ${rows.length}`);

	const employees = new Set();
	const employeeNames = new Map();
	const vehicles = new Set();
	const employeeDetails = new Map();

	// Parse header to find column indices
	let headerRow = rows[0];
	let empNameCol = -1;
	let phoneCol = -1;
	let vehicleCol = -1;
	let driverCol = -1;
	let shiftCol = -1;

	for (let i = 0; i < headerRow.length; i++) {
		const col = normalizeEmployee(headerRow[i]);
		if (col.includes("NAME") || col.includes("EMPLOYEE")) empNameCol = i;
		else if (col.includes("PHONE") || col.includes("MOBILE")) phoneCol = i;
		else if (col.includes("VEHICLE") || col.includes("CAB")) vehicleCol = i;
		else if (col.includes("DRIVER")) driverCol = i;
		else if (col.includes("SHIFT")) shiftCol = i;
	}

	console.log(
		`   Columns detected: NAME=${empNameCol}, PHONE=${phoneCol}, VEHICLE=${vehicleCol}, DRIVER=${driverCol}, SHIFT=${shiftCol}`,
	);

	// Parse data rows
	let validRows = 0;
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (!row || row.length < 2) continue;

		const empName = normalizeEmployee(row[empNameCol]);
		if (!empName || empName === "NAME") continue;

		const phone = normalizePhone(row[phoneCol] || "");
		const vehicle = normalizeVehicle(row[vehicleCol] || "");
		const driver = normalizeEmployee(row[driverCol] || "");
		const shift = normalizeEmployee(row[shiftCol] || "");

		// Store employee (use name as unique key)
		employees.add(empName);
		employeeNames.set(empName, row[empNameCol]); // Keep original casing

		// Store vehicle if present
		if (vehicle) {
			vehicles.add(vehicle);
		}

		// Store detailed information
		employeeDetails.set(empName, {
			name: row[empNameCol],
			phone: phone || undefined,
			vehicle: vehicle || undefined,
			driver: driver || undefined,
			shift: shift || undefined,
		});

		validRows++;
	}

	console.log(`   Valid employee rows: ${validRows}`);
	console.log(`   Unique employees: ${employees.size}`);
	console.log(`   Unique vehicles: ${vehicles.size}`);

	return {
		employees,
		employeeNames,
		vehicles,
		employeeDetails,
	};
}

async function main() {
	const excelPath = path.join(
		process.cwd(),
		"data",
		"GTPL Cab Sheet June 26  (3).xlsx",
	);

	console.log("=".repeat(60));
	console.log("PHASE 1: GTPL WORKBOOK ANALYSIS");
	console.log("=".repeat(60));

	if (!fs.existsSync(excelPath)) {
		console.error(`❌ Excel file not found: ${excelPath}`);
		process.exit(1);
	}

	console.log(`\n📂 Reading workbook: ${excelPath}`);
	const workbook = XLSX.readFile(excelPath);

	console.log(`\n📋 Available sheets in workbook:`);
	workbook.SheetNames.forEach((sheet) => {
		console.log(`   - ${sheet}`);
	});

	// Parse both sheets
	const data12 = parseSheet(workbook, "12-6-26");
	const data16 = parseSheet(workbook, "16-6-26");

	// ========== COMPARISON REPORT ==========
	console.log("\n" + "=".repeat(60));
	console.log("📊 COMPARISON REPORT: 12-6-26 vs 16-6-26");
	console.log("=".repeat(60));

	// Employees present on 16-Jun but not on 12-Jun
	console.log("\n1️⃣  EMPLOYEES PRESENT ON 16-JUN BUT NOT ON 12-JUN:");
	console.log("-".repeat(60));
	const newEmployees = [];
	data16.employees.forEach((emp) => {
		if (!data12.employees.has(emp)) {
			newEmployees.push(emp);
			const details = data16.employeeDetails.get(emp);
			console.log(
				`   ✅ ${emp} (${details?.vehicle || "no vehicle"}, ${details?.shift || "no shift"})`,
			);
		}
	});
	console.log(`   Total NEW: ${newEmployees.length}`);

	// Employees present on 12-Jun but not on 16-Jun
	console.log("\n2️⃣  EMPLOYEES PRESENT ON 12-JUN BUT NOT ON 16-JUN:");
	console.log("-".repeat(60));
	const removedEmployees = [];
	data12.employees.forEach((emp) => {
		if (!data16.employees.has(emp)) {
			removedEmployees.push(emp);
			const details = data12.employeeDetails.get(emp);
			console.log(
				`   ❌ ${emp} (${details?.vehicle || "no vehicle"}, ${details?.shift || "no shift"})`,
			);
		}
	});
	console.log(`   Total REMOVED: ${removedEmployees.length}`);

	// Employees present on both dates
	console.log("\n3️⃣  EMPLOYEES PRESENT ON BOTH DATES:");
	console.log("-".repeat(60));
	const commonEmployees = [];
	data12.employees.forEach((emp) => {
		if (data16.employees.has(emp)) {
			commonEmployees.push(emp);
		}
	});
	console.log(`   Total COMMON: ${commonEmployees.length}`);
	console.log(`   (showing first 5)`);
	commonEmployees.slice(0, 5).forEach((emp) => {
		const details12 = data12.employeeDetails.get(emp);
		const details16 = data16.employeeDetails.get(emp);
		console.log(`   ➡️  ${emp}`);
		console.log(`       12-Jun: ${details12?.vehicle || "no vehicle"}`);
		console.log(`       16-Jun: ${details16?.vehicle || "no vehicle"}`);
	});

	// Vehicle differences
	console.log("\n4️⃣  VEHICLE DIFFERENCES:");
	console.log("-".repeat(60));

	const newVehicles = [];
	data16.vehicles.forEach((veh) => {
		if (!data12.vehicles.has(veh)) {
			newVehicles.push(veh);
			console.log(`   ✅ NEW: ${veh}`);
		}
	});
	console.log(`   Total NEW: ${newVehicles.length}`);

	const removedVehicles = [];
	data12.vehicles.forEach((veh) => {
		if (!data16.vehicles.has(veh)) {
			removedVehicles.push(veh);
			console.log(`   ❌ REMOVED: ${veh}`);
		}
	});
	console.log(`   Total REMOVED: ${removedVehicles.length}`);

	// Summary
	console.log("\n" + "=".repeat(60));
	console.log("📈 SUMMARY");
	console.log("=".repeat(60));
	console.log(`12-Jun Employees: ${data12.employees.size}`);
	console.log(`16-Jun Employees: ${data16.employees.size}`);
	console.log(
		`   Difference: ${data16.employees.size - data12.employees.size}`,
	);
	console.log(`\n12-Jun Vehicles: ${data12.vehicles.size}`);
	console.log(`16-Jun Vehicles: ${data16.vehicles.size}`);
	console.log(`   Difference: ${data16.vehicles.size - data12.vehicles.size}`);

	// Save report to file
	const reportData = {
		timestamp: new Date().toISOString(),
		sheets: {
			"12-6-26": {
				employees: Array.from(data12.employees).sort(),
				vehicles: Array.from(data12.vehicles).sort(),
			},
			"16-6-26": {
				employees: Array.from(data16.employees).sort(),
				vehicles: Array.from(data16.vehicles).sort(),
			},
		},
		comparison: {
			newEmployees: newEmployees.sort(),
			removedEmployees: removedEmployees.sort(),
			newVehicles: newVehicles.sort(),
			removedVehicles: removedVehicles.sort(),
			commonEmployees: commonEmployees.sort(),
		},
	};

	const reportPath = path.join(
		process.cwd(),
		"data",
		"outputs",
		"gtpl-sheets-analysis-report.json",
	);

	// Ensure output directory exists
	const outputDir = path.dirname(reportPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
	console.log(`\n✅ Report saved to: ${reportPath}`);

	console.log("\n" + "=".repeat(60));
	console.log("✅ PHASE 1 ANALYSIS COMPLETE");
	console.log("=".repeat(60));
}

main().catch((err) => {
	console.error("❌ Error:", err);
	process.exit(1);
});
