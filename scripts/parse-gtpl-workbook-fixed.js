const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

// Fleet pattern validation
const VALID_VEHICLE_PATTERNS = [
	/^MH\d+[A-Z]+\d+$/, // MH49BZ0910
	/^CG\d+[A-Z]+\d+$/, // Gujarat plates
	/^TS\d+[A-Z]+\d+$/, // Telangana plates
	/^AP\d+[A-Z]+\d+$/, // Andhra Pradesh plates
	/^DL\d+[A-Z]+\d+$/, // Delhi plates
];

// Normalization functions
function normalizeText(text) {
	return text?.toString()?.trim()?.toUpperCase() || "";
}

function normalizeEmail(email) {
	return email?.toString()?.trim()?.toLowerCase() || "";
}

function normalizePhone(phone) {
	return (
		phone
			?.toString()
			?.trim()
			?.replace(/[^\d+]/g, "") || ""
	);
}

function normalizeVehicle(vehicle) {
	return vehicle?.toString()?.trim()?.toUpperCase() || "";
}

// Validate vehicle number format
function isValidVehicle(vehicleStr) {
	if (!vehicleStr) return false;
	const normalized = normalizeVehicle(vehicleStr);

	// Check if it matches any valid pattern
	return VALID_VEHICLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

// Detect if a string is likely an email
function isEmail(str) {
	if (!str) return false;
	const normalized = normalizeEmail(str);
	return normalized.includes("@");
}

// Detect if a string is likely a phone number
function isPhone(str) {
	if (!str) return false;
	const normalized = normalizePhone(str);
	return normalized.length >= 10 && /^\d+$/.test(normalized);
}

// Column detection with diagnostics
function detectColumns(headerRow) {
	const columnDiagnostics = [];
	const detectedColumns = {
		employeeName: -1,
		email: -1,
		phone: -1,
		vehicle: -1,
		driver: -1,
		shift: -1,
	};

	for (let i = 0; i < headerRow.length; i++) {
		const header = normalizeText(headerRow[i]);
		const diag = {
			index: i,
			header: headerRow[i] || `[COLUMN ${i}]`,
			normalized: header,
			classification: "UNKNOWN",
			confidence: 0,
		};

		// Match employee name
		if (
			header.includes("NAME") ||
			header.includes("EMPLOYEE") ||
			header.includes("ENAME")
		) {
			if (!(header.includes("DRIVER") && header.includes("NAME"))) {
				detectedColumns.employeeName = i;
				diag.classification = "EMPLOYEE_NAME";
				diag.confidence = 100;
			}
		}
		// Match email
		else if (
			header.includes("EMAIL") ||
			header.includes("MAIL") ||
			header.includes("@")
		) {
			detectedColumns.email = i;
			diag.classification = "EMAIL";
			diag.confidence = 100;
		}
		// Match phone
		else if (
			header.includes("PHONE") ||
			header.includes("MOBILE") ||
			header.includes("MOB") ||
			header.includes("CONTACT")
		) {
			detectedColumns.phone = i;
			diag.classification = "PHONE";
			diag.confidence = 100;
		}
		// Match vehicle
		else if (
			header.includes("VEHICLE") ||
			header.includes("CAB") ||
			header.includes("PLATE")
		) {
			detectedColumns.vehicle = i;
			diag.classification = "VEHICLE_NUMBER";
			diag.confidence = 100;
		}
		// Match driver
		else if (header.includes("DRIVER")) {
			detectedColumns.driver = i;
			diag.classification = "DRIVER_NAME";
			diag.confidence = 100;
		}
		// Match shift
		else if (header.includes("SHIFT") || header.includes("ROUTE")) {
			detectedColumns.shift = i;
			diag.classification = "SHIFT_ROUTE";
			diag.confidence = 100;
		}

		columnDiagnostics.push(diag);
	}

	return { detectedColumns, columnDiagnostics };
}

// Parse sheet with comprehensive extraction
function parseSheet(workbook, sheetName) {
	const ws = workbook.Sheets[sheetName];
	if (!ws) {
		console.error(`❌ Sheet "${sheetName}" not found`);
		return null;
	}

	const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
	console.log(`\n📊 Parsing sheet: ${sheetName}`);
	console.log(`   Total rows in sheet: ${rows.length}`);

	// Detect columns
	const headerRow = rows[0];
	const { detectedColumns, columnDiagnostics } = detectColumns(headerRow);

	console.log(`\n   📋 COLUMN DETECTION:`);
	columnDiagnostics.forEach((diag) => {
		console.log(
			`      Column ${diag.index}: "${diag.header}" -> ${diag.classification} (${diag.confidence}%)`,
		);
	});

	// Container for extracted data
	const extracted = {
		employees: new Map(), // name -> { email, phone, vehicle, driver, shift }
		vehicleNumbers: new Set(),
		emails: new Map(), // email -> name
		drivers: new Map(), // driver name -> { phone, vehicle }
		diagnostics: {
			blankRows: 0,
			skipRows: [],
			duplicateNames: [],
			invalidVehicles: [],
			invalidEmails: [],
			rowsProcessed: 0,
		},
	};

	// Parse data rows
	let rowNum = 0;
	for (let i = 1; i < rows.length; i++) {
		rowNum = i;
		const row = rows[i];

		// Skip blank rows
		if (!row || row.length < 2 || row.every((cell) => !cell)) {
			extracted.diagnostics.blankRows++;
			continue;
		}

		// Extract data based on detected columns
		const empName = normalizeText(row[detectedColumns.employeeName] || "");
		const email = normalizeEmail(row[detectedColumns.email] || "");
		const phone = normalizePhone(row[detectedColumns.phone] || "");
		const vehicleRaw = row[detectedColumns.vehicle] || "";
		const driver = normalizeText(row[detectedColumns.driver] || "");
		const shift = normalizeText(row[detectedColumns.shift] || "");

		// Skip header rows
		if (empName === "NAME" || empName === "ENAME") {
			extracted.diagnostics.skipRows.push({
				row: i,
				reason: "HEADER_ROW",
				data: empName,
			});
			continue;
		}

		// Skip empty names
		if (!empName) {
			extracted.diagnostics.skipRows.push({
				row: i,
				reason: "NO_EMPLOYEE_NAME",
			});
			continue;
		}

		// Skip "ESCORT" special row (not a real employee)
		if (empName === "ESCORT") {
			extracted.diagnostics.skipRows.push({ row: i, reason: "ESCORT_ROW" });
			continue;
		}

		// Check for duplicate employee name
		if (extracted.employees.has(empName)) {
			extracted.diagnostics.duplicateNames.push({
				name: empName,
				row: i,
				previousRow: "See extracted data",
			});
			continue; // Skip duplicates
		}

		// Validate vehicle number (only if it looks like one, not an email)
		let vehicleNumber = "";
		if (vehicleRaw && !isEmail(vehicleRaw)) {
			vehicleNumber = normalizeVehicle(vehicleRaw);
			if (vehicleNumber && !isValidVehicle(vehicleNumber)) {
				extracted.diagnostics.invalidVehicles.push({
					row: i,
					employee: empName,
					value: vehicleRaw,
					normalized: vehicleNumber,
					reason: "Does not match MH*, CG*, TS*, AP* pattern",
				});
				vehicleNumber = ""; // Don't store invalid vehicles
			} else if (vehicleNumber && isValidVehicle(vehicleNumber)) {
				extracted.vehicleNumbers.add(vehicleNumber);
			}
		}

		// Validate email (must contain @)
		if (email && !isEmail(email)) {
			extracted.diagnostics.invalidEmails.push({
				row: i,
				employee: empName,
				value: row[detectedColumns.email],
				reason: "Missing @ symbol",
			});
		} else if (email) {
			extracted.emails.set(email, empName);
		}

		// Store employee record
		extracted.employees.set(empName, {
			name: row[detectedColumns.employeeName] || empName, // Keep original casing
			email,
			phone,
			vehicle: vehicleNumber,
			driver,
			shift,
			rowNumber: i,
		});

		// Store driver info if available
		if (driver && driver !== "NA") {
			extracted.drivers.set(driver, {
				phone,
				vehicle: vehicleNumber,
				employee: empName,
			});
		}

		extracted.diagnostics.rowsProcessed++;
	}

	console.log(
		`   Valid rows processed: ${extracted.diagnostics.rowsProcessed}`,
	);
	console.log(`   Blank rows skipped: ${extracted.diagnostics.blankRows}`);
	console.log(`   Skipped rows: ${extracted.diagnostics.skipRows.length}`);
	console.log(
		`   Duplicate employees: ${extracted.diagnostics.duplicateNames.length}`,
	);
	console.log(
		`   Invalid vehicles: ${extracted.diagnostics.invalidVehicles.length}`,
	);
	console.log(
		`   Invalid emails: ${extracted.diagnostics.invalidEmails.length}`,
	);
	console.log(`   Unique employees: ${extracted.employees.size}`);
	console.log(`   Unique vehicles: ${extracted.vehicleNumbers.size}`);
	console.log(`   Unique emails: ${extracted.emails.size}`);
	console.log(`   Unique drivers: ${extracted.drivers.size}`);

	return extracted;
}

// Fuzzy match employee names
function fuzzyMatchEmployee(name, candidates, threshold = 0.7) {
	const normalized = normalizeText(name);
	const words = normalized.split(/\s+/);

	const scores = candidates.map((candidate) => {
		const candNorm = normalizeText(candidate);
		const candWords = candNorm.split(/\s+/);

		// Exact match
		if (candNorm === normalized) return { name: candidate, score: 1.0 };

		// Check if all words from name are in candidate (partial match)
		const matchedWords = words.filter((word) =>
			candWords.some((cword) => cword.includes(word) || word.includes(cword)),
		);
		const partialScore =
			matchedWords.length / Math.max(words.length, candWords.length);

		return { name: candidate, score: partialScore };
	});

	// Find best match above threshold
	const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
	return best.score >= threshold ? best : null;
}

// Main processing
async function main() {
	const excelPath = path.join(
		process.cwd(),
		"data",
		"GTPL Cab Sheet June 26  (3).xlsx",
	);

	console.log("=".repeat(80));
	console.log("PHASE 1 FIXED: GTPL WORKBOOK ANALYSIS - CORRECTED PARSER");
	console.log("=".repeat(80));

	if (!fs.existsSync(excelPath)) {
		console.error(`❌ Excel file not found: ${excelPath}`);
		process.exit(1);
	}

	console.log(`\n📂 Reading workbook: ${excelPath}`);
	const workbook = XLSX.readFile(excelPath);

	console.log(`\n📋 Available sheets:`);
	workbook.SheetNames.forEach((sheet) => console.log(`   - ${sheet}`));

	// Parse both sheets
	const data12 = parseSheet(workbook, "12-6-26");
	const data16 = parseSheet(workbook, "16-6-26");

	if (!data12 || !data16) {
		console.error("❌ Failed to parse sheets");
		process.exit(1);
	}

	// ========== COMPREHENSIVE REPORT ==========
	console.log("\n" + "=".repeat(80));
	console.log("📊 CORRECTED ANALYSIS REPORT: 12-6-26 vs 16-6-26");
	console.log("=".repeat(80));

	// Employee comparison
	console.log("\n1️⃣  NEW EMPLOYEES ON 16-JUN:");
	console.log("-".repeat(80));
	const newEmployees = [];
	data16.employees.forEach((details, empName) => {
		if (!data12.employees.has(empName)) {
			newEmployees.push(empName);
			console.log(`   ✅ ${empName}`);
			if (details.email) console.log(`      📧 ${details.email}`);
			if (details.vehicle) console.log(`      🚗 ${details.vehicle}`);
		}
	});
	console.log(`   Total: ${newEmployees.length}`);

	console.log("\n2️⃣  REMOVED EMPLOYEES (IN 12-JUN BUT NOT 16-JUN):");
	console.log("-".repeat(80));
	const removedEmployees = [];
	data12.employees.forEach((details, empName) => {
		if (!data16.employees.has(empName)) {
			removedEmployees.push(empName);
			console.log(`   ❌ ${empName}`);
			if (details.email) console.log(`      📧 ${details.email}`);
			if (details.vehicle) console.log(`      🚗 ${details.vehicle}`);
		}
	});
	console.log(`   Total: ${removedEmployees.length}`);

	// Vehicle comparison
	console.log("\n3️⃣  NEW VEHICLES ON 16-JUN:");
	console.log("-".repeat(80));
	const newVehicles = [];
	data16.vehicleNumbers.forEach((veh) => {
		if (!data12.vehicleNumbers.has(veh)) {
			newVehicles.push(veh);
			console.log(`   ✅ ${veh}`);
		}
	});
	console.log(`   Total: ${newVehicles.length}`);

	console.log("\n4️⃣  REMOVED VEHICLES (IN 12-JUN BUT NOT 16-JUN):");
	console.log("-".repeat(80));
	const removedVehicles = [];
	data12.vehicleNumbers.forEach((veh) => {
		if (!data16.vehicleNumbers.has(veh)) {
			removedVehicles.push(veh);
			console.log(`   ❌ ${veh}`);
		}
	});
	console.log(`   Total: ${removedVehicles.length}`);

	// Summary
	console.log("\n" + "=".repeat(80));
	console.log("📈 SUMMARY");
	console.log("=".repeat(80));
	console.log(`\n12-6-26 Sheet:`);
	console.log(`   Employees: ${data12.employees.size}`);
	console.log(`   Vehicles: ${data12.vehicleNumbers.size}`);
	console.log(`   Emails: ${data12.emails.size}`);

	console.log(`\n16-6-26 Sheet:`);
	console.log(`   Employees: ${data16.employees.size}`);
	console.log(`   Vehicles: ${data16.vehicleNumbers.size}`);
	console.log(`   Emails: ${data16.emails.size}`);

	console.log(`\nChanges from 12-Jun to 16-Jun:`);
	console.log(
		`   Employees: ${data16.employees.size > data12.employees.size ? "+" : ""}${data16.employees.size - data12.employees.size}`,
	);
	console.log(
		`   Vehicles: ${data16.vehicleNumbers.size > data12.vehicleNumbers.size ? "+" : ""}${data16.vehicleNumbers.size - data12.vehicleNumbers.size}`,
	);

	// Diagnostics
	console.log("\n" + "=".repeat(80));
	console.log("🔍 DIAGNOSTICS: Data Quality Issues");
	console.log("=".repeat(80));

	console.log("\n16-6-26 Sheet Diagnostics:");
	console.log(`   Blank rows: ${data16.diagnostics.blankRows}`);
	console.log(`   Skipped rows: ${data16.diagnostics.skipRows.length}`);
	if (
		data16.diagnostics.skipRows.length > 0 &&
		data16.diagnostics.skipRows.length <= 5
	) {
		data16.diagnostics.skipRows.forEach((skip) => {
			console.log(`      Row ${skip.row}: ${skip.reason}`);
		});
	}
	console.log(
		`   Duplicate names: ${data16.diagnostics.duplicateNames.length}`,
	);
	if (data16.diagnostics.duplicateNames.length > 0) {
		data16.diagnostics.duplicateNames.forEach((dup) => {
			console.log(`      ${dup.name} (row ${dup.row})`);
		});
	}
	console.log(
		`   Invalid vehicles: ${data16.diagnostics.invalidVehicles.length}`,
	);
	if (
		data16.diagnostics.invalidVehicles.length > 0 &&
		data16.diagnostics.invalidVehicles.length <= 5
	) {
		data16.diagnostics.invalidVehicles.forEach((inv) => {
			console.log(`      Row ${inv.row}: ${inv.employee} -> "${inv.value}"`);
		});
	}

	// Save detailed report
	const reportPath = path.join(
		process.cwd(),
		"data",
		"outputs",
		"gtpl-parser-diagnostics.json",
	);
	const outputDir = path.dirname(reportPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const report = {
		timestamp: new Date().toISOString(),
		status: "FIXED_PARSER",
		sheets: {
			"12-6-26": {
				employees: Array.from(data12.employees.keys()).sort(),
				employeeEmails: Array.from(data12.emails.keys()).sort(),
				vehicleNumbers: Array.from(data12.vehicleNumbers).sort(),
				summary: {
					totalEmployees: data12.employees.size,
					totalVehicles: data12.vehicleNumbers.size,
					totalEmails: data12.emails.size,
					blankRows: data12.diagnostics.blankRows,
					duplicateEmployees: data12.diagnostics.duplicateNames.length,
					invalidVehicles: data12.diagnostics.invalidVehicles.length,
				},
			},
			"16-6-26": {
				employees: Array.from(data16.employees.keys()).sort(),
				employeeEmails: Array.from(data16.emails.keys()).sort(),
				vehicleNumbers: Array.from(data16.vehicleNumbers).sort(),
				summary: {
					totalEmployees: data16.employees.size,
					totalVehicles: data16.vehicleNumbers.size,
					totalEmails: data16.emails.size,
					blankRows: data16.diagnostics.blankRows,
					duplicateEmployees: data16.diagnostics.duplicateNames.length,
					invalidVehicles: data16.diagnostics.invalidVehicles.length,
				},
			},
		},
		comparison: {
			newEmployees: newEmployees.sort(),
			removedEmployees: removedEmployees.sort(),
			newVehicles: newVehicles.sort(),
			removedVehicles: removedVehicles.sort(),
		},
		diagnostics: {
			"16-6-26": data16.diagnostics,
		},
	};

	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
	console.log(`\n✅ Report saved to: ${reportPath}`);

	return report;
}

main().catch(console.error);
