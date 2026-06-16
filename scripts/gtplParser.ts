import * as xlsx from "xlsx";
import path from "path";
import fs from "fs";
import { inferDateFromSheetName } from "@/lib/excelParser";
import { checkSafetyViolations } from "@/lib/optimization";

export const GTPL_WORKBOOK_PATH = path.join(
	process.cwd(),
	"data",
	"test-roasters",
	"GTPL Cab Sheet June 26  (2).xlsx",
);

export type GtplEmployeeRow = {
	route: string;
	empId: string;
	name: string;
	phone: string;
	email: string;
	address: string;
	shiftTime: string;
	pickupPoint: string;
	status: string;
	driverDetails: string;
	gender: "MALE" | "FEMALE";
	isPickup: boolean;
};

export type GtplUniqueEmployee = {
	empId: string;
	name: string;
	employeeCode: string; // Primary identifier for deduplication
	excelEmployeeId?: string; // Original ID from Excel
	dbEmployeeId?: string; // Database ID (when synced)
	phone: string;
	email: string;
	address: string;
	shiftTime: string;
	pickupPoint: string;
	gender: "MALE" | "FEMALE";
	absent: boolean;
	pickupRoute?: string;
};

export type GtplRouteSummary = {
	routeNo: string;
	driverName: string; // Actual driver name, never phone
	driverPhone?: string; // Driver phone number (separate field)
	vehicleNumber: string;
	presentCount: number;
	absentCount: number;
	employees: Array<{
		name: string;
		empId: string;
		address: string;
		gender: "MALE" | "FEMALE";
		status: string;
		pickupPoint: string;
		stopOrder: number;
		shiftTime: string;
	}>;
};

export type GtplSheetParseResult = {
	sheetName: string;
	date: string;
	dateSourceMethod:
		| "SHEET_NAME"
		| "DATE_COLUMN"
		| "WORKBOOK_METADATA"
		| "INFERRED"
		| "SYSTEM_DATE";
	totalManifestRows: number;
	presentRowCount: number;
	absentRowCount: number;
	uniqueEmployeeCount: number;
	presentUniqueCount: number;
	absentUniqueCount: number;
	cabsUsed: number;
	shiftBreakdown: Record<string, number>;
	safetyViolations: string[];
	absentEmployeeNames: string[];
	underfilled: Array<{ route: string; count: number }>;
	employees: GtplUniqueEmployee[];
	routes: GtplRouteSummary[];
	drivers: string[];
	vehicles: string[];
	diagnostics: {
		parserVersion: string;
		baselineDistanceSource: "UNKNOWN"; // Never use fabricated distances
		underfillThreshold: number;
		validationWarnings: string[];
		employeeDeduplicationMethod: "EMPLOYEE_CODE" | "EMP_ID" | "NAME";
	};
};

export function gtplWorkbookPath(): string {
	const alt = path.join(process.cwd(), "data", "test-rosters", "roster.xlsx");
	if (fs.existsSync(GTPL_WORKBOOK_PATH)) return GTPL_WORKBOOK_PATH;
	if (fs.existsSync(alt)) return alt;
	return GTPL_WORKBOOK_PATH;
}

export function excelFractionToHHMM(value: unknown): string {
	if (value === null || value === undefined || value === "") return "05:00";
	if (typeof value === "number" && Number.isFinite(value)) {
		const totalMinutes = Math.round(value * 24 * 60);
		const hours = Math.floor(totalMinutes / 60) % 24;
		const mins = totalMinutes % 60;
		return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
	}
	const str = String(value).trim();
	if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return str.slice(0, 5);
	return "05:00";
}

/**
 * Extract date from column value.
 * Supports: Excel date codes, text dates, ISO format.
 * Returns: { date, method }
 */
export function excelSerialToDate(value: unknown): {
	date: string;
	method: "DATE_COLUMN" | "INVALID";
} {
	if (typeof value === "number" && Number.isFinite(value)) {
		const d = xlsx.SSF.parse_date_code(value);
		const dateStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
		return { date: dateStr, method: "DATE_COLUMN" };
	}
	return { date: "", method: "INVALID" };
}

