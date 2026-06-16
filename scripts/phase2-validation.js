const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function validateGTPLData() {
  console.log('═'.repeat(100));
  console.log('PHASE 2 VALIDATION - BEFORE ANY DATABASE WRITES');
  console.log('═'.repeat(100));

  const workbookPath = path.join(__dirname, '../data', 'GTPL Cab Sheet June 26  (3).xlsx');
  const wb = XLSX.readFile(workbookPath);
  const applyMode = process.argv.includes('--apply');

  console.log('\n' + '═'.repeat(100));
  console.log('STARTUP CHECKS');
  console.log('═'.repeat(100));
  console.log(`APPLY MODE = ${applyMode ? 'TRUE' : 'FALSE'}`);
  if (applyMode) {
    console.log('⚠️  WARNING: APPLY MODE ENABLED - This will write to database');
  } else {
    console.log('✅ DRY-RUN MODE - No database writes will occur');
  }

  // ==========================================
  // TASK 1: VERIFY EMPLOYEE DUPLICATION
  // ==========================================
  console.log('\n' + '═'.repeat(100));
  console.log('TASK 1: EMPLOYEE DUPLICATION VERIFICATION (16-6-26 SHEET)');
  console.log('═'.repeat(100));

  const targetEmployees = ['AKANSHA KHODE', 'PRABHAT PRIYDARSHI', 'PULIPATI KRISHNA'];
  const ws_16 = wb.Sheets['16-6-26'];
  const data_16 = XLSX.utils.sheet_to_json(ws_16, { defval: '' });

  for (const empName of targetEmployees) {
    const rows = data_16.filter(row => {
      const name = (row['Name'] || '').toString().trim().toUpperCase();
      return name === empName.toUpperCase();
    });

    console.log(`\n${empName}:`);
    console.log(`  Total occurrences: ${rows.length}`);

    if (rows.length > 0) {
      console.log('  Details:');
      rows.forEach((row, idx) => {
        console.log(`    Occurrence ${idx + 1}:`);
        console.log(`      Route No: ${row['Rout No'] || 'N/A'}`);
        console.log(`      Shift Time: ${row['Shift Time'] || 'N/A'}`);
        console.log(`      Pickup Time: ${row['Pickup Time'] || 'N/A'}`);
        console.log(`      Status: ${row['Status'] || 'N/A'}`);
        console.log(`      Email: ${row['E mail ID'] || 'N/A'}`);
      });

      if (rows.length === 2) {
        const route1 = rows[0]['Rout No'];
        const route2 = rows[1]['Rout No'];
        const time1 = rows[0]['Shift Time'];
        const time2 = rows[1]['Shift Time'];

        if (route1 === route2 && time1 === time2) {
          console.log(`  ✅ Assessment: LEGITIMATE DUPLICATION - Same route/shift (pickup+drop)"`);
        } else if (route1 !== route2 || time1 !== time2) {
          console.log(`  ⚠️  Assessment: LIKELY LEGITIMATE - Different routes/times`);
        }
      }
    }
  }

  // ==========================================
  // TASK 2: HEADER POLLUTION FIX
  // ==========================================
  console.log('\n' + '═'.repeat(100));
  console.log('TASK 2: HEADER POLLUTION DETECTION & FILTERING');
  console.log('═'.repeat(100));

  const dailySheets = wb.SheetNames.filter(name => /^\d{1,2}-\d{1,2}-\d{2}$/.test(name.trim()));
  const headerPollutionReport = {};

  for (const sheetName of dailySheets) {
    const ws = wb.Sheets[sheetName];
    const sheetData = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let totalRows = sheetData.length;
    let headerRows = 0;
    const rowsToFilter = [];

    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const name = (row['Name'] || '').toString().trim();
      const empId = (row['Emp ID'] || '').toString().trim();
      const email = (row['E mail ID'] || '').toString().trim();

      // Detect header pollution
      if (name === 'Name' || empId === 'Emp ID' || email === 'E mail ID') {
        headerRows++;
        rowsToFilter.push(i);
      }
    }

    const cleanRows = totalRows - headerRows;
    headerPollutionReport[sheetName] = {
      totalRows,
      headerRows,
      cleanRows,
      headerPercentage: ((headerRows / totalRows) * 100).toFixed(1)
    };

    console.log(`\n${sheetName}:`);
    console.log(`  Total rows: ${totalRows}`);
    console.log(`  Header pollution rows: ${headerRows} (${((headerRows / totalRows) * 100).toFixed(1)}%)`);
    console.log(`  Clean rows after filtering: ${cleanRows}`);
  }

  // ==========================================
  // TASK 3: VEHICLE VALIDATION
  // ==========================================
  console.log('\n' + '═'.repeat(100));
  console.log('TASK 3: VEHICLE-DRIVER MAPPING & VALIDATION');
  console.log('═'.repeat(100));

  const routesSheetName = 'Routes and Driver details ';
  const ws_routes = wb.Sheets[routesSheetName];
  const routes_data = XLSX.utils.sheet_to_json(ws_routes, { defval: '' });

  function isVehicleNumber(str) {
    if (!str) return false;
    const normalized = str.trim().toUpperCase();
    return /^[A-Z]{2}\d{1,2}[A-Z]{2}\d{4}$/.test(normalized);
  }

  function extractDriverName(driverDetails) {
    if (!driverDetails) return null;
    const str = String(driverDetails).trim();
    if (str.includes('DRIVER-')) {
      return str.split('DRIVER-')[1]?.trim() || null;
    }
    if (str.includes('DRIVER=')) {
      return str.split('DRIVER=')[1]?.trim() || null;
    }
    if (!isVehicleNumber(str) && !/^MOB-/.test(str) && !/^MOB=/.test(str) && !/^\d+$/.test(str)) {
      return str;
    }
    return null;
  }

  function extractPhone(driverDetails, contactNo) {
    if (!driverDetails && !contactNo) return null;
    const str = String(driverDetails).trim();
    if (str.includes('MOB-')) {
      return str.split('MOB-')[1]?.trim() || null;
    }
    if (str.includes('MOB=')) {
      return str.split('MOB=')[1]?.trim() || null;
    }
    if (/^9\d{9}$/.test(str)) {
      return str;
    }
    return contactNo || null;
  }

  const vehicleMapping = [];
  let vehicleCount = 0;

  for (let i = 0; i < routes_data.length; i++) {
    const row = routes_data[i];
    const routeNo = (row['Rout No'] || '').toString().trim();
    const driverDetails = (row['Driver Details'] || '').toString().trim();
    const contactNo = (row['Contact No'] || '').toString().trim();

    // Skip ESCORT rows and header rows
    if (!routeNo || routeNo === 'Escort' || routeNo === 'Rout No') continue;

    if (isVehicleNumber(driverDetails)) {
      const vehicleNum = driverDetails.toUpperCase();
      vehicleCount++;
      vehicleMapping.push({
        routeNo,
        vehicle: vehicleNum,
        driver: 'N/A',
        phone: contactNo || 'N/A'
      });
    } else {
      const driverName = extractDriverName(driverDetails);
      const driverPhone = extractPhone(driverDetails, contactNo);

      if (driverName && !/^MOB/.test(driverName) && driverName !== 'Driver Details') {
        vehicleMapping.push({
          routeNo,
          vehicle: 'N/A',
          driver: driverName,
          phone: driverPhone || 'N/A'
        });
      }
    }
  }

  console.log(`\nVehicles Extracted: ${vehicleCount}`);
  console.log('Vehicle-Driver Mapping Table:\n');
  console.log('Route | Vehicle      | Driver           | Phone');
  console.log('-'.repeat(60));

  const uniqueVehicles = new Set();
  for (const mapping of vehicleMapping) {
    if (mapping.vehicle !== 'N/A') {
      uniqueVehicles.add(mapping.vehicle);
      console.log(
        `${mapping.routeNo.padEnd(5)} | ${mapping.vehicle.padEnd(12)} | ${'N/A'.padEnd(16)} | ${mapping.phone}`
      );
    }
  }

  // Show drivers
  for (const mapping of vehicleMapping) {
    if (mapping.driver !== 'N/A') {
      console.log(
        `${mapping.routeNo.padEnd(5)} | ${'N/A'.padEnd(12)} | ${mapping.driver.padEnd(16)} | ${mapping.phone}`
      );
    }
  }

  console.log(`\nTotal vehicles extracted: ${uniqueVehicles.size}`);
  console.log(`Total route-vehicle mappings: ${vehicleMapping.filter(m => m.vehicle !== 'N/A').length}`);

  // ==========================================
  // TASK 4: DATABASE COMPARISON
  // ==========================================
  console.log('\n' + '═'.repeat(100));
  console.log('TASK 4: DATABASE COMPARISON');
  console.log('═'.repeat(100));

  try {
    const dbCabs = await prisma.cab.findMany({
      select: { vehicleNumber: true }
    });

    const dbDrivers = await prisma.driver.findMany({
      select: { name: true, phone: true }
    });

    // Vehicle comparison
    console.log('\nVehicle Comparison:');
    const dbCabNumbers = new Set(dbCabs.map(c => c.vehicleNumber));
    const workbookVehicles = uniqueVehicles;

    const vehicleMatched = Array.from(workbookVehicles).filter(v => dbCabNumbers.has(v));
    const vehicleMissing = Array.from(workbookVehicles).filter(v => !dbCabNumbers.has(v));
    const vehicleExtra = Array.from(dbCabNumbers).filter(v => !workbookVehicles.has(v));

    console.log(`  Workbook vehicles: ${workbookVehicles.size}`);
    console.log(`  Database cabs: ${dbCabNumbers.size}`);
    console.log(`  Matched: ${vehicleMatched.length}`);
    console.log(`  Missing (in workbook, not in DB): ${vehicleMissing.length}`);
    console.log(`  Extra (in DB, not in workbook): ${vehicleExtra.length}`);

    if (vehicleMissing.length > 0) {
      console.log(`  Missing vehicles: ${vehicleMissing.slice(0, 5).join(', ')}${vehicleMissing.length > 5 ? '...' : ''}`);
    }

    // Driver comparison
    console.log('\nDriver Comparison:');
    const dbDriverNames = new Set(dbDrivers.map(d => d.name.trim().toUpperCase()));
    const workbookDriverNames = new Set(
      vehicleMapping
        .filter(m => m.driver !== 'N/A')
        .map(m => m.driver.toUpperCase())
    );

    const driverMatched = Array.from(workbookDriverNames).filter(d => dbDriverNames.has(d));
    const driverMissing = Array.from(workbookDriverNames).filter(d => !dbDriverNames.has(d));
    const driverExtra = Array.from(dbDriverNames).filter(d => !workbookDriverNames.has(d));

    console.log(`  Workbook drivers: ${workbookDriverNames.size}`);
    console.log(`  Database drivers: ${dbDriverNames.size}`);
    console.log(`  Matched: ${driverMatched.length}`);
    console.log(`  Missing (in workbook, not in DB): ${driverMissing.length}`);
    console.log(`  Extra (in DB, not in workbook): ${driverExtra.length}`);

    if (driverMissing.length > 0) {
      console.log(`  Missing drivers: ${Array.from(driverMissing).slice(0, 5).join(', ')}${driverMissing.length > 5 ? '...' : ''}`);
    }
  } catch (err) {
    console.log(`Error comparing with database: ${err.message}`);
  }

  // ==========================================
  // TASK 5: APPLY SAFETY CHECKS
  // ==========================================
  console.log('\n' + '═'.repeat(100));
  console.log('TASK 5: APPLY SAFETY VALIDATION');
  console.log('═'.repeat(100));

  const employeeCount = data_16.filter(row => {
    const name = (row['Name'] || '').toString().trim();
    return name && name !== 'Name';
  }).length;

  const headerPollutionDetected = Object.values(headerPollutionReport).some(report => report.headerRows > 0);

  console.log(`\nSafety Checks:`);
  console.log(`  APPLY MODE enabled: ${applyMode ? '✅ YES' : '❌ NO'}`);
  console.log(`  Vehicle count >= 1: ${vehicleCount > 0 ? '✅ YES (' + vehicleCount + ')' : '❌ NO'}`);
  console.log(`  Employee count >= 50: ${employeeCount >= 50 ? '✅ YES (' + employeeCount + ')' : '❌ NO'}`);
  console.log(`  Header pollution detected: ${headerPollutionDetected ? '⚠️  YES - Must fix' : '✅ NO'}`);

  console.log(`\nAbort Conditions:`);
  const shouldAbort = vehicleCount === 0 || employeeCount < 50 || headerPollutionDetected;

  if (vehicleCount === 0) {
    console.log(`  ❌ ABORT: Vehicle count is 0`);
  } else {
    console.log(`  ✅ Vehicle count check passed (${vehicleCount} vehicles)`);
  }

  if (employeeCount < 50) {
    console.log(`  ❌ ABORT: Employee count is ${employeeCount} (< 50)`);
  } else {
    console.log(`  ✅ Employee count check passed (${employeeCount} employees)`);
  }

  if (headerPollutionDetected) {
    console.log(`  ❌ ABORT: Header pollution still detected`);
  } else {
    console.log(`  ✅ Header pollution check passed`);
  }

  // ==========================================
  // FINAL ASSESSMENT
  // ==========================================
  console.log('\n' + '═'.repeat(100));
  console.log('VALIDATION SUMMARY');
  console.log('═'.repeat(100));

  if (shouldAbort) {
    console.log('\n🛑 VALIDATION FAILED - DO NOT ENABLE APPLY MODE');
    console.log('Issues to fix before proceeding:');
    if (vehicleCount === 0) console.log('  1. Vehicle extraction failed (0 vehicles found)');
    if (employeeCount < 50) console.log(`  2. Insufficient employees (${employeeCount}, need 50+)`);
    if (headerPollutionDetected) console.log('  3. Header pollution still present in daily sheets');
  } else {
    console.log('\n✅ VALIDATION PASSED');
    if (applyMode) {
      console.log('⚠️  APPLY MODE IS ENABLED - Database writes will occur on next sync');
    } else {
      console.log('Ready to enable APPLY MODE for database synchronization');
    }
  }

  console.log('\n' + '═'.repeat(100));

  // Save validation report
  const report = {
    timestamp: new Date().toISOString(),
    applyMode,
    task1_employeeDuplication: targetEmployees,
    task2_headerPollution: headerPollutionReport,
    task3_vehicleMapping: {
      totalVehicles: vehicleCount,
      totalMappings: vehicleMapping.length,
      sampleMappings: vehicleMapping.slice(0, 10)
    },
    task5_safetyChecks: {
      applyModeEnabled: applyMode,
      vehicleCountValid: vehicleCount > 0,
      employeeCountValid: employeeCount >= 50,
      headerPollutionPresent: headerPollutionDetected,
      shouldAbort,
      vehicleCount,
      employeeCount
    }
  };

  fs.writeFileSync(
    path.join(__dirname, '../data/outputs/gtpl-phase2-validation-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\nValidation report saved: data/outputs/gtpl-phase2-validation-report.json\n');

  await prisma.$disconnect();

  if (shouldAbort) {
    process.exit(1);
  }
}

validateGTPLData().catch(err => {
  console.error('Validation error:', err.message);
  process.exit(1);
});
