import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const SOURCE_DIR = path.join(process.cwd(), "data", "test-roasters");
const SOURCE_FILE = path.join(SOURCE_DIR, "GTPL Cab Sheet June 26  (2).xlsx");

const OUT_DIR_LOCAL = path.join(process.cwd(), "data", "test-rosters");
const OUT_DIR_LEGACY = path.join(process.cwd(), "data", "outputs");

function ensureDirectoryExists(dir: string) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } catch (err: any) {
      console.warn(`Could not create directory ${dir}: ${err.message}`);
    }
  }
}

function saveWorkbook(wb: XLSX.WorkBook, baseName: string, sheetRename?: { from: string; to: string }) {
  if (sheetRename && wb.Sheets[sheetRename.from]) {
    wb.Sheets[sheetRename.to] = wb.Sheets[sheetRename.from];
    delete wb.Sheets[sheetRename.from];
    const idx = wb.SheetNames.indexOf(sheetRename.from);
    if (idx >= 0) wb.SheetNames[idx] = sheetRename.to;
  }

  ensureDirectoryExists(OUT_DIR_LOCAL);
  ensureDirectoryExists(OUT_DIR_LEGACY);

  const localPath = path.join(OUT_DIR_LOCAL, baseName);
  const legacyPath = path.join(OUT_DIR_LEGACY, baseName);

  XLSX.writeFile(wb, localPath);
  console.log(`Saved: ${localPath}`);
  try {
    XLSX.writeFile(wb, legacyPath);
  } catch {
    /* optional */
  }
}

function main() {
  console.log(`Loading source workbook from: ${SOURCE_FILE}`);
  if (!fs.existsSync(SOURCE_FILE)) {
    console.error(`Source file not found at ${SOURCE_FILE}`);
    process.exit(1);
  }

  // Scenario A — baseline copy (12-June) as 14-6-26 high absence will be B
  const wbA = XLSX.readFile(SOURCE_FILE);
  saveWorkbook(wbA, "test-scenario-A.xlsx", { from: "12-6-26", to: "14-6-26" });

  // Scenario B — high absence (15 NO SHOW on sheet 14-6-26)
  const wbB = XLSX.readFile(SOURCE_FILE);
  const sheetB = wbB.Sheets["12-6-26"];
  if (sheetB) {
    const rowsB = XLSX.utils.sheet_to_json<any[]>(sheetB, { header: 1 });
    const absentNames = new Set([
      "aniket anand", "nitin gujar", "dipali sharma", "pavani", "anima dixit",
      "sagar", "sakshi", "vansh rewaskar", "prashant pathlavat", "aryan shende",
      "shravan meshram", "prachi jain", "meghana b u", "atharva deo", "shubhankar das",
    ]);

    for (let i = 0; i < rowsB.length; i++) {
      const row = rowsB[i];
      if (!row || row.length === 0) continue;
      const name = row[4] ? String(row[4]).trim().toLowerCase() : "";
      if (name && absentNames.has(name)) {
        row[11] = "NO SHOW"; // Column index 11 is Status
      }
    }

    const newSheetB = XLSX.utils.aoa_to_sheet(rowsB);
    wbB.Sheets["14-6-26"] = newSheetB;
    delete wbB.Sheets["12-6-26"];
    wbB.SheetNames = wbB.SheetNames.filter((n) => n !== "12-6-26");
    if (!wbB.SheetNames.includes("14-6-26")) wbB.SheetNames.push("14-6-26");
    saveWorkbook(wbB, "test-scenario-B.xlsx");
  } else {
    console.error("Sheet 12-6-26 not found in Scenario B!");
  }

  // 3. Generate Scenario C (Female Safety Violations)
  // Scenario C represents female safety violations where one route contains a female first pickup warning
  // and another is a low-severity all-female route.
  const wbC = XLSX.readFile(SOURCE_FILE);
  const sheetC = wbC.Sheets["12-6-26"];
  if (sheetC) {
    const rowsC = XLSX.utils.sheet_to_json<any[]>(sheetC, { header: 1 });

    let p1StopsSeen = 0;
    let p2StopsSeen = 0;

    for (let i = 0; i < rowsC.length; i++) {
      const row = rowsC[i];
      if (!row || row.length === 0) continue;
      const routeNo = row[0] ? String(row[0]).trim() : "";
      const empName = row[4] ? String(row[4]).trim() : "";

      if (routeNo === "P1") {
        if (empName.toLowerCase() === "escort") {
          rowsC[i] = [];
          continue;
        }
        
        if (p1StopsSeen === 0) {
          row[4] = "Akansha Khode"; // Female Name
          row[11] = "YES"; // Status
          row[13] = "F"; // Gender
          p1StopsSeen++;
        } else if (p1StopsSeen === 1) {
          row[4] = "Adarsh Kumar"; // Male Name
          row[11] = "YES"; // Status
          row[13] = "M"; // Gender
          p1StopsSeen++;
        }
      }

      if (routeNo === "P2") {
        if (empName.toLowerCase() === "escort") {
          rowsC[i] = [];
          continue;
        }

        row[4] = `Female Passenger ${p2StopsSeen + 1}`;
        row[11] = "YES";
        row[13] = "F";
        p2StopsSeen++;
      }
    }

    const cleanedRowsC = rowsC.filter(r => r && r.length > 0);
    const newSheetC = XLSX.utils.aoa_to_sheet(cleanedRowsC);
    wbC.Sheets["12-6-26"] = newSheetC;
    saveWorkbook(wbC, "test-scenario-C.xlsx", { from: "12-6-26", to: "16-6-26" });
  } else {
    console.error("Sheet 12-6-26 not found in Scenario C!");
  }

  // Also export GTPL 12-June baseline copy for testing
  const wbBase = XLSX.readFile(SOURCE_FILE);
  saveWorkbook(wbBase, "gtpl-12-6-26-baseline.xlsx");

  console.log("Test Excel workbooks saved under data/test-rosters/");
}

main();