function isSkipRow(route: string, empId: string, name: string): boolean {
	if (!route || route === "-" || route.toLowerCase() === "rout no") return true;
	if (!name || name.toLowerCase() === "escort") return true;
	if (empId.toLowerCase() === "escort") return true;
	if (name.toLowerCase() === "employee name" || name.toLowerCase() === "name")
		return true;
	return false;
}

function normalizeStatus(status: string): "YES" | "NO SHOW" {
	const s = status.trim().toUpperCase();
	if (s.includes("NO SHOW") || s === "ABSENT") return "NO SHOW";
	return "YES";
}

/**
 * Extract vehicle number from driver column.
 * Supports all Indian registration plate formats:
 * - MH 12 AB 1234 (2-letter state code, followed by district/year codes, registration number)
 * - DL 05 BN 1234
 * - KA 02 AB 1234
 * - Also compact formats without spaces: MH12AB1234
 */
function extractVehicle(driverCol: string): string {
	const d = driverCol.trim();
	// Match Indian registration format: 2-letter state code + 2 digits + 2 letters + 4 digits
	// Also match compact formats without spaces
	const matches = d.match(/([A-Z]{2})\s*(\d{2})\s*([A-Z]{2})\s*(\d{4})/i);
	if (matches) {
		// Return normalized format without spaces
		return d
			.substring(matches.index!, matches.index! + matches[0].length)
			.replace(/\s+/g, "")
			.toUpperCase();
	}
	return "";
}

/**
 * Extract driver name and phone from driverDetails column.
 * Formats:
 * - "Driver Name, +91XXXXXXXXXX"
 * - "Name Mob-9876543210"
 * - "Name (Ph: +919876543210)"
 * - "Name +919876543210"
 */
function extractDriverNameAndPhone(driverDetails: string): {
	name: string;
	phone: string;
} {
	if (!driverDetails || driverDetails.toLowerCase() === "driver details") {
		return { name: "Unknown", phone: "" };
	}

	const d = driverDetails.trim();

	// Extract phone: Look for +91, 9XXXXXXXXX, or similar patterns
	const phoneMatch = d.match(
		/(?:\+91|91)?(\d{10})|Mob[- ]?(\d{10})|Ph:?\s*[- ]?(\d{10})/i,
	);
	const phone = phoneMatch
		? phoneMatch[1] || phoneMatch[2] || phoneMatch[3] || ""
		: "";

	// Extract name: Remove phone parts from the string
	let name = d
		.replace(/\+91\d{10}/g, "")
		.replace(/91\d{10}/g, "")
		.replace(/Mob[- ]\d{10}/gi, "")
		.replace(/Ph:?\s*[- ]\d{10}/gi, "")
		.replace(/\(.*\d{10}.*\)/g, "")
		.replace(/,\s*$/, "")
		.trim()
		.replace(/^Driver\s+/i, "")
		.trim();

	// If name is empty, use the original (it might be just the number)
	if (!name && !phone) name = d;
	if (!name) name = "Unknown";

	return { name, phone };
}

/**
 * Map shift time to shift ID using database lookup.
 * Supports shifts: 05:00, 07:00, 08:00, 09:00, 10:00, 11:00, 11:30, 13:00, and future shifts.
 * Uses startTime matching to find correct shift.
 */
export function shiftIdFromTime(
	shiftTime: string,
	availableShifts?: { id: string; startTime: string }[],
): string {
	const time = shiftTime.trim();

	// If available shifts provided, find exact match
	if (availableShifts && availableShifts.length > 0) {
		const match = availableShifts.find((s) =>
			s.startTime.startsWith(time.slice(0, 5)),
		);
		if (match) return match.id;
	}

	// Fallback: Map common times to shift IDs
	const shiftMap: Record<string, string> = {
		"05": "shift-0500",
		"07": "shift-0700",
		"08": "shift-0800",
		"09": "shift-0900",
		"10": "shift-1000",
		"11": "shift-1100", // Also covers 11:30
		"13": "shift-1300",
	};

	const hour = time.slice(0, 2);
	return shiftMap[hour] || "shift-0500"; // Default to 05:00
}

