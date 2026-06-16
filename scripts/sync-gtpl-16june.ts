import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface WorkbookData {
	employees: Map<string, any>;
	cabs: Set<string>;
	cabDetails: Map<string, any>;
}

function normalizeEmployee(name: string): string {
	return name?.toString()?.trim()?.toUpperCase() || "";
}

function normalizeVehicle(vehicle: string): string {
	return vehicle?.toString()?.trim()?.toUpperCase() || "";
}

function normalizePhone(phone: string): string {
	return phone?.toString()?.trim()?.replace(/^MOB-/i, "")?.toUpperCase() || "";
}

async function parseWorkbookSheet(
	workbook: XLSX.WorkBook,
	sheetName: string,
): Promise<WorkbookData> {
	const ws = workbook.Sheets[sheetName];
	if (!ws) {
		return {
			employees: new Map(),
			cabs: new Set(),
			cabDetails: new Map(),
		};
	}

	const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

	const employees = new Map<string, any>();
	const cabs = new Set<string>();
	const cabDetails = new Map<string, any>();

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

	// Fallback
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
		const phone = normalizePhone(row[phoneCol] || "");

		// Skip phone-only rows (not real employees)
		if (empName.startsWith("MOB")) continue;

		employees.set(empName, {
			name: row[empNameCol],
			code: empCode,
			vehicle,
			driver,
			phone,
		});

		if (vehicle) {
			cabs.add(vehicle);
			if (!cabDetails.has(vehicle)) {
				cabDetails.set(vehicle, {
					driverName: driver,
					driverPhone: phone,
				});
			}
		}
	}

	return { employees, cabs, cabDetails };
}

