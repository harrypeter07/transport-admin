import * as xlsx from "xlsx";
import { getDistance, makeDepot } from "@/lib/optimization";
import type { Employee, Shift } from "@prisma/client";

const AVG_SPEED_KM_MIN = 0.5;
const CIRCUITY = 1.3;

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export type ExcelParseSummary = {
  routeCount: number;
  employeeCount: number;
  noShowCount: number;
  sharedStopCount: number;
  absentEmployeeCodes: string[];
  unmatchedEmployeeCodes: string[];
  sheetName: string;
  source?: string;
};

export type ParsedExcelRoute = {
  id: string;
  routeNo: string;
  cabId: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  shiftId: string;
  shiftTime: string;
  isPickup: boolean;
  capacity: number;
  stops: Array<{
    employeeId: string;
    stopOrder: number;
    etaMinutes: number;
    status: string;
    pickupPoint?: string;
    pickupTime?: string;
    sharedStopKey?: string;
    employee: {
      id: string;
      name: string;
      employeeCode: string;
      gender: string;
      x: number;
      y: number;
      address: string;
    };
  }>;
  totalDistance: number;
  totalDuration: number;
  optimizationScore: number;
  violations: unknown[];
  hasEscort: boolean;
};

export type ExcelSheetInfo = {
  name: string;
  inferredDate: string | null;
  routePreviewCount: number;
};

/** Match sheet tab names even when trailing spaces or casing differ. */
export function resolveWorkbookSheetName(
  sheetNames: string[],
  requested?: string | null,
): string {
  if (!requested?.trim()) {
    return sheetNames[0] || "";
  }
  if (sheetNames.includes(requested)) {
    return requested;
  }
  const normalized = requested.trim().toLowerCase();
  const match = sheetNames.find(
    (name) =>
      name === requested ||
      name.trim().toLowerCase() === normalized ||
      name.toLowerCase() === normalized,
  );
  if (match) return match;
  throw new Error(
    `Sheet "${requested}" not found in workbook. Available: ${sheetNames.join(", ")}`,
  );
}

export function inferDateFromSheetName(name: unknown): string | null {
  if (name == null) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmySlash = trimmed.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmySlash) {
    const dd = dmySlash[1].padStart(2, "0");
    const mm = dmySlash[2].padStart(2, "0");
    return `${dmySlash[3]}-${mm}-${dd}`;
  }

  const dMonY = trimmed.match(/(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/i);
  if (dMonY) {
    const mm = MONTH_MAP[dMonY[2].toLowerCase().slice(0, 3)];
    if (mm) return `${dMonY[3]}-${mm}-${dMonY[1].padStart(2, "0")}`;
  }

  return null;
}

function countRoutesInSheet(rows: unknown[][]): number {
  const routeNos = new Set<string>();
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const col0 = row[0] ? String(row[0]).trim() : "";
    if (!col0 || col0.toLowerCase() === "rout no") continue;
    routeNos.add(col0);
  }
  return routeNos.size;
}

export function listExcelSheets(buffer: Buffer): ExcelSheetInfo[] {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    return {
      name,
      inferredDate: inferDateFromSheetName(name),
      routePreviewCount: countRoutesInSheet(rows),
    };
  });
}

function excelFractionToHHMM(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  const str = String(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return str.slice(0, 5);
  return null;
}

export function haversineKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const R = 6371;
  const dLat = ((b.y - a.y) * Math.PI) / 180;
  const dLon = ((b.x - a.x) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.y * Math.PI) / 180) *
      Math.cos((b.y * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * CIRCUITY;
}

function extractDriverFromRows(rows: unknown[][], idx: any): {
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
} {
  let vehicleNumber = "Unknown";
  let driverName = "Unknown";
  let driverPhone = "N/A";

  for (const row of rows) {
    const d = row[idx.driver] ? String(row[idx.driver]).trim() : "";
    if (!d) continue;
    if (/^(MH|CG|TS|AP|KA|DL|HR|UP)\d{2}[A-Z]{2}\d{4}/i.test(d.replace(/\s+/g, ""))) {
      vehicleNumber = d.replace(/\s+/g, "").toUpperCase();
    } else if (/^(MOB|mob|Mob)-?/i.test(d)) {
      driverPhone = d.replace(/^(MOB|mob|Mob)-?/i, "").trim();
    } else if (/^\d{10}$/.test(d.replace(/[- ]/g, ""))) {
      driverPhone = d.replace(/[- ]/g, "");
    } else {
      const cleaned = d.replace(/^(DRIVER|driver)[-=\s]?/i, "").trim();
      if (cleaned && !cleaned.replace(/[- ]/g, "").match(/^\d+$/)) {
        driverName = cleaned;
      }
    }
  }

  return { vehicleNumber, driverName, driverPhone };
}

function resolveShift(
  rows: unknown[][],
  dbShifts: Shift[],
  createShift: (data: { name: string; startTime: string; endTime: string }) => Promise<Shift>,
  idx: any
): Promise<{ shiftId: string; shiftTime: string }> {
  let parsedStartTime = "05:00";
  for (const row of rows) {
    const t = excelFractionToHHMM(row[idx.shiftTime]);
    if (t) parsedStartTime = t;
  }

  let dbShift = dbShifts.find((s) => s.startTime === parsedStartTime);
  if (!dbShift) {
    return createShift({
      name: `Shift ${parsedStartTime}`,
      startTime: parsedStartTime,
      endTime: "23:59",
    }).then((created) => {
      dbShifts.push(created);
      return { shiftId: created.id, shiftTime: parsedStartTime };
    });
  }
  return Promise.resolve({ shiftId: dbShift.id, shiftTime: parsedStartTime });
}

function matchEmployee(
  row: unknown[],
  byCode: Map<string, Employee>,
  byName: Map<string, Employee>,
  idx: any
): Employee | null {
  const code = row[idx.empId] ? String(row[idx.empId]).trim().toLowerCase() : "";
  const name = row[idx.name] ? String(row[idx.name]).trim().toLowerCase() : "";
  if (code && byCode.has(code)) {
    const matched = byCode.get(code)!;
    const dbName = matched.name.toLowerCase();
    if (dbName === name || dbName.includes(name) || name.includes(dbName)) {
      return matched;
    }
  }
  if (name && byName.has(name)) return byName.get(name)!;
  return null;
}

function isAbsentStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  return s === "NO SHOW" || s === "ABSENT" || s.startsWith("NO SHOW");
}

