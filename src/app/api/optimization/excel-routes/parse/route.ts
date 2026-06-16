export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";
import { parseGtlpWorkbookSheet, shiftIdFromTime } from "@/lib/gtplParser";

export async function POST(req: NextRequest) {
	try {
		const auth = await requireApiRole(["ADMIN"]);
		if (auth.response) return auth.response;

		const body = await req.json();
		const { fileKey, sheetName, date: dateOverride } = body;

		if (!fileKey || !sheetName) {
			return NextResponse.json(
				{ error: "fileKey and sheetName are required" },
				{ status: 400 },
			);
		}

		const filePath = path.join(
			process.cwd(),
			"data",
			"uploads",
			`${fileKey}.xlsx`,
		);
		if (!fs.existsSync(filePath)) {
			return NextResponse.json(
				{ error: `Upload file with key ${fileKey} not found` },
				{ status: 404 },
			);
		}

		const buffer = fs.readFileSync(filePath);
		const parsed = parseGtlpWorkbookSheet(buffer, sheetName);
		const routes = parsed.routes;
		const employees = parsed.employees;
		const date = dateOverride || parsed.date;

		const dbEmployees = await prisma.employee.findMany({
			where: { status: "ACTIVE" },
		});
		const dbByName = new Map(dbEmployees.map((e) => [e.name.toLowerCase(), e]));
		const dbByCode = new Map(
			dbEmployees.map((e) => [e.employeeCode.toLowerCase(), e]),
		);

		let dbMatchedAbsent = 0;
		const dbNotFound: string[] = [];
		const unmatchedEmployeeCodes: string[] = [];

		for (const name of parsed.absentEmployeeNames) {
			const match = dbByName.get(name.toLowerCase());
			if (match) dbMatchedAbsent++;
			else dbNotFound.push(name);
		}

		const baselineRoutes = routes.map((r) => {
			const shiftTime =
				r.employees.find((e) => e.status === "YES")?.shiftTime || "05:00";
			const shiftId = shiftIdFromTime(shiftTime);
			const vehicleNumber = r.vehicleNumber.startsWith("MH")
				? r.vehicleNumber
				: r.vehicleNumber;

			const stops = r.employees
				.filter((e) => e.status !== "NO SHOW")
				.map((e, idx) => {
					const matched =
						(e.empId ? dbByCode.get(e.empId.toLowerCase()) : null) ||
						dbByName.get(e.name.toLowerCase());
					if (!matched && e.empId) unmatchedEmployeeCodes.push(e.empId);

					return {
						employeeId: matched?.id || `manual_${r.routeNo}_${idx}`,
						stopOrder: e.stopOrder,
						etaMinutes: idx * 5,
						status: "PENDING",
						pickupPoint: e.pickupPoint,
						employee: {
							id: matched?.id || `manual_${r.routeNo}_${idx}`,
							name: e.name,
							employeeCode:
								matched?.employeeCode ||
								e.empId ||
								e.name.replace(/\s+/g, "-").toUpperCase(),
							gender: e.gender,
							x: matched?.x ?? 79.05,
							y: matched?.y ?? 21.06,
							address: e.address,
						},
					};
				});

			return {
				id: `manual_route_${r.routeNo}`,
				routeNo: r.routeNo,
				cabId: `manual_cab_${r.routeNo}`,
				vehicleNumber,
				driverName: r.driver,
				driverPhone: "9999999999",
				shiftId,
				shiftTime,
				isPickup: true,
				capacity: 6,
				stops,
				// FIX: Mark distance as UNKNOWN - baseline routes don't have GPS coordinates
				totalDistance: 0,
				totalDuration: 0,
				distanceSource: "UNKNOWN",
				optimizationScore: 100,
				violations: [],
				hasEscort: false,
			};
		});

		const finalSummary = {
			source: "MANUAL_EXCEL",
			sheetName,
			date,
			totalRows: parsed.totalManifestRows,
			presentCount: parsed.presentRowCount,
			absentCount: parsed.absentRowCount,
			presentUniqueCount: parsed.presentUniqueCount,
			absentUniqueCount: parsed.absentUniqueCount,
			employeeCount: parsed.presentRowCount,
			routeCount: parsed.cabsUsed,
			noShowCount: parsed.absentRowCount,
			cabsUsed: parsed.cabsUsed,
			shiftBreakdown: parsed.shiftBreakdown,
			safetyViolations: parsed.safetyViolations,
			absentEmployeeNames: parsed.absentEmployeeNames,
			absentEmployeeCodes: employees
				.filter((e) => e.absent)
				.map((e) => e.empId),
			underfilled: parsed.underfilled,
			dbMatchedAbsent,
			dbNotFound,
			unmatchedEmployeeCodes: [...new Set(unmatchedEmployeeCodes)],
			routesWithHeavyAbsence: routes
				.filter((r) => r.absentCount >= 5)
				.map((r) => ({ route: r.routeNo, absent: r.absentCount })),
		};

		await prisma.baselineRoute.deleteMany({ where: { date } });
		await prisma.baselineRoute.create({
			data: {
				snapshotId: `baseline_parsed_${Date.now()}`,
				date,
				routeData: JSON.stringify(baselineRoutes),
				statistics: JSON.stringify(finalSummary),
			},
		});

		return NextResponse.json({
			success: true,
			...finalSummary,
			routes: baselineRoutes,
		});
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : String(e);
		console.error("[api] ❌ POST /api/optimization/excel-routes/parse", e);
		return NextResponse.json(
			{ error: "Failed to parse selected Excel sheet", details: message },
			{ status: 500 },
		);
	}
}
