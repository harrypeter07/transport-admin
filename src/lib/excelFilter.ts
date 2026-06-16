import path from "path";
import fs from "fs";
import { parseGtlpFileSheet, parseGtlpWorkbookSheet, listGtlpSheets, gtplWorkbookPath } from "./gtplParser";

function getSheetNameFromDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return "";
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${day}-${month}-${year.slice(-2)}`;
}

const NAME_VARIATIONS: Record<string, string> = {
  "devalla kumar": "devalla sudheer kumar",
  "devalla sudheer kumar": "devalla sudheer kumar",
  "meghana u": "meghana b u",
  "meghana b u": "meghana b u",
  "prashanth pathlavath": "prashant pathlavat",
  "prashant pathlavat": "prashant pathlavat",
  "vajja prakash": "vajja bhanu prakash",
  "vajja bhanu prakash": "vajja bhanu prakash",
};

function normalizeName(name: string): string {
  const lower = name.trim().toLowerCase();
  return NAME_VARIATIONS[lower] || lower;
}

function workbookCandidates(): string[] {
  return [
    gtplWorkbookPath(),
    path.join(process.cwd(), "data", "test-rosters", "gtpl-12-6-26-baseline.xlsx"),
    path.join(process.cwd(), "data", "test-rosters", "test-scenario-A.xlsx"),
    path.join(process.cwd(), "data", "test-rosters", "roster.xlsx"),
  ];
}

export function getExcelFilterForDate(dateStr: string) {
  try {
    const sheetName = getSheetNameFromDate(dateStr);
    if (!sheetName) return null;

    for (const filePath of workbookCandidates()) {
      if (!fs.existsSync(filePath)) continue;

      try {
        const buffer = fs.readFileSync(filePath);
        const sheetList = listGtlpSheets(buffer);
        const sheets = sheetList.map((s) => (typeof s === "string" ? s : s.name));
        if (!sheets.includes(sheetName)) continue;

        const parsed = parseGtlpWorkbookSheet(buffer, sheetName);
        const employeeNames = new Set<string>();
        const cabVehicleNumbers = new Set<string>();

        for (const emp of parsed.employees) {
          if (!emp.absent) employeeNames.add(normalizeName(emp.name));
        }

        if (employeeNames.size === 0) {
          console.warn(`Excel filter sheet "${sheetName}" in ${filePath} has 0 active employees. Skipping filter.`);
          continue;
        }

        for (const route of parsed.routes) {
          if (route.vehicleNumber.startsWith("MH")) {
            cabVehicleNumbers.add(route.vehicleNumber.replace(/\s+/g, "").toUpperCase());
          }
        }
        for (const v of parsed.vehicles) {
          cabVehicleNumbers.add(v.replace(/\s+/g, "").toUpperCase());
        }

        console.log(
          `Excel Filter for ${dateStr} (${sheetName}): Found ${employeeNames.size} unique employee names, ${cabVehicleNumbers.size} cab vehicle numbers.`
        );
        return { employeeNames, cabVehicleNumbers };
      } catch {
        /* try file-path parser fallback */
        try {
          const parsed = parseGtlpFileSheet(sheetName, filePath);
          const employeeNames = new Set<string>();
          const cabVehicleNumbers = new Set<string>();
          for (const emp of parsed.employees) {
            if (!emp.absent) employeeNames.add(normalizeName(emp.name));
          }

          if (employeeNames.size === 0) {
            continue;
          }

          for (const route of parsed.routes) {
            if (route.vehicleNumber.startsWith("MH")) {
              cabVehicleNumbers.add(route.vehicleNumber.replace(/\s+/g, "").toUpperCase());
            }
          }
          for (const v of parsed.vehicles) {
            cabVehicleNumbers.add(v.replace(/\s+/g, "").toUpperCase());
          }
          return { employeeNames, cabVehicleNumbers };
        } catch {
          continue;
        }
      }
    }

    console.warn(`Excel sheet "${sheetName}" not found for date "${dateStr}".`);
    return null;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Failed to parse Excel filter for date:", dateStr, message);
    return null;
  }
}