export async function parseExcelBufferToRoutes(
  buffer: Buffer,
  employees: Employee[],
  dbShifts: Shift[],
  depotLat: number,
  depotLng: number,
  createShift: (data: { name: string; startTime: string; endTime: string }) => Promise<Shift>,
  options?: { sheetName?: string }
): Promise<{ routes: ParsedExcelRoute[]; summary: ExcelParseSummary }> {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = resolveWorkbookSheetName(
    workbook.SheetNames,
    options?.sheetName || workbook.SheetNames[0],
  );
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  // ── Find Header & Resolve Column Indices Dynamically ──
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    if (row && row.some(cell => {
      const s = String(cell || "").toLowerCase();
      return s.includes("rout") || s.includes("emp id");
    })) {
      headerIdx = i;
      break;
    }
  }

  const header = (rows[headerIdx] || []).map(cell => String(cell || "").trim().toLowerCase());

  const findCol = (keywords: string[]) => {
    return header.findIndex(title => keywords.some(kw => title.includes(kw)));
  };

  const colIdx = {
    route: findCol(["rout no", "route"]),
    vendor: findCol(["vendor"]),
    empId: findCol(["emp id", "employee id", "employee code", "code"]),
    name: findCol(["name", "employee name", "emp name"]),
    phone: findCol(["contact", "phone", "mobile", "number"]),
    email: findCol(["email", "e mail", "mail id"]),
    address: findCol(["address"]),
    shiftTime: findCol(["shift time", "shift"]),
    pickupPoint: findCol(["pickup point", "pick up point", "pickup", "point"]),
    pickupTime: findCol(["pickup time", "time"]),
    status: findCol(["status", "present", "absent", "no show"]),
    driver: findCol(["driver"]),
    gender: findCol(["m/f", "gender", "sex"]),
  };

  const getIdx = (key: keyof typeof colIdx, fallback: number) => {
    return colIdx[key] !== -1 ? colIdx[key] : fallback;
  };

  const idx = {
    route: getIdx("route", 0),
    vendor: getIdx("vendor", 1),
    empId: getIdx("empId", 2),
    name: getIdx("name", 3),
    phone: getIdx("phone", 4),
    email: getIdx("email", 5),
    address: getIdx("address", 6),
    shiftTime: getIdx("shiftTime", 7),
    pickupPoint: getIdx("pickupPoint", 8),
    pickupTime: getIdx("pickupTime", 10),
    status: getIdx("status", 11),
    driver: getIdx("driver", 9),
    gender: getIdx("gender", 10),
  };

  const byCode = new Map(employees.map((e) => [e.employeeCode.toLowerCase(), e]));
  const byName = new Map(employees.map((e) => [e.name.toLowerCase(), e]));
  const depot = makeDepot(depotLat, depotLng);

  const routeGroups = new Map<string, unknown[][]>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0 = row[idx.route] ? String(row[idx.route]).trim() : "";
    if (!col0 || col0.toLowerCase() === "rout no") continue;
    if (!routeGroups.has(col0)) routeGroups.set(col0, []);
    routeGroups.get(col0)!.push(row);
  }

  const generatedRoutes: ParsedExcelRoute[] = [];
  let totalEmployees = 0;
  let noShowCount = 0;
  let sharedStopCount = 0;
  const absentEmployeeCodes: string[] = [];
  const unmatchedEmployeeCodes = new Set<string>();

  for (const [routeNo, rRows] of routeGroups) {
    const isPickup = /^P/i.test(routeNo);
    const isDrop = /^D/i.test(routeNo);
    const { vehicleNumber, driverName, driverPhone } = extractDriverFromRows(rRows, idx);
    const { shiftId, shiftTime } = await resolveShift(rRows, dbShifts, createShift, idx);

    const passengerRows = rRows.filter((row) => {
      const name = row[idx.name] ? String(row[idx.name]).trim().toLowerCase() : "";
      if (!name || name === "employee name" || name === "name" || name === "escort") return false;
      return true;
    });

    type StopEntry = {
      row: unknown[];
      emp: Employee | null;
      isNoShow: boolean;
      pickupPoint: string;
      pickupTime: string;
    };

    const entries: StopEntry[] = [];
    for (const row of passengerRows) {
      const status = row[idx.status] ? String(row[idx.status]).trim().toUpperCase() : "";
      const code = row[idx.empId] ? String(row[idx.empId]).trim() : "";
      if (isAbsentStatus(status)) {
        noShowCount++;
        if (code) absentEmployeeCodes.push(code);
        continue;
      }
      const emp = matchEmployee(row, byCode, byName, idx);
      if (!emp && code) unmatchedEmployeeCodes.add(code);
      entries.push({
        row,
        emp,
        isNoShow: false,
        pickupPoint: row[idx.pickupPoint] ? String(row[idx.pickupPoint]).trim() : "",
        pickupTime: (idx.pickupTime !== -1 && excelFractionToHHMM(row[idx.pickupTime])) || "",
      });
    }

    entries.sort((a, b) => {
      const ta = (idx.pickupTime !== -1 && typeof a.row[idx.pickupTime] === "number") ? (a.row[idx.pickupTime] as number) : 0;
      const tb = (idx.pickupTime !== -1 && typeof b.row[idx.pickupTime] === "number") ? (b.row[idx.pickupTime] as number) : 0;
      return ta - tb;
    });

    const pickupGroups = new Map<string, StopEntry[]>();
    for (const entry of entries) {
      const key = entry.pickupPoint || `__door_${entry.emp?.id || Math.random()}`;
      if (!pickupGroups.has(key)) pickupGroups.set(key, []);
      pickupGroups.get(key)!.push(entry);
    }

    if ([...pickupGroups.values()].some((g) => g.length > 1)) {
      sharedStopCount += [...pickupGroups.values()].filter((g) => g.length > 1).length;
    }

    const stops: ParsedExcelRoute["stops"] = [];
    let stopOrder = 0;
    let cumDist = 0;
    let cumDur = 0;
    let prevPt = depot;

    for (const [, group] of pickupGroups) {
      stopOrder++;
      const rep = group[0];
      const emp = rep.emp;
      const gender = rep.row[idx.gender] === "F" ? "FEMALE" : "MALE";
      const x = emp?.x ?? 0;
      const y = emp?.y ?? 0;
      const pt = { x, y };

      if (x && y) {
        const leg = haversineKm(prevPt, pt);
        cumDist += leg;
        cumDur += leg / AVG_SPEED_KM_MIN;
        prevPt = pt;
      }

      for (const entry of group) {
        const e = entry.emp;
        totalEmployees++;
        stops.push({
          employeeId: e?.id || `excel_${routeNo}_${stops.length}`,
          stopOrder,
          etaMinutes: Math.round(cumDur),
          status: "PENDING",
          pickupPoint: entry.pickupPoint || undefined,
          pickupTime: entry.pickupTime || undefined,
          sharedStopKey: group.length > 1 ? entry.pickupPoint || undefined : undefined,
          employee: {
            id: e?.id || `excel_${routeNo}_${stops.length}`,
            name: e?.name || String(entry.row[idx.name] || "Unknown"),
            employeeCode: e?.employeeCode || String(entry.row[idx.empId] || ""),
            gender: e?.gender || gender,
            x,
            y,
            address: e?.address || String(entry.row[idx.address] || "Unknown Address"),
          },
        });
      }
    }

    if (stops.length === 0) continue;

    if (prevPt.x && prevPt.y) {
      const depotLeg = haversineKm(prevPt, depot);
      cumDist += depotLeg;
      cumDur += depotLeg / AVG_SPEED_KM_MIN;
    }

    const hasEscort = rRows.some((r) => String(r[idx.name] || "").trim().toLowerCase() === "escort");

    generatedRoutes.push({
      id: `baseline_route_${routeNo}`,
      routeNo,
      cabId: `manual_${routeNo}`,
      vehicleNumber,
      driverName,
      driverPhone,
      shiftId,
      shiftTime,
      isPickup: isPickup || !isDrop,
      capacity: Math.max(4, stops.length > 4 ? 6 : 4),
      stops,
      totalDistance: Math.round(cumDist * 10) / 10,
      totalDuration: Math.round(cumDur),
      optimizationScore: 100,
      violations: [],
      hasEscort,
    });
  }

  return {
    routes: generatedRoutes,
    summary: {
      routeCount: generatedRoutes.length,
      employeeCount: totalEmployees,
      noShowCount,
      sharedStopCount,
      absentEmployeeCodes: [...new Set(absentEmployeeCodes)],
      unmatchedEmployeeCodes: [...unmatchedEmployeeCodes],
      sheetName,
    },
  };
}
