const XLSX = require("xlsx");
const path = require("path");

const file = path.join(__dirname, "..", "data", "test-roasters", "GTPL Cab Sheet June 26  (2).xlsx");

function main() {
  const wb = XLSX.readFile(file);
  const sheetName = "12-6-26";
  const sheet = wb.Sheets[sheetName];
  
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log(`Total rows: ${rows.length}`);
  
  const routePrefixes = new Set();
  const allNames = [];
  const nameToRows = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    const routeNo = row[0] ? String(row[0]).trim() : "";
    if (routeNo && routeNo.toLowerCase() !== "rout no" && routeNo !== "-") {
      if (routeNo.startsWith("P") || routeNo.startsWith("D")) {
        routePrefixes.add(routeNo.charAt(0));
      }
    }
    
    const code = row[3] ? String(row[3]).trim() : "";
    const name = row[4] ? String(row[4]).trim() : "";
    
    if (code && name && name.toLowerCase() !== "employee name" && name.toLowerCase() !== "name" && name.toLowerCase() !== "escort") {
      allNames.push(name);
      const list = nameToRows.get(name.toLowerCase()) || [];
      list.push({ rowIndex: i, routeNo, row });
      nameToRows.set(name.toLowerCase(), list);
    }
  }

  console.log("Route prefixes found (should be P and D):", [...routePrefixes]);
  console.log(`Total employee occurrences: ${allNames.length}`);
  console.log(`Unique lowercase names: ${nameToRows.size}`);

  const variations = [
    ["Devalla Kumar", "Devalla Sudheer Kumar"],
    ["Meghana B U", "Meghana U"],
    ["Prashant Pathlavat", "Prashanth Pathlavath"],
    ["Vajja Bhanu Prakash", "Vajja Prakash"]
  ];

  console.log("\n--- Checking name variations ---");
  for (const pair of variations) {
    console.log(`\nChecking: "${pair[0]}" vs "${pair[1]}"`);
    for (const name of pair) {
      const occ = nameToRows.get(name.toLowerCase());
      if (occ) {
        console.log(`  - "${name}" exists (${occ.length} times):`);
        for (const o of occ) {
          console.log(`    Row ${o.rowIndex}: Route=${o.routeNo}, Code=${o.row[3]}, Address="${o.row[7]}", Gender=${o.row[13]}`);
        }
      } else {
        console.log(`  - "${name}" does NOT exist in sheet.`);
      }
    }
  }
}

main();
