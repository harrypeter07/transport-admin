const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const file = path.join(__dirname, "..", "data", "test-roasters", "GTPL Cab Sheet June 26  (2).xlsx");

function main() {
  const wb = XLSX.readFile(file);
  const sheetName = "12-6-26";
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.error(`Sheet "${sheetName}" not found. Available sheets: ${wb.SheetNames.join(", ")}`);
    return;
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Total raw rows in sheet "${sheetName}": ${rows.length}`);

  // Let's print the first 15 rows to understand the format
  console.log("\n--- First 15 Rows ---");
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    console.log(`Row ${i}:`, rows[i]);
  }

  // Count employees in column 4 (index 3) and column 5 (index 4)
  const employeeNames = new Set();
  const allParsedRows = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0 = row[0] ? String(row[0]).trim() : "";
    
    // Check if it looks like an employee row
    const code = row[3] ? String(row[3]).trim() : "";
    const name = row[4] ? String(row[4]).trim() : "";
    if (code && name && name.toLowerCase() !== "employee name" && name.toLowerCase() !== "name" && name.toLowerCase() !== "escort") {
      employeeNames.add(name);
      allParsedRows.push({ rowIndex: i, code, name, row });
    }
  }

  console.log(`\nUnique employee names parsed by basic criteria: ${employeeNames.size}`);
  console.log(`Total employee rows parsed: ${allParsedRows.length}`);

  console.log("\nList of all parsed employee names:");
  const sortedNames = [...employeeNames].sort();
  sortedNames.forEach((n, idx) => {
    console.log(`${idx + 1}. ${n}`);
  });
}

main();
