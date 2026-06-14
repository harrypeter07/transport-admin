const XLSX = require("xlsx");
const path = require("path");

const file = path.join(__dirname, "..", "data", "test-roasters", "GTPL Cab Sheet June 26  (2).xlsx");

function main() {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets["12-6-26"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log("Detailed Row Audit for 12-6-26:");
  let count = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const col0 = row[0] ? String(row[0]).trim() : "";
    const empId = row[3] ? String(row[3]).trim() : "";
    const name = row[4] ? String(row[4]).trim() : "";
    
    if (empId || name) {
      count++;
      console.log(`Row ${i}: [RouteNo=${col0}, EmpID=${empId}, Name=${name}, Gender=${row[13]}]`);
    }
  }
  console.log(`Total rows with EmpID or Name: ${count}`);
}

main();
