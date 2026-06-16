const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Load workbook
const workbookPath = path.join(
	__dirname,
	"../data",
	"GTPL Cab Sheet June 26  (3).xlsx",
);
const wb = XLSX.readFile(workbookPath);

console.log("=".repeat(80));
console.log("GTPL WORKBOOK SHEET STRUCTURE");
console.log("=".repeat(80));

// List all sheets
console.log("\nAvailable Sheets:");
wb.SheetNames.forEach((name, idx) => {
	console.log(`  ${idx + 1}. ${name}`);
});

// Check if "Routes and Driver details" sheet exists
const routesSheetName = wb.SheetNames.find(
	(name) =>
		name.toLowerCase().includes("route") &&
		name.toLowerCase().includes("driver"),
);

console.log("\n" + "=".repeat(80));
if (!routesSheetName) {
	console.log('ERROR: Could not find "Routes and Driver details" sheet');
	console.log("\nLooking for closest match...");
	const routeSheets = wb.SheetNames.filter((name) =>
		name.toLowerCase().includes("route"),
	);
	console.log('Sheets with "route":', routeSheets);
} else {
	console.log(`Found sheet: "${routesSheetName}"`);

	// Read the sheet
	const ws = wb.Sheets[routesSheetName];
	const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

	console.log("\n" + "=".repeat(80));
	console.log("SHEET HEADERS:");
	console.log("=".repeat(80));
	if (data.length > 0) {
		const headers = Object.keys(data[0]);
		headers.forEach((h, idx) => {
			console.log(`  Column ${idx}: "${h}"`);
		});

		console.log("\n" + "=".repeat(80));
		console.log("SAMPLE ROWS (First 5):");
		console.log("=".repeat(80));
		for (let i = 0; i < Math.min(5, data.length); i++) {
			console.log(`\nRow ${i + 1}:`);
			Object.entries(data[i]).forEach(([key, value]) => {
				if (value) console.log(`  ${key}: ${value}`);
			});
		}

		console.log("\n" + "=".repeat(80));
		console.log("SHEET STATISTICS:");
		console.log("=".repeat(80));
		console.log(`Total rows: ${data.length}`);
	} else {
		console.log("Sheet is empty or contains only headers");
	}
}

console.log("\n" + "=".repeat(80));
