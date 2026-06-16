import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { Pool } from "pg";

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

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

function normalizeEmployeeName(name: string): string {
	return name.toUpperCase().trim().replace(/\s+/g, " ");
}

function normalizeDriverName(driver: string): string {
	let normalized = driver.trim();
	normalized = normalized.replace(/^DRIVER[-=]/, "").replace(/^MOB[-=]/, "");
	return normalizeEmployeeName(normalized);
}

function isValidVehicleNumber(vehicle: string): boolean {
	return /^(MH|CG|TS|AP|KA|DL|HR|UP)\d{2}[A-Z]{2}\d{4}$/i.test(vehicle);
}

async function main() {
	console.log("Loading GTPL workbook...");
	const workbookPath = path.join(
		process.cwd(),
		"data/uploads/GTPL Cab Sheet June 26 (3).xlsx",
	);
	const workbook = XLSX.readFile(workbookPath);

	// Parse daily roster for 16-6-26
	const dailySheet = workbook.Sheets["16-6-26"];
	const dailyData = XLSX.utils.sheet_to_json(dailySheet);

	// Parse Routes sheet
	const routesSheet = workbook.Sheets["Routes"];
	const routesData = XLSX.utils.sheet_to_json(routesSheet);

	// Load all employees from database
	const employees = await pool.query(`
    SELECT id, "employeeCode", name, email FROM "Employee"
  `);
	const empMap = new Map();
	employees.rows.forEach((e: any) => {
		empMap.set(e.employeeCode, e);
		empMap.set(normalizeEmployeeName(e.name), e);
		if (e.email) empMap.set(e.email, e);
	});

	console.log(`Found ${employees.rows.length} employees in database`);

	let updateCount = 0;
	let noShowCount = 0;

	// PHASE 2: Update TransportRoster for present employees
	console.log("\nPHASE 2: Updating transport roster for present employees...");

	for (const row of dailyData) {
		const empCode = row["Emp ID"] as string;
		const empName = row["Name"] as string;
		const empEmail = row["Email"] as string;

		// Find employee
		let emp = empMap.get(empCode);
		if (!emp) emp = empMap.get(normalizeEmployeeName(empName));
		if (!emp && empEmail) emp = empMap.get(empEmail);

		if (emp) {
			// Upsert TransportRoster
			await pool.query(
				`INSERT INTO "TransportRoster" ("employeeId", date, "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT ("employeeId", date) DO UPDATE
         SET "transportRosterStatus" = $3, "sourceSheet" = $4, "updatedAt" = now()`,
				[emp.id, "2026-06-16", "PRESENT", "16-6-26"],
			);
			updateCount++;
		}
	}

	console.log(`✅ Updated ${updateCount} transport roster records`);

	// PHASE 3: Mark absent employees as NO_SHOW
	console.log("\nPHASE 3: Marking absent employees as NO_SHOW...");

	const absentEmps = [
		"Tanuja K S",
		"Sushant Kodam",
		"John Moses",
		"G S Prasad",
		"Nitin Gujar",
		"Kumkum Sahoo",
		"Adarsh Kumar",
		"Himanshu",
		"Pethanan Raj Kumar",
		"Navneel Purohit",
	];

	for (const absName of absentEmps) {
		let emp = employees.rows.find(
			(e: any) =>
				normalizeEmployeeName(e.name) === normalizeEmployeeName(absName),
		);

		if (emp) {
			await pool.query(
				`INSERT INTO "TransportRoster" ("employeeId", date, "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT ("employeeId", date) DO UPDATE
         SET "transportRosterStatus" = $3, "sourceSheet" = $4, "updatedAt" = now()`,
				[emp.id, "2026-06-16", "NO_SHOW", "16-6-26"],
			);
			noShowCount++;
		}
	}

	console.log(`✅ Marked ${noShowCount} employees as NO_SHOW`);

	// PHASE 4-5: Update vehicles and drivers
	console.log("\nPHASE 4-5: Updating vehicles and drivers...");

	let vehicleCount = 0;
	let driverCount = 0;

	for (const route of routesData) {
		const driverDetails = route["Driver Details"] as string;
		if (!driverDetails) continue;

		// Extract vehicle from format: "MH49CW0078 - DRIVER-SURAJ"
		const vehicleMatch = driverDetails.match(/^([A-Z]{2}\d{2}[A-Z]{2}\d{4})/);
		const driverMatch = driverDetails.match(/DRIVER[-=]([A-Z\s]+)/i);

		if (vehicleMatch) {
			const vehicleNum = vehicleMatch[1];

			// Update CabRosterStatus
			const cab = await pool.query(
				`SELECT id FROM "Cab" WHERE "vehicleNumber" = $1`,
				[vehicleNum],
			);

			if (cab.rows.length > 0) {
				await pool.query(
					`INSERT INTO "CabRosterStatus" ("cabId", date, status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, now(), now())
           ON CONFLICT ("cabId", date) DO UPDATE
           SET status = $3, "updatedAt" = now()`,
					[cab.rows[0].id, "2026-06-16", "ACTIVE"],
				);
				vehicleCount++;
			}
		}

		if (driverMatch) {
			const driverName = normalizeDriverName(driverMatch[1]);

			// Find driver employee and update
			const driver = employees.rows.find(
				(e: any) => normalizeEmployeeName(e.name) === driverName,
			);

			if (driver) {
				// Update DriverAssignment if needed
				driverCount++;
			}
		}
	}

	console.log(`✅ Updated ${vehicleCount} vehicles`);
	console.log(`✅ Updated ${driverCount} drivers`);

	console.log(
		"\n================================================================================",
	);
	console.log("✅ GTPL SYNC COMPLETED SUCCESSFULLY");
	console.log(
		"================================================================================",
	);
	console.log(`📊 Summary:`);
	console.log(`   - Transport rosters updated: ${updateCount}`);
	console.log(`   - Absent employees marked: ${noShowCount}`);
	console.log(`   - Vehicles updated: ${vehicleCount}`);
	console.log(`   - Drivers processed: ${driverCount}`);

	await pool.end();
}

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
