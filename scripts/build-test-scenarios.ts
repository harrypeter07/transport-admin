/**
 * Generates test roster Excel files from data/excel_routes.json
 * Run: npx ts-node --transpile-only scripts/build-test-scenarios.ts
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const OUT_DIR = path.join(process.cwd(), "data", "test-rosters");
const JSON_PATH = path.join(process.cwd(), "data", "excel_routes.json");

type JsonRoute = {
  cab?: { vehicleNumber?: string; driverName?: string; driverPhone?: string; capacity?: number };
  shift?: { startTime?: string };
  stops: Array<{
    employee: {
      employeeCode?: string;
      name: string;
      gender: string;
      address?: string;
      x?: number;
      y?: number;
    };
    stopOrder: number;
    pickupPoint?: string;
  }>;
};

function timeToFraction(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h || 0) * 60 + (m || 0)) / (24 * 60);
}

function buildRowsFromRoutes(routes: JsonRoute[], options?: {
  absentCodes?: Set<string>;
  femaleFirstRouteIndex?: number;
}): unknown[][] {
  const header = [
    "Rout No", "", "", "Emp Code", "Employee Name", "", "", "Address",
    "Shift Time", "Pickup Point", "Pickup Time", "Status", "Driver Info", "Gender",
  ];
  const rows: unknown[][] = [header];

  routes.forEach((route, routeIdx) => {
    const routeNo = `P${routeIdx + 1}`;
    const vehicle = route.cab?.vehicleNumber || `MH-TEST-${routeIdx + 1}`;
    const driverName = route.cab?.driverName || "Driver";
    const driverPhone = route.cab?.driverPhone || "9999999999";
    const shiftTime = timeToFraction(route.shift?.startTime || "05:00");

    let stops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);

    if (options?.femaleFirstRouteIndex === routeIdx && stops.length >= 2) {
      const femaleIdx = stops.findIndex((s) => s.employee.gender === "FEMALE");
      const maleIdx = stops.findIndex((s) => s.employee.gender === "MALE");
      if (femaleIdx >= 0 && maleIdx >= 0) {
        const reordered = [...stops];
        const female = reordered.splice(femaleIdx, 1)[0];
        reordered.unshift(female);
        stops = reordered;
      }
    }

    stops.forEach((stop, stopIdx) => {
      const emp = stop.employee;
      const code = emp.employeeCode || emp.name.replace(/\s+/g, "-").toUpperCase();
      const isAbsent = options?.absentCodes?.has(code);
      const pickupTime = timeToFraction(
        `${String(4 + Math.floor(stopIdx / 2)).padStart(2, "0")}:${String((stopIdx * 7) % 60).padStart(2, "0")}`
      );

      rows.push([
        routeNo,
        "",
        "",
        code,
        emp.name,
        "",
        "",
        emp.address || "Nagpur, Maharashtra",
        shiftTime,
        stop.pickupPoint || `Door-${code}`,
        pickupTime,
        isAbsent ? "NO SHOW" : "",
        stopIdx === 0 ? vehicle : "",
        emp.gender === "FEMALE" ? "F" : "M",
      ]);

      if (stopIdx === 0) {
        rows.push([routeNo, "", "", "", driverName, "", "", "", "", "", "", "", driverPhone, ""]);
      }
    });
  });

  return rows;
}

function writeWorkbook(filename: string, sheets: Record<string, unknown[][]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const outPath = path.join(OUT_DIR, filename);
  XLSX.writeFile(wb, outPath);
  console.log(`  Wrote ${outPath}`);
}

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error("Missing data/excel_routes.json — run parse-excel-routes first or add roster.");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allRoutes: JsonRoute[] = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));
  const pickupRoutes = allRoutes.filter((r) => r.stops.length > 0).slice(0, 12);

  const allCodes = new Set<string>();
  pickupRoutes.forEach((r) =>
    r.stops.forEach((s) => {
      const code = s.employee.employeeCode || s.employee.name;
      if (code) allCodes.add(code);
    })
  );
  const absentList = [...allCodes].slice(0, 12);

  writeWorkbook("scenario-2026-06-01-baseline.xlsx", {
    "2026-06-01": buildRowsFromRoutes(pickupRoutes),
  });

  writeWorkbook("scenario-2026-06-02-high-absence.xlsx", {
    "2026-06-02": buildRowsFromRoutes(pickupRoutes, {
      absentCodes: new Set(absentList),
    }),
  });

  const femaleFirstIdx = pickupRoutes.findIndex((r) =>
    r.stops.some((s) => s.employee.gender === "FEMALE") &&
    r.stops.some((s) => s.employee.gender === "MALE")
  );

  writeWorkbook("scenario-2026-06-03-female-first.xlsx", {
    "2026-06-03": buildRowsFromRoutes(pickupRoutes, {
      femaleFirstRouteIndex: femaleFirstIdx >= 0 ? femaleFirstIdx : 0,
    }),
  });

  writeWorkbook("roster.xlsx", {
    "2026-06-01": buildRowsFromRoutes(pickupRoutes),
    "2026-06-02": buildRowsFromRoutes(pickupRoutes, { absentCodes: new Set(absentList) }),
    "2026-06-03": buildRowsFromRoutes(pickupRoutes, {
      femaleFirstRouteIndex: femaleFirstIdx >= 0 ? femaleFirstIdx : 0,
    }),
  });

  console.log(`\nGenerated 4 workbooks in ${OUT_DIR}`);
  console.log(`  Absent codes (scenario B): ${absentList.join(", ")}`);
  console.log(`  Female-first route index: ${femaleFirstIdx}`);
}

main();
