const xlsx = require('xlsx');

try {
  const workbook = xlsx.readFile('roster.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log("Sheet Name:", sheetName);
  console.log("First 5 rows:");
  console.log(JSON.stringify(data.slice(0, 5), null, 2));
} catch (err) {
  console.error("Error reading Excel:", err.message);
}
