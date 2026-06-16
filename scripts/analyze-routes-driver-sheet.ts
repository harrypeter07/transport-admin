const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function analyzeGTPLData() {
	console.log("=".repeat(100));
	console.log(
		"COMPREHENSIVE GTPL DATA ANALYSIS - ROUTES & DRIVER DETAILS SHEET",
	);
	console.log("=".repeat(100));

	const workbookPath = path.join(
		__dirname,
		"../data",
		"GTPL Cab Sheet June 26  (3).xlsx",
	);
	const wb = XLSX.readFile(workbookPath);

	// Parse Routes and Driver details sheet
	const routesSheetName = "Routes and Driver details "; // Note: has trailing space
	const ws = wb.Sheets[routesSheetName];
	const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

	console.log("\n1. ROUTES AND DRIVER DETAILS SHEET ANALYSIS");
	console.log("-".repeat(100));

	// Extract cab/driver data
	const vehicles = new Set();
	const drivers = new Set();
	const vehiclesByNumber = new Map(); // vehicle number -> {count, routes, drivers}
	const driversByName = new Map(); // driver name -> {count, routes, vehicles}
	const routes = new Set();

	// Helper to detect if string is a vehicle number
	function isVehicleNumber(str) {
		if (!str) return false;
		const normalized = str.trim().toUpperCase();
		// Vehicle patterns: MH..., CG..., TS..., AP..., etc (Indian state codes + numbers)
		return /^[A-Z]{2}\d{1,2}[A-Z]{2}\d{4}$/.test(normalized);
	}

	// Helper to extract driver name
	function extractDriverName(driverDetails) {
		if (!driverDetails) return null;
		const str = String(driverDetails).trim();
		// Extract driver name patterns like "DRIVER-NAME" or "NAME"
		if (str.includes("DRIVER-")) {
			return str.split("DRIVER-")[1]?.trim() || null;
		}
		if (!isVehicleNumber(str) && !/^MOB-/.test(str) && !/^\d+$/.test(str)) {
			return str;
		}
		return null;
	}

	// Helper to extract phone
	function extractPhone(driverDetails) {
		if (!driverDetails) return null;
		const str = String(driverDetails).trim();
		if (str.includes("MOB-")) {
			return str.split("MOB-")[1]?.trim() || null;
		}
		if (/^9\d{9}$/.test(str)) {
			return str;
		}
		return null;
	}

	// Parse each row
	const cabData = [];
	const processedVehicles = new Map();
	const processedDrivers = new Map();

	for (let i = 0; i < data.length; i++) {
		const row = data[i];
		const routeNo = row["Rout No"]?.trim() || "";
		const driverDetails = row["Driver Details"]?.trim() || "";
		const empName = row["Name"]?.trim() || "";
		const contactNo = row["Contact No"]?.trim() || "";

		if (!routeNo || routeNo === "Escort" || empName === "Escort") continue;

		routes.add(routeNo);

		// Try to extract vehicle number
		if (isVehicleNumber(driverDetails)) {
			const vehicleNum = driverDetails.toUpperCase();
			vehicles.add(vehicleNum);
			routes.add(routeNo);

			if (!processedVehicles.has(vehicleNum)) {
				processedVehicles.set(vehicleNum, {
					number: vehicleNum,
					count: 0,
					routes: new Set(),
					rows: [],
				});
			}
			const vehData = processedVehicles.get(vehicleNum);
			vehData.count++;
			vehData.routes.add(routeNo);
			vehData.rows.push({ rowNum: i + 1, routeNo, empName, contactNo });
		} else {
			// Extract driver info from driverDetails
			const driverName = extractDriverName(driverDetails);
			const driverPhone = extractPhone(driverDetails);

			if (driverName) {
				drivers.add(driverName);
				if (!processedDrivers.has(driverName)) {
					processedDrivers.set(driverName, {
						name: driverName,
						count: 0,
						routes: new Set(),
						phones: new Set(),
						rows: [],
					});
				}
				const drvData = processedDrivers.get(driverName);
				drvData.count++;
				drvData.routes.add(routeNo);
				if (driverPhone) drvData.phones.add(driverPhone);
				if (contactNo) drvData.phones.add(contactNo);
				drvData.rows.push({
					rowNum: i + 1,
					routeNo,
					empName,
					phone: driverPhone || contactNo,
				});
			}
		}

		cabData.push({
			rowNum: i + 1,
			routeNo,
			empName,
			empPhone: contactNo,
			driverDetails,
			vehicleNumber: isVehicleNumber(driverDetails)
				? driverDetails.toUpperCase()
				: null,
			driverName: extractDriverName(driverDetails),
			driverPhone: extractPhone(driverDetails),
		});
	}

	console.log(`\nTotal rows processed: ${cabData.length}`);
	console.log(`Unique routes: ${routes.size}`);
	console.log(`Unique vehicle numbers: ${vehicles.size}`);
	console.log(`Unique drivers: ${drivers.size}`);

	console.log("\nVehicle Numbers Found:");
	console.log("-".repeat(100));
	let vehicleCount = 0;
	processedVehicles.forEach((vehData, vehicleNum) => {
		vehicleCount++;
		console.log(
			`${vehicleCount}. ${vehicleNum} - Routes: ${Array.from(vehData.routes).join(", ")} - Occurrences: ${vehData.count}`,
		);
	});

	console.log("\nDriver Names Found:");
	console.log("-".repeat(100));
	let driverCount = 0;
	processedDrivers.forEach((drvData, driverName) => {
		driverCount++;
		const phones = Array.from(drvData.phones).join(", ");
		console.log(
			`${driverCount}. ${driverName} - Routes: ${Array.from(drvData.routes).join(", ")} - Phones: ${phones || "N/A"} - Occurrences: ${drvData.count}`,
		);
	});

	// Now analyze duplicate employees in daily sheets
	console.log("\n\n2. DUPLICATE EMPLOYEE ANALYSIS - DAILY SHEETS");
	console.log("-".repeat(100));

	const dailySheets = wb.SheetNames.filter((name) =>
		/^\d{1,2}-\d{1,2}-\d{2}$/.test(name.trim()),
	);

	for (const sheetName of dailySheets) {
		const ws = wb.Sheets[sheetName];
		const sheetData = XLSX.utils.sheet_to_json(ws, { defval: "" });

		const employeeNames = [];
		const actualDuplicates = new Map(); // name -> count

		for (const row of sheetData) {
			const empName = (row["Name"] || "").trim();
			if (!empName || empName === "Escort") continue;
			employeeNames.push(empName);
			actualDuplicates.set(empName, (actualDuplicates.get(empName) || 0) + 1);
		}

		// Filter to show only actual duplicates (count > 1)
		const duplicates = Array.from(actualDuplicates.entries()).filter(
			([name, count]) => count > 1,
		);

		console.log(`\n${sheetName}:`);
		console.log(`  Total valid rows: ${employeeNames.length}`);
		console.log(`  Total unique employees: ${actualDuplicates.size}`);
		console.log(`  Actual duplicate employees: ${duplicates.length}`);

		if (duplicates.length > 0) {
			console.log("  Duplicated employee names:");
			duplicates.forEach(([name, count]) => {
				console.log(`    - ${name}: appears ${count} times`);
			});
		} else {
			console.log("  No duplicate employees in this sheet");
		}
	}

	// Database comparison
	console.log("\n\n3. DATABASE COMPARISON");
	console.log("-".repeat(100));

	try {
		// Get all cabs from database
		const dbCabs = await prisma.cab.findMany({
			select: { cabNumber: true, vendor: true },
		});

		console.log(`\nDatabase Cabs: ${dbCabs.length}`);
		console.log(
			"Sample DB cabs:",
			dbCabs.slice(0, 5).map((c) => c.cabNumber),
		);

		// Get all drivers from database
		const dbDrivers = await prisma.driver.findMany({
			select: { name: true, phone: true },
		});

		console.log(`\nDatabase Drivers: ${dbDrivers.length}`);
		console.log(
			"Sample DB drivers:",
			dbDrivers.slice(0, 5).map((d) => `${d.name} (${d.phone})`),
		);

		// Compare
		console.log("\n\nVehicle Comparison:");
		console.log("-".repeat(100));
		const dbCabNumbers = new Set(dbCabs.map((c) => c.cabNumber));
		const workbookVehicles = new Set(vehicles);

		const missingInDb = Array.from(workbookVehicles).filter(
			(v) => !dbCabNumbers.has(v),
		);
		const missingInWorkbook = Array.from(dbCabNumbers).filter(
			(v) => !workbookVehicles.has(v),
		);
		const matching = Array.from(workbookVehicles).filter((v) =>
			dbCabNumbers.has(v),
		);

		console.log(`Vehicles in workbook: ${workbookVehicles.size}`);
		console.log(`Vehicles in database: ${dbCabNumbers.size}`);
		console.log(`Matching: ${matching.length}`);
		console.log(`Missing from database: ${missingInDb.length}`);
		console.log(`Missing from workbook: ${missingInWorkbook.length}`);

		if (missingInDb.length > 0) {
			console.log(
				`\nVehicles in workbook but NOT in database: ${missingInDb.slice(0, 10).join(", ")}${missingInDb.length > 10 ? "..." : ""}`,
			);
		}
		if (missingInWorkbook.length > 0) {
			console.log(
				`\nVehicles in database but NOT in workbook: ${missingInWorkbook.slice(0, 10).join(", ")}${missingInWorkbook.length > 10 ? "..." : ""}`,
			);
		}

		console.log("\n\nDriver Comparison:");
		console.log("-".repeat(100));
		const dbDriverNames = new Set(
			dbDrivers.map((d) => d.name.trim().toUpperCase()),
		);
		const workbookDrivers = new Set(
			Array.from(drivers).map((d) => d.toUpperCase()),
		);

		const matchingDrivers = Array.from(workbookDrivers).filter((d) =>
			dbDriverNames.has(d),
		);
		const missingDriversInDb = Array.from(workbookDrivers).filter(
			(d) => !dbDriverNames.has(d),
		);
		const missingDriversInWorkbook = Array.from(dbDriverNames).filter(
			(d) => !workbookDrivers.has(d),
		);

		console.log(`Drivers in workbook: ${workbookDrivers.size}`);
		console.log(`Drivers in database: ${dbDriverNames.size}`);
		console.log(`Matching: ${matchingDrivers.length}`);
		console.log(`Missing from database: ${missingDriversInDb.length}`);
		console.log(`Missing from workbook: ${missingDriversInWorkbook.length}`);

		if (missingDriversInDb.length > 0) {
			console.log(
				`\nDrivers in workbook but NOT in database: ${Array.from(missingDriversInDb).slice(0, 10).join(", ")}${missingDriversInDb.length > 10 ? "..." : ""}`,
			);
		}
		if (missingDriversInWorkbook.length > 0) {
			console.log(
				`\nDrivers in database but NOT in workbook: ${Array.from(missingDriversInWorkbook).slice(0, 10).join(", ")}${missingDriversInWorkbook.length > 10 ? "..." : ""}`,
			);
		}
	} catch (err) {
		console.log("Error querying database:", err.message);
	}

	// Save diagnostics
	const diagnostics = {
		timestamp: new Date().toISOString(),
		routesAndDriverAnalysis: {
			totalRowsProcessed: cabData.length,
			uniqueRoutes: routes.size,
			uniqueVehicles: vehicles.size,
			uniqueDrivers: drivers.size,
			vehicles: Array.from(vehicles).sort(),
			drivers: Array.from(drivers).sort(),
			routes: Array.from(routes).sort(),
		},
		cabDataSample: cabData.slice(0, 20),
		processedVehicles: Object.fromEntries(
			Array.from(processedVehicles.entries()).map(([num, data]) => [
				num,
				{
					count: data.count,
					routes: Array.from(data.routes),
					sampleRows: data.rows.slice(0, 3),
				},
			]),
		),
		processedDrivers: Object.fromEntries(
			Array.from(processedDrivers.entries()).map(([name, data]) => [
				name,
				{
					count: data.count,
					routes: Array.from(data.routes),
					phones: Array.from(data.phones),
					sampleRows: data.rows.slice(0, 3),
				},
			]),
		),
	};

	fs.writeFileSync(
		path.join(__dirname, "../data/outputs/gtpl-routes-driver-analysis.json"),
		JSON.stringify(diagnostics, null, 2),
	);

	console.log("\n\n" + "=".repeat(100));
	console.log(
		"Analysis complete! Diagnostics saved to: data/outputs/gtpl-routes-driver-analysis.json",
	);
	console.log("=".repeat(100));

	await prisma.$disconnect();
}

analyzeGTPLData().catch(console.error);
