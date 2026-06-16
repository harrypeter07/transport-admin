const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('═'.repeat(100));
console.log('HEADER POLLUTION CLEANUP - Fix data quality before sync');
console.log('═'.repeat(100));

const workbookPath = path.join(__dirname, '../data', 'GTPL Cab Sheet June 26  (3).xlsx');
const backupPath = path.join(__dirname, '../data', 'GTPL Cab Sheet June 26 (BACKUP BEFORE CLEANUP).xlsx');

// Create backup
console.log('\n1. Creating backup...');
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(workbookPath, backupPath);
  console.log(`   ✅ Backup created: ${backupPath}`);
} else {
  console.log(`   ℹ️  Backup already exists, skipping`);
}

const wb = XLSX.readFile(workbookPath);
const dailySheets = wb.SheetNames.filter(name => /^\d{1,2}-\d{1,2}-\d{2}$/.test(name.trim()));

console.log('\n2. Cleaning header pollution...');

let totalHeaderRowsRemoved = 0;

for (const sheetName of dailySheets) {
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Filter out header pollution rows
  const cleanedData = data.filter(row => {
    const name = (row['Name'] || '').toString().trim();
    const empId = (row['Emp ID'] || '').toString().trim();
    const email = (row['E mail ID'] || '').toString().trim();

    // Keep only rows that DON'T match header patterns
    const isHeaderPollution = name === 'Name' || empId === 'Emp ID' || email === 'E mail ID';
    return !isHeaderPollution;
  });

  const headerRowsInSheet = data.length - cleanedData.length;
  totalHeaderRowsRemoved += headerRowsInSheet;

  // Create new worksheet with cleaned data
  const newWs = XLSX.utils.json_to_sheet(cleanedData);
  wb.Sheets[sheetName] = newWs;

  console.log(`   ${sheetName}: Removed ${headerRowsInSheet} header rows (${data.length} → ${cleanedData.length})`);
}

console.log('\n3. Saving cleaned workbook...');
XLSX.writeFile(wb, workbookPath);
console.log(`   ✅ Workbook updated: ${workbookPath}`);

console.log('\n' + '═'.repeat(100));
console.log('CLEANUP SUMMARY');
console.log('═'.repeat(100));
console.log(`Total header pollution rows removed: ${totalHeaderRowsRemoved}`);
console.log(`Sheets cleaned: ${dailySheets.length}`);
console.log('\n✅ Header pollution cleanup complete!');
console.log('   Backup saved: ' + path.basename(backupPath));
console.log('\n🔄 Next step: Re-run phase2-validation.js to verify data quality');
console.log('═'.repeat(100) + '\n');
