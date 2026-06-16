const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

function normalizeEmployee(name) {
	return name?.toString()?.trim()?.toUpperCase() || "";
}

const excelPath = path.join(
	process.cwd(),
	"data",
	"GTPL Cab Sheet June 26  (3).xlsx",
);

if (!fs.existsSync(excelPath)) {
	console.error(`❌ Excel file not found: ${excelPath}`);
	process.exit(1);
}

const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets["16-6-26"];

if (!sheet) {
	console.error("❌ Sheet 16-6-26 not found");
	process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Parse like the sync script does
let empNameCol = -1;
let headerRow = rows[0] || [];

for (let i = 0; i < headerRow.length; i++) {
	const col = normalizeEmployee(headerRow[i]);
	if (col.includes("NAME") || col.includes("EMPLOYEE")) {
		empNameCol = i;
		break;
	}
}

if (empNameCol === -1) empNameCol = 4; // fallback

const allNames = [];
const uniqueNormalizedNames = new Set();
const uniqueOriginalNames = new Set();

for (let i = 1; i < rows.length; i++) {
	const row = rows[i];
	if (!row || row.length < 2) continue;

	const empName = normalizeEmployee(row[empNameCol]);
	if (!empName || empName === "NAME") continue;
	if (empName.startsWith("MOB")) continue;

	const originalName = row[empNameCol];
	allNames.push(originalName);
	uniqueNormalizedNames.add(empName);
	uniqueOriginalNames.add(originalName);
}

console.log("=".repeat(80));
console.log("WORKBOOK NAME ANALYSIS - Sheet 16-6-26");
console.log("=".repeat(80));

console.log(`\n📊 Statistics:`);
console.log(`   Total rows (including header): ${rows.length}`);
console.log(`   Data rows processed: ${allNames.length}`);
console.log(`   Unique original names: ${uniqueOriginalNames.size}`);
console.log(`   Unique normalized names: ${uniqueNormalizedNames.size}`);

console.log(`\n🔍 Normalized names (first 20):`);
Array.from(uniqueNormalizedNames)
	.sort()
	.slice(0, 20)
	.forEach((name) => console.log(`   - ${name}`));

if (uniqueNormalizedNames.size > 20) {
	console.log(`   ... and ${uniqueNormalizedNames.size - 20} more`);
}

// Check for duplicates
const nameFreq = new Map();
allNames.forEach((name) => {
	const normalized = normalizeEmployee(name);
	nameFreq.set(normalized, (nameFreq.get(normalized) || 0) + 1);
});

const duplicates = Array.from(nameFreq.entries())
	.filter(([, count]) => count > 1)
	.sort((a, b) => b[1] - a[1]);

console.log(`\n⚠️  Employees appearing multiple times:`);
console.log(`   Count: ${duplicates.length}`);
duplicates.slice(0, 10).forEach(([name, count]) => {
	console.log(`   ${name}: ${count} times`);
});

if (duplicates.length > 10) {
	console.log(`   ... and ${duplicates.length - 10} more`);
}