async function main() {
	const args = process.argv.slice(2);
	const dryRun = !args.includes("--apply");

	console.log("=".repeat(80));
	console.log("PHASES 3-6: GTPL SYNC - TRANSPORT ROSTER, CABS, DRIVERS");
	console.log("=".repeat(80));
	console.log(
		`\n🔍 MODE: ${dryRun ? "DRY RUN (preview only)" : "🚀 APPLY (will make changes)"}`,
	);
	console.log(`\nDate: 2026-06-16`);
	console.log(`Source: 16-6-26 sheet`);

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
	const {
		employees: workbookEmployees,
		cabs: workbookCabs,
		cabDetails,
	} = await parseWorkbookSheet(workbook, "16-6-26");

	console.log(`\n📊 PARSED WORKBOOK DATA:`);
	console.log(`   Employees: ${workbookEmployees.size}`);
	console.log(`   Cabs: ${workbookCabs.size}`);

	// ========== LOAD DATABASE DATA ==========
	console.log(`\n📁 LOADING DATABASE...`);

	const dbEmployees = await prisma.employee.findMany({
		select: {
			id: true,
			name: true,
			employeeCode: true,
		},
	});

	const dbCabs = await prisma.cab.findMany({
		select: {
			id: true,
			vehicleNumber: true,
		},
	});

	const syncReport = {
		timestamp: new Date().toISOString(),
		date: "2026-06-16",
		dryRun,
		phase3: {
			transportRosterUpdates: {
				presentCount: 0,
				noShowCount: 0,
				presentEmployees: [] as string[],
				noShowEmployees: [] as string[],
			},
		},
		phase4: {
			cabStatusUpdates: {
				activeCount: 0,
				inactiveCount: 0,
				activeVehicles: [] as string[],
				inactiveVehicles: [] as string[],
			},
		},
		phase5: {
			driverAssignments: {
				updated: 0,
				assignments: [] as any[],
			},
		},
	};

	// ========== PHASE 3: TRANSPORT ROSTER SYNC ==========
	console.log(`\n${"=".repeat(80)}`);
	console.log("PHASE 3: TRANSPORT ROSTER SYNC");
	console.log("=".repeat(80));

	const dbEmpNames = dbEmployees.map((e) => e.name.toUpperCase());
	const workbookEmpNames = Array.from(workbookEmployees.keys());

	// Present employees
	const presentCount = workbookEmpNames.filter((emp) =>
		dbEmpNames.includes(emp),
	).length;

	console.log(`\n✅ PRESENT: ${presentCount} employees`);
	workbookEmpNames
		.filter((emp) => dbEmpNames.includes(emp))
		.slice(0, 5)
		.forEach((emp) => {
			console.log(`   - ${emp}`);
			syncReport.phase3.transportRosterUpdates.presentEmployees.push(emp);
		});

	syncReport.phase3.transportRosterUpdates.presentCount =
		workbookEmpNames.filter((emp) => dbEmpNames.includes(emp)).length;

	// No-show employees
	const noShowEmployees = dbEmpNames.filter(
		(emp) => !workbookEmpNames.includes(emp),
	);

	console.log(`\n⚠️  NO_SHOW: ${noShowEmployees.length} employees`);
	noShowEmployees.slice(0, 5).forEach((emp) => {
		console.log(`   - ${emp}`);
		syncReport.phase3.transportRosterUpdates.noShowEmployees.push(emp);
	});

	if (noShowEmployees.length > 5) {
		console.log(`   ... and ${noShowEmployees.length - 5} more`);
	}

	syncReport.phase3.transportRosterUpdates.noShowCount = noShowEmployees.length;

	if (!dryRun) {
		console.log(`\n🔄 UPDATING DATABASE (PHASE 3)...`);

		// Update PRESENT employees
		for (const empName of workbookEmpNames.filter((emp) =>
			dbEmpNames.includes(emp),
		)) {
			const dbEmp = dbEmployees.find((e) => e.name.toUpperCase() === empName);
			if (dbEmp) {
				await prisma.transportRoster.upsert({
					where: {
						employeeId_date: {
							employeeId: dbEmp.id,
							date: "2026-06-16",
						},
					},
					update: {
						transportRosterStatus: "PRESENT",
						transportRosterDate: new Date(),
						sourceSheet: "16-6-26",
					},
					create: {
						employeeId: dbEmp.id,
						date: "2026-06-16",
						transportRosterStatus: "PRESENT",
						transportRosterDate: new Date(),
						sourceSheet: "16-6-26",
					},
				});
			}
		}

		// Update NO_SHOW employees
		for (const empName of noShowEmployees) {
			const dbEmp = dbEmployees.find((e) => e.name.toUpperCase() === empName);
			if (dbEmp) {
				await prisma.transportRoster.upsert({
					where: {
						employeeId_date: {
							employeeId: dbEmp.id,
							date: "2026-06-16",
						},
					},
					update: {
						transportRosterStatus: "NO_SHOW",
						transportRosterDate: new Date(),
						sourceSheet: "16-6-26",
					},
					create: {
						employeeId: dbEmp.id,
						date: "2026-06-16",
						transportRosterStatus: "NO_SHOW",
						transportRosterDate: new Date(),
						sourceSheet: "16-6-26",
					},
				});
			}
		}

		console.log(
			`   ✅ Updated ${syncReport.phase3.transportRosterUpdates.presentCount} PRESENT records`,
		);
		console.log(
			`   ✅ Updated ${syncReport.phase3.transportRosterUpdates.noShowCount} NO_SHOW records`,
		);
	}

	// ========== PHASE 4: CAB SYNC ==========
	console.log(`\n${"=".repeat(80)}`);
	console.log("PHASE 4: CAB STATUS SYNC");
	console.log("=".repeat(80));

	const workbookCabsList = Array.from(workbookCabs);
	const dbCabNumbers = dbCabs.map((c) => c.vehicleNumber.toUpperCase());

	const activeCabs = workbookCabsList.filter((cab) =>
		dbCabNumbers.includes(cab),
	);

	const inactiveCabs = dbCabNumbers.filter(
		(cab) => !workbookCabsList.includes(cab),
	);

	console.log(`\n✅ ACTIVE: ${activeCabs.length} cabs`);
	activeCabs.slice(0, 5).forEach((cab) => {
		console.log(`   - ${cab}`);
		syncReport.phase4.cabStatusUpdates.activeVehicles.push(cab);
	});

	console.log(`\n❌ INACTIVE (not in workbook): ${inactiveCabs.length} cabs`);
	inactiveCabs.slice(0, 5).forEach((cab) => {
		console.log(`   - ${cab}`);
		syncReport.phase4.cabStatusUpdates.inactiveVehicles.push(cab);
	});

	if (inactiveCabs.length > 5) {
		console.log(`   ... and ${inactiveCabs.length - 5} more`);
	}

	syncReport.phase4.cabStatusUpdates.activeCount = activeCabs.length;
	syncReport.phase4.cabStatusUpdates.inactiveCount = inactiveCabs.length;

	if (!dryRun) {
		console.log(`\n🔄 UPDATING CAB ROSTER (PHASE 4)...`);

		// Update ACTIVE cabs
		for (const cabNum of activeCabs) {
			const dbCab = dbCabs.find(
				(c) => c.vehicleNumber.toUpperCase() === cabNum,
			);
			if (dbCab) {
				await prisma.cabRosterStatus.upsert({
					where: {
						cabId_date: {
							cabId: dbCab.id,
							date: "2026-06-16",
						},
					},
					update: {
						cabRosterStatus: "ACTIVE",
						activeForDate: new Date(),
						sourceSheet: "16-6-26",
					},
					create: {
						cabId: dbCab.id,
						date: "2026-06-16",
						cabRosterStatus: "ACTIVE",
						activeForDate: new Date(),
						sourceSheet: "16-6-26",
					},
				});
			}
		}

		// Update INACTIVE cabs
		for (const cabNum of inactiveCabs) {
			const dbCab = dbCabs.find(
				(c) => c.vehicleNumber.toUpperCase() === cabNum,
			);
			if (dbCab) {
				await prisma.cabRosterStatus.upsert({
					where: {
						cabId_date: {
							cabId: dbCab.id,
							date: "2026-06-16",
						},
					},
					update: {
						cabRosterStatus: "INACTIVE",
						inactiveForDate: new Date(),
						sourceSheet: "16-6-26",
					},
					create: {
						cabId: dbCab.id,
						date: "2026-06-16",
						cabRosterStatus: "INACTIVE",
						inactiveForDate: new Date(),
						sourceSheet: "16-6-26",
					},
				});
			}
		}

		console.log(
			`   ✅ Updated ${syncReport.phase4.cabStatusUpdates.activeCount} ACTIVE cab records`,
		);
		console.log(
			`   ✅ Updated ${syncReport.phase4.cabStatusUpdates.inactiveCount} INACTIVE cab records`,
		);
	}

	// ========== PHASE 5: DRIVER SYNC ==========
	console.log(`\n${"=".repeat(80)}`);
	console.log("PHASE 5: DRIVER ASSIGNMENT SYNC");
	console.log("=".repeat(80));

	let driverAssignmentCount = 0;
	for (const [cabNum, cabDetail] of cabDetails) {
		if (dbCabNumbers.includes(cabNum)) {
			const dbCab = dbCabs.find(
				(c) => c.vehicleNumber.toUpperCase() === cabNum,
			);
			if (dbCab && cabDetail.driverName) {
				console.log(`\n📋 ${cabNum}`);
				console.log(`   Driver: ${cabDetail.driverName}`);
				console.log(`   Phone: ${cabDetail.driverPhone || "N/A"}`);

				syncReport.phase5.driverAssignments.assignments.push({
					vehicle: cabNum,
					driver: cabDetail.driverName,
					phone: cabDetail.driverPhone,
				});

				if (!dryRun) {
					const existingAssignment = await prisma.driverAssignment.findFirst({
						where: {
							cabId: dbCab.id,
							date: "2026-06-16",
						},
					});
					if (existingAssignment) {
						await prisma.driverAssignment.update({
							where: { id: existingAssignment.id },
							data: {
								driverName: cabDetail.driverName,
								driverPhone: cabDetail.driverPhone,
							},
						});
					} else {
						await prisma.driverAssignment.create({
							data: {
								cabId: dbCab.id,
								date: "2026-06-16",
								driverName: cabDetail.driverName,
								driverPhone: cabDetail.driverPhone,
							},
						});
					}
				}

				driverAssignmentCount++;
			}
		}
	}

	syncReport.phase5.driverAssignments.updated = driverAssignmentCount;

	if (!dryRun) {
		console.log(`\n✅ Updated ${driverAssignmentCount} driver assignments`);
	}

	// ========== PHASE 6: VALIDATION ==========
	console.log(`\n${"=".repeat(80)}`);
	console.log("PHASE 6: VALIDATION REPORT");
	console.log("=".repeat(80));

	console.log(
		`\n📊 PRESENT EMPLOYEES: ${syncReport.phase3.transportRosterUpdates.presentCount}`,
	);
	console.log(
		`⚠️  NO_SHOW EMPLOYEES: ${syncReport.phase3.transportRosterUpdates.noShowCount}`,
	);
	console.log(
		`\n✅ ACTIVE CABS: ${syncReport.phase4.cabStatusUpdates.activeCount}`,
	);
	console.log(
		`❌ INACTIVE CABS: ${syncReport.phase4.cabStatusUpdates.inactiveCount}`,
	);
	console.log(`\n🚗 DRIVER ASSIGNMENTS: ${driverAssignmentCount}`);

	// ========== SAVE REPORT ==========
	const reportPath = path.join(
		process.cwd(),
		"data",
		"outputs",
		"gtpl-sync-report-16june.json",
	);

	const outputDir = path.dirname(reportPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(reportPath, JSON.stringify(syncReport, null, 2));

	console.log(`\n${"=".repeat(80)}`);
	if (dryRun) {
		console.log("✅ DRY RUN COMPLETE");
		console.log("\nTo apply these changes, run:");
		console.log("   npx ts-node scripts/sync-gtpl-16june.ts --apply");
	} else {
		console.log("✅ SYNC COMPLETE - Changes have been applied!");
	}
	console.log(`\n📄 Report saved to: ${reportPath}`);
	console.log("=".repeat(80));

	await prisma.$disconnect();
}

main().catch((err) => {
	console.error("❌ Error:", err);
	process.exit(1);
});
