const XLSX = require("xlsx");
const path = require("path");

const file = path.join(__dirname, "..", "data", "test-roasters", "GTPL Cab Sheet June 26  (2).xlsx");

function main() {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets["12-6-26"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const nameMap = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const routeNo = row[0] ? String(row[0]).trim() : "";
    const empId = row[3] ? String(row[3]).trim() : "";
    const name = row[4] ? String(row[4]).trim() : "";

    if (!name || name.toLowerCase() === "employee name" || name.toLowerCase() === "escort" || name.toLowerCase() === "name") {
      continue;
    }

    if (routeNo.toLowerCase() === "rout no") continue;

    const list = nameMap.get(name.toLowerCase()) || [];
    list.push({ rowIndex: i, routeNo, empId, gender: row[13] });
    nameMap.set(name.toLowerCase(), list);
  }

  console.log(`Total unique names found: ${nameMap.size}`);
  let totalOccurrences = 0;
  
  const sortedNames = [...nameMap.keys()].sort();
  sortedNames.forEach((n, idx) => {
    const occ = nameMap.get(n);
    totalOccurrences += occ.length;
    console.log(`${idx + 1}. "${occ[0].name || n}" (count: ${occ.length}):`);
    for (const o of occ) {
      console.log(`   Row ${o.rowIndex}: Route ${o.routeNo}, EmpID: "${o.empId}", Gender: ${o.gender}`);
    }
  });

  console.log(`Total occurrences: ${totalOccurrences}`);
}

main();
