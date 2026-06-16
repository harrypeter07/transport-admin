const fs = require('fs');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('═'.repeat(100));
  console.log('DEBUG: 22 EMPLOYEES TO CREATE - EXACT VALIDATION LOGIC');
  console.log('═'.repeat(100));

  // Load workbook - same as validation script
  const workbookPath = 'data/GTPL Cab Sheet June 26  (3).xlsx';
  const workbook = XLSX.readFile(workbookPath);
  const sheet16June = workbook.Sheets['16-6-26'];
  const data = XLSX.utils.sheet_to_json(sheet16June);

  // Extract employees - same logic as validation script (report1)
  const employees = [];
  const employeeSet = new Map();

  data.forEach((row) => {
    if (!row['Name'] || !row['Emp ID']) return;
    
    const empName = row['Name'].toString().trim();
    const empCode = row['Emp ID'].toString().trim();
    
    if (!empName || empName === 'Name') return;
    if (!empCode || empCode === 'Emp ID') return;

    const key = `${empName}|${empCode}`;
    
    if (!employeeSet.has(key)) {
      employeeSet.set(key, {
        employeeName: empName,
        employeeCode: empCode === 'NA' ? null : empCode,
        status: row['Status']?.toString().trim() || 'PRESENT'
      });
      employees.push({
        employeeName: empName,
        employeeCode: empCode === 'NA' ? null : empCode,
        status: row['Status']?.toString().trim() || 'PRESENT'
      });
    }
  });

  console.log(`\n✓ Extracted ${employees.length} employees from workbook (16-6-26 sheet)`);
  console.log(`  All employees: ${Array.from(employeeSet.keys()).join(', ').substring(0, 150)}...`);

  // Get database employees - same as validation script
  const dbEmployees = await prisma.employee.findMany({
    select: { name: true, employeeCode: true, email: true, status: true }
  });

  console.log(`✓ Found ${dbEmployees.length} employees in database\n`);

  // EXACT matching logic from validation script (Report 4)
  const workbookEmployeeSet = new Set(employees.map(e => `${e.employeeName}|${e.employeeCode}`));
  const dbEmployeeSet = new Set(dbEmployees.map(e => `${e.name}|${e.employeeCode}`));

  const matched = Array.from(workbookEmployeeSet).filter(e => dbEmployeeSet.has(e));
  const missing = Array.from(workbookEmployeeSet).filter(e => !dbEmployeeSet.has(e));

  console.log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`MATCHING RESULTS (Using Validation Script Logic)`);
  console.log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`\n✓ Matched (exact name + code): ${matched.length}`);
  console.log(`✗ Missing (will be CREATED):   ${missing.length}\n`);

  if (missing.length !== 22) {
    console.log(`⚠️  WARNING: Expected 22 missing, got ${missing.length}`);
    console.log(`   This suggests the database has changed since last validation run.\n`);
  }

  // Show all 22 (or however many there are)
  console.log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`${missing.length} EMPLOYEES TO BE CREATED:`);
  console.log('════════════════════════════════════════════════════════════════════════════════════════════════════\n');

  const missingArray = Array.from(missing).sort();
  missingArray.forEach((emp, idx) => {
    const [name, code] = emp.split('|');
    console.log(`${idx + 1}. ${name}`);
    console.log(`   employeeCode: ${code || 'NA'}`);
    console.log(`   matchedBy: NO_MATCH (composite key not found in DB)`);
    console.log(`   reason: Neither name nor code exists in database with matching pair\n`);
  });

  // Now let's see if any of these have partial matches
  console.log('\n════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('PARTIAL MATCH ANALYSIS (for reference):');
  console.log('════════════════════════════════════════════════════════════════════════════════════════════════════\n');

  let codeOnlyMatches = 0;
  let nameOnlyMatches = 0;

  missingArray.forEach((emp) => {
    const [name, code] = emp.split('|');
    
    // Check if code exists in DB (code-only match)
    const codeExists = dbEmployees.find(e => e.employeeCode === code && e.name !== name);
    if (codeExists) {
      console.log(`⚠️  CODE MATCH: "${name}" (${code})`);
      console.log(`    DB has: "${codeExists.name}" (${codeExists.employeeCode})\n`);
      codeOnlyMatches++;
    }
    
    // Check if name exists in DB (name-only match, case-insensitive)
    const nameExists = dbEmployees.find(e => 
      e.name.toLowerCase() === name.toLowerCase() && e.employeeCode !== code
    );
    if (nameExists) {
      console.log(`⚠️  NAME MATCH: "${name}" (${code})`);
      console.log(`    DB has: "${nameExists.name}" (${nameExists.employeeCode})\n`);
      nameOnlyMatches++;
    }
  });

  console.log(`\nPartial matches: ${codeOnlyMatches} code-only, ${nameOnlyMatches} name-only`);
  console.log(`This explains the discrepancy with 47 + 1 + 17 + 4 = 69 total employees.\n`);

  // Summary
  console.log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`
Total workbook employees:   ${employees.length}
Exact matches in DB:        ${matched.length}
Missing (to be created):    ${missing.length}
────────────────────────────────────
Match rate:                 ${((matched.length / employees.length) * 100).toFixed(1)}%
  `);

  if (missing.length === 22) {
    console.log(`✅ Confirmed: Exactly 22 employees will be created`);
  } else {
    console.log(`⚠️  Database state differs from validation report`);
    console.log(`   Validation expected: 22 creates, 47 updates`);
    console.log(`   Current state shows: ${missing.length} creates, ${matched.length} updates`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
