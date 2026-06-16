const XLSX = require("xlsx");

const wb = XLSX.readFile("data/GTPL Cab Sheet June 26  (3).xlsx");
const ws = wb.Sheets["Routes and Driver details "];
const data = XLSX.utils.sheet_to_json(ws);

console.log("Headers:", Object.keys(data[0] || {}));
console.log("\nFirst 5 rows:");
data.slice(0, 5).forEach((r, i) => {
	console.log(`\nRow ${i}:`);
	Object.entries(r).forEach(([k, v]) => {
		if (v) console.log(`  ${k}: ${v}`);
	});
});

console.log(`\nTotal rows: ${data.length}`);
