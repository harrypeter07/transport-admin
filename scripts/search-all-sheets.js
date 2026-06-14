const XLSX = require("xlsx");
const path = require("path");

const file = path.join(__dirname, "..", "data", "test-roasters", "GTPL Cab Sheet June 26  (2).xlsx");

function main() {
  const wb = XLSX.readFile(file);
  console.log("Sheet names in workbook:", wb.SheetNames);

  const queryTerms = ["vajja", "prakash", "devalla", "meghana", "pathlavat", "sudheer", "bhanu"];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const matched = new Set();
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const name = row[4] ? String(row[4]).trim() : "";
      if (!name || name.toLowerCase() === "employee name" || name.toLowerCase() === "escort") continue;

      for (const term of queryTerms) {
        if (name.toLowerCase().includes(term)) {
          matched.add(`${name} (Row ${i}, Code ${row[3]}, Address "${row[7]}")`);
        }
      }
    }
    
    if (matched.size > 0) {
      console.log(`\nMatches in sheet "${sheetName}":`);
      [...matched].forEach(m => console.log(` - ${m}`));
    }
  }
}

main();
