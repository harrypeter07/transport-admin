import * as xlsx from "xlsx";
import path from "path";
import fs from "fs";
import { inferDateFromSheetName } from "@/lib/excelParser";
import { checkSafetyViolations } from "@/lib/optimization";

export const GTPL_WORKBOOK_PATH = path.join(
  process.cwd(),
  "data",
  "test-roasters",
  "GTPL Cab Sheet June 26  (2).xlsx"
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
  driver: string;
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

export function excelSerialToDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = xlsx.SSF.parse_date_code(value);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const inferred = inferDateFromSheetName(String(value || ""));
  return inferred;
}

function isSkipRow(route: string, empId: string, name: string): boolean {
  if (!route || route === "-" || route.toLowerCase() === "rout no") return true;
  if (!name || name.toLowerCase() === "escort") return true;
  if (empId.toLowerCase() === "escort") return true;
  if (name.toLowerCase() === "employee name" || name.toLowerCase() === "name") return true;
  return false;
}

function normalizeStatus(status: string): "YES" | "NO SHOW" {
  const s = status.trim().toUpperCase();
  if (s.includes("NO SHOW") || s === "ABSENT") return "NO SHOW";
  return "YES";
}

function extractVehicle(driverCol: string): string {
  const d = driverCol.trim();
  if (/^MH/i.test(d)) return d.replace(/\s+/g, "");
  return "";
}

export function parseGtlpSheetRows(rows: unknown[][], sheetName: string): GtplSheetParseResult {
  let date = "";
  const parsedRows: GtplEmployeeRow[] = [];

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const route = row[0] ? String(row[0]).trim() : "";
    const empId = row[3] ? String(row[3]).trim() : "";
    const name = row[4] ? String(row[4]).trim() : "";
    if (isSkipRow(route, empId, name)) continue;

    if (!date && row[2]) {
      date = excelSerialToDate(row[2]) || "";
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

  if (!date) date = inferDateFromSheetName(sheetName) || new Date().toISOString().split("T")[0];

  const employeeMap = new Map<string, GtplUniqueEmployee>();
  const absentNames = new Set<string>();
  let presentRowCount = 0;
  let absentRowCount = 0;

  for (const row of parsedRows) {
    if (row.status === "NO SHOW") {
      absentRowCount++;
      absentNames.add(row.name.toLowerCase());
    } else {
      presentRowCount++;
    }

    const key = row.name.toLowerCase();
    const existing = employeeMap.get(key);
    const absent = row.status === "NO SHOW" || absentNames.has(key);

    if (!existing) {
      employeeMap.set(key, {
        empId: row.empId || `EXCEL-${key.replace(/\s+/g, "-").toUpperCase()}`,
        name: row.name,
        phone: row.phone || "9999999999",
        email: row.email || `${key.replace(/[^a-z0-9]/g, ".")}@globallogic.com`,
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
        if (row.empId) existing.empId = row.empId;
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
    let driver = "Unknown";
    let vehicleNumber = "";
    for (const r of rRows) {
      const d = r.driverDetails;
      if (!d || d.toLowerCase() === "driver details") continue;
      if (/^MH/i.test(d)) {
        vehicleNumber = extractVehicle(d);
        vehicles.add(vehicleNumber);
      } else if (/^driver/i.test(d) || /^mob/i.test(d)) {
        driver = d;
        drivers.add(d);
      }
    }

    const passengerRows = rRows.filter((r) => r.name.toLowerCase() !== "escort");
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
      if (v.some((x) => x.type === "FEMALE_FIRST_PICKUP" || x.type === "FEMALE_LAST_DROP")) {
        if (!safetyViolations.includes(routeNo)) safetyViolations.push(routeNo);
      }
    }

    if (presentCount > 0 && presentCount < 3) {
      underfilled.push({ route: routeNo, count: presentCount });
    }

    routes.push({
      routeNo,
      driver,
      vehicleNumber: vehicleNumber || driver,
      presentCount,
      absentCount,
      employees,
    });
  }

  routes.sort((a, b) => a.routeNo.localeCompare(b.routeNo, undefined, { numeric: true }));

  const employees = [...employeeMap.values()];
  const presentUniqueCount = employees.filter((e) => !e.absent).length;
  const absentUniqueCount = employees.filter((e) => e.absent).length;

  return {
    sheetName,
    date,
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
  };
}

export function parseGtlpWorkbookSheet(
  buffer: Buffer,
  sheetName: string
): GtplSheetParseResult {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  return parseGtlpSheetRows(rows, sheetName);
}

export function parseGtlpFileSheet(sheetName: string, filePath?: string): GtplSheetParseResult {
  const p = filePath || gtplWorkbookPath();
  const workbook = xlsx.readFile(p);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in ${p}`);
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  return parseGtlpSheetRows(rows, sheetName);
}

export function listGtlpSheets(buffer: Buffer): Array<{
  name: string;
  inferredDate: string | null;
  routePreviewCount: number;
}> {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name) => {
    const rows = xlsx.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1 });
    let count = 0;
    const seen = new Set<string>();
    for (const row of rows) {
      const c0 = row?.[0] ? String(row[0]).trim() : "";
      if (/^P/i.test(c0) && !seen.has(c0)) {
        seen.add(c0);
        count++;
      }
    }
    return { name, inferredDate: inferDateFromSheetName(name), routePreviewCount: count };
  });
}

export function shiftIdFromTime(shiftTime: string): string {
  if (shiftTime.startsWith("07:")) return "shift-0700";
  if (shiftTime.startsWith("09:")) return "shift-0900";
  if (shiftTime.startsWith("10:")) return "shift-1000";
  if (shiftTime.startsWith("13:")) return "shift-1300";
  return "shift-0500";
}
