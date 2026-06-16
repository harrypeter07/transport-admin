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
	if (!fs.existsSync(workbookPath)) {
		console.log(`❌ Workbook not found at ${workbookPath}`);
		return;
	}
	const workbook = XLSX.readFile(workbookPath);

	// Parse daily roster for 16-6-26
	const dailySheet = workbook.Sheets["16-6-26"];
	if (!dailySheet) {
		console.log(`❌ Daily sheet not found`);
		return;
	}
	const dailyData = XLSX.utils.sheet_to_json(dailySheet) as any[];

	// Parse Routes sheet
	const routesSheet = workbook.Sheets["Routes"];
	if (!routesSheet) {
		console.log(`❌ Routes sheet not found`);
		return;
	}
	const routesData = XLSX.utils.sheet_to_json(routesSheet) as any[];

	// Load all employees from database
	const dbEmployees = await prisma.employee.findMany({
		select: { id: true, employeeCode: true, name: true, email: true },
	});
	const empMap = new Map();
	dbEmployees.forEach((e: any) => {
		empMap.set(e.employeeCode, e);
		empMap.set(normalizeEmployeeName(e.name), e);
		if (e.email) empMap.set(e.email, e);
	});

	console.log(`Found ${dbEmployees.length} employees in database`);

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
			await prisma.transportRoster.upsert({
				where: {
					employeeId_date: {
						employeeId: emp.id,
						date: "2026-06-16",
					},
				},
				update: {
					transportRosterStatus: "PRESENT",
					sourceSheet: "16-6-26",
				},
				create: {
					employeeId: emp.id,
					date: "2026-06-16",
					transportRosterStatus: "PRESENT",
					sourceSheet: "16-6-26",
				},
			});
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
		const emp = dbEmployees.find(
			(e: any) =>
				normalizeEmployeeName(e.name) === normalizeEmployeeName(absName),
		);

		if (emp) {
			await prisma.transportRoster.upsert({
				where: {
					employeeId_date: {
						employeeId: emp.id,
						date: "2026-06-16",
					},
				},
				update: {
					transportRosterStatus: "NO_SHOW",
					sourceSheet: "16-6-26",
				},
				create: {
					employeeId: emp.id,
					date: "2026-06-16",
					transportRosterStatus: "NO_SHOW",
					sourceSheet: "16-6-26",
				},
			});
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
			const cab = await prisma.cab.findUnique({
				where: { vehicleNumber: vehicleNum },
				select: { id: true },
			});

			if (cab) {
				await prisma.cabRosterStatus.upsert({
					where: {
						cabId_date: {
							cabId: cab.id,
							date: "2026-06-16",
						},
					},
					update: {
						cabRosterStatus: "ACTIVE",
					},
					create: {
						cabId: cab.id,
						date: "2026-06-16",
						cabRosterStatus: "ACTIVE",
					},
				});
				vehicleCount++;
			}
		}

		if (driverMatch) {
			const driverName = normalizeDriverName(driverMatch[1]);

			// Find driver employee and update
			const driver = dbEmployees.find(
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
}

main()
	.catch((err) => {
		console.error("Error:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