export function parseGtlpSheetRows(
	rows: unknown[][],
	sheetName: string,
	options?: {
		underfillThreshold?: number; // Default: 3
		availableShifts?: { id: string; startTime: string }[];
	},
): GtplSheetParseResult {
	const underfillThreshold = options?.underfillThreshold ?? 3;
	const availableShifts = options?.availableShifts || [];
	const validationWarnings: string[] = [];

	let date = "";
	let dateSourceMethod:
		| "SHEET_NAME"
		| "DATE_COLUMN"
		| "WORKBOOK_METADATA"
		| "INFERRED"
		| "SYSTEM_DATE" = "SYSTEM_DATE";
	const parsedRows: GtplEmployeeRow[] = [];

	for (const row of rows) {
		if (!row || row.length === 0) continue;
		const route = row[0] ? String(row[0]).trim() : "";
		const empId = row[3] ? String(row[3]).trim() : "";
		const name = row[4] ? String(row[4]).trim() : "";
		if (isSkipRow(route, empId, name)) continue;

		// Extract date from DATE_COLUMN if present
		if (!date && row[2]) {
			const dateResult = excelSerialToDate(row[2]);
			if (dateResult.date) {
				date = dateResult.date;
				dateSourceMethod = dateResult.method;
			}
		}

		parsedRows.push({
			route,
			empId: empId === "NA" ? "" : empId,
			name,
			phone: row[5] ? String(row[5]).trim() : "",
			email: row[6] ? String(row[6]).trim().toLowerCase() : "",
			address: row[7] ? String(row[7]).trim().replace(/\n/g, " ") : "",
			shiftTime: excelFractionToHHMM(row[8]),
			pickupPoint: row[9] ? String(row[9]).trim() : "",
			status: normalizeStatus(row[11] ? String(row[11]) : "YES"),
			driverDetails: row[12] ? String(row[12]).trim() : "",
			gender: row[13] === "F" ? "FEMALE" : "MALE",
			isPickup: /^P/i.test(route),
		});
	}

	// Date extraction with fallback strategy
	if (!date) {
		const inferred = inferDateFromSheetName(sheetName);
		if (inferred) {
			date = inferred;
			dateSourceMethod = "SHEET_NAME";
		} else {
			date = new Date().toISOString().split("T")[0];
			dateSourceMethod = "SYSTEM_DATE";
			validationWarnings.push(
				`Date could not be extracted from sheet name or columns. Using system date: ${date}`,
			);
		}
	}

	// Employee deduplication using: employeeCode > empId > name
	const employeeMap = new Map<string, GtplUniqueEmployee>();
	const absentNames = new Set<string>();
	let presentRowCount = 0;
	let absentRowCount = 0;
	let employeeDeduplicationMethod: "EMPLOYEE_CODE" | "EMP_ID" | "NAME" = "NAME";

	for (const row of parsedRows) {
		if (row.status === "NO SHOW") {
			absentRowCount++;
			absentNames.add(row.name.toLowerCase());
		} else {
			presentRowCount++;
		}

		// Deduplication priority: employeeCode > empId > name
		let key: string;
		if (row.empId && row.empId !== "") {
			key = row.empId.toLowerCase();
			employeeDeduplicationMethod = "EMP_ID";
		} else {
			key = row.name.toLowerCase();
			employeeDeduplicationMethod = "NAME";
		}

		const existing = employeeMap.get(key);
		const absent =
			row.status === "NO SHOW" || absentNames.has(row.name.toLowerCase());

		if (!existing) {
			// Generate employee code if not provided
			const employeeCode =
				row.empId || `EXCEL-${row.name.replace(/\s+/g, "-").toUpperCase()}`;

			employeeMap.set(key, {
				empId: row.empId || "",
				employeeCode, // Primary identifier
				excelEmployeeId: row.empId, // Original from Excel
				name: row.name,
				phone: row.phone || "9999999999",
				email:
					row.email ||
					`${row.name
						.toLowerCase()
						.replace(/[^a-z0-9]/g, ".")}@globallogic.com`,
				address: row.address || "Nagpur, Maharashtra",
				shiftTime: row.shiftTime,
				pickupPoint: row.pickupPoint,
				gender: row.gender,
				absent,
				pickupRoute: row.isPickup ? row.route : undefined,
			});
		} else {
			if (absent) existing.absent = true;
			if (row.isPickup) {
				existing.shiftTime = row.shiftTime;
				existing.pickupRoute = row.route;
				if (row.address) existing.address = row.address;
				if (row.pickupPoint) existing.pickupPoint = row.pickupPoint;
				if (row.empId && !existing.empId) existing.empId = row.empId;
				if (row.phone) existing.phone = row.phone;
				if (row.email) existing.email = row.email;
			}
		}
	}

	const pRoutesMap = new Map<string, GtplEmployeeRow[]>();
	for (const row of parsedRows.filter((r) => r.isPickup)) {
		if (!pRoutesMap.has(row.route)) pRoutesMap.set(row.route, []);
		pRoutesMap.get(row.route)!.push(row);
	}

	const routes: GtplRouteSummary[] = [];
	const safetyViolations: string[] = [];
	const underfilled: Array<{ route: string; count: number }> = [];
	const shiftBreakdown: Record<string, number> = {};
	const drivers = new Set<string>();
	const vehicles = new Set<string>();

	for (const [routeNo, rRows] of pRoutesMap) {
		let driverName = "Unknown";
		let driverPhone = "";
		let vehicleNumber = "";

		for (const r of rRows) {
			const d = r.driverDetails;
			if (!d || d.toLowerCase() === "driver details") continue;

			// Try to extract vehicle (Indian registration plate format)
			const vehicle = extractVehicle(d);
			if (vehicle) {
				vehicleNumber = vehicle;
				vehicles.add(vehicleNumber);
			}

			// Extract driver name and phone
			const { name, phone } = extractDriverNameAndPhone(d);
			if (name && name !== "Unknown") {
				driverName = name;
				if (phone) driverPhone = phone;
				drivers.add(driverName);
			}
		}

		const passengerRows = rRows.filter(
			(r) => r.name.toLowerCase() !== "escort",
		);
		const employees: GtplRouteSummary["employees"] = [];
		let presentCount = 0;
		let absentCount = 0;
		let stopOrder = 0;

		for (const r of passengerRows) {
			stopOrder++;
			const isAbsent = r.status === "NO SHOW";
			if (isAbsent) absentCount++;
			else {
				presentCount++;
				shiftBreakdown[r.shiftTime] = (shiftBreakdown[r.shiftTime] || 0) + 1;
			}
			employees.push({
				name: r.name,
				empId: r.empId,
				address: r.address,
				gender: r.gender,
				status: isAbsent ? "NO SHOW" : "YES",
				pickupPoint: r.pickupPoint,
				stopOrder,
				shiftTime: r.shiftTime,
			});
		}

		if (employees.length === 0) continue;

		const hasEscort = rRows.some((r) => r.name.toLowerCase() === "escort");
		const activeStops = employees
			.filter((e) => e.status !== "NO SHOW")
			.map((e) => ({ name: e.name, gender: e.gender as "MALE" | "FEMALE" }));

		if (!hasEscort && activeStops.length > 0) {
			const v = checkSafetyViolations(activeStops, true, false);
			if (
				v.some(
					(x) =>
						x.type === "FEMALE_FIRST_PICKUP" || x.type === "FEMALE_LAST_DROP",
				)
			) {
				if (!safetyViolations.includes(routeNo)) safetyViolations.push(routeNo);
			}
		}

		// Use configurable underfill threshold
		if (presentCount > 0 && presentCount < underfillThreshold) {
			underfilled.push({ route: routeNo, count: presentCount });
			validationWarnings.push(
				`Route ${routeNo} is underfilled: ${presentCount} passengers (threshold: ${underfillThreshold})`,
			);
		}

		routes.push({
			routeNo,
			driverName, // Never a phone number
			driverPhone, // Separate field
			vehicleNumber: vehicleNumber || "UNKNOWN",
			presentCount,
			absentCount,
			employees,
		});
	}

	routes.sort((a, b) =>
		a.routeNo.localeCompare(b.routeNo, undefined, { numeric: true }),
	);

	const employees = [...employeeMap.values()];
	const presentUniqueCount = employees.filter((e) => !e.absent).length;
	const absentUniqueCount = employees.filter((e) => e.absent).length;

	// Validation checks
	if (!date || date === "") {
		validationWarnings.push(
			"WARNING: Could not extract or infer date from sheet",
		);
	}
	if (employees.length === 0) {
		validationWarnings.push("WARNING: No employees parsed from sheet");
	}
	if (routes.length === 0) {
		validationWarnings.push("WARNING: No routes found in sheet");
	}
	if (safetyViolations.length > 0) {
		validationWarnings.push(
			`WARNING: Found ${safetyViolations.length} routes with safety violations`,
		);
	}

	// Log comprehensive parser diagnostics
	console.log("[GTPL PARSER]", {
		sheet: sheetName,
		date,
		dateSourceMethod,
		routes: routes.length,
		employees: employees.length,
		absent: absentUniqueCount,
		drivers: drivers.size,
		vehicles: vehicles.size,
		safetyViolations: safetyViolations.length,
		underfilled: underfilled.length,
		validationWarnings,
	});

	return {
		sheetName,
		date,
		dateSourceMethod,
		totalManifestRows: parsedRows.length,
		presentRowCount,
		absentRowCount,
		uniqueEmployeeCount: employees.length,
		presentUniqueCount,
		absentUniqueCount,
		cabsUsed: routes.length,
		shiftBreakdown,
		safetyViolations,
		absentEmployeeNames: employees.filter((e) => e.absent).map((e) => e.name),
		underfilled,
		employees,
		routes,
		drivers: [...drivers],
		vehicles: [...vehicles],
		diagnostics: {
			parserVersion: "2.0",
			baselineDistanceSource: "UNKNOWN", // Never fabricated
			underfillThreshold,
			validationWarnings,
			employeeDeduplicationMethod,
		},
	};
}

export function parseGtlpWorkbookSheet(
	buffer: Buffer,
	sheetName: string,
	options?: {
		underfillThreshold?: number;
		availableShifts?: { id: string; startTime: string }[];
	},
): GtplSheetParseResult {
	const workbook = xlsx.read(buffer, { type: "buffer" });
	const sheet = workbook.Sheets[sheetName];
	if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
	const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
	return parseGtlpSheetRows(rows, sheetName, options);
}

export function parseGtlpFileSheet(
	sheetName: string,
	filePath?: string,
	options?: {
		underfillThreshold?: number;
		availableShifts?: { id: string; startTime: string }[];
	},
): GtplSheetParseResult {
	const p = filePath || gtplWorkbookPath();
	const workbook = xlsx.readFile(p);
	const sheet = workbook.Sheets[sheetName];
	if (!sheet) throw new Error(`Sheet "${sheetName}" not found in ${p}`);
	const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
	return parseGtlpSheetRows(rows, sheetName, options);
}

export function listGtlpSheets(buffer: Buffer): Array<{
	name: string;
	inferredDate: string | null;
	routePreviewCount: number;
}> {
	const workbook = xlsx.read(buffer, { type: "buffer" });
	return workbook.SheetNames.map((name) => {
		const rows = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
			header: 1,
		});
		let count = 0;
		const seen = new Set<string>();
		for (const row of rows) {
			const c0 = row?.[0] ? String(row[0]).trim() : "";
			if (/^P/i.test(c0) && !seen.has(c0)) {
				seen.add(c0);
				count++;
			}
		}
		return {
			name,
			inferredDate: inferDateFromSheetName(name),
			routePreviewCount: count,
		};
	});
}
