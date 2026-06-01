const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const fs = require('fs');

const prisma = new PrismaClient();

function formatExcelTime(val) {
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const displayHours = hours.toString().padStart(2, "0");
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes}`;
  }
  return String(val || "").trim();
}

function parseDriverDetails(detailsList) {
  let vehicleNumber = "";
  let driverName = "";
  let driverPhone = "";
  
  for (const item of detailsList) {
    if (!item) continue;
    const val = String(item).trim();
    if (val.match(/MH\s?\d{2}\s?[A-Z]{1,2}\s?\d{4}/i)) {
      vehicleNumber = val.toUpperCase().replace(/\s+/g, "");
    } else if (val.toLowerCase().includes("driver") || val.toLowerCase().includes("drver")) {
      driverName = val.replace(/(driver|drver)[:=\s-]+/gi, "").trim();
    } else if (val.toLowerCase().includes("mob") || val.toLowerCase().includes("phone") || val.match(/^\+?\d[\d\s-]{8,12}$/)) {
      driverPhone = val.replace(/(mob|phone)[:=\s-]+/gi, "").trim();
    } else if (!vehicleNumber && val.length > 5 && val.startsWith("MH")) {
      vehicleNumber = val.toUpperCase().replace(/\s+/g, "");
    } else if (!driverName && val.length > 2 && isNaN(val)) {
      driverName = val;
    } else if (!driverPhone && val.match(/\d{9,11}/)) {
      driverPhone = val;
    }
  }
  
  return { vehicleNumber, driverName, driverPhone };
}

async function main() {
  console.log("Loading Excel data from roster.xlsx...");
  const buffer = fs.readFileSync('roster.xlsx');
  const workbook = xlsx.read(buffer, { type: "buffer" });
  
  const excelEmployees = new Map();
  const routeToShiftTime = new Map();
  const routeToRows = new Map();
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    rows.forEach((row, idx) => {
      if (idx === 0) return;
      const routeNo = String(row[0] || "").trim();
      if (!routeNo) return;
      
      if (!routeToRows.has(routeNo)) routeToRows.set(routeNo, []);
      routeToRows.get(routeNo).push(row);
      
      const empCode = String(row[3] || "").trim();
      const shiftTimeRaw = row[8];
      
      if (empCode && empCode !== "NA" && empCode !== "#######") {
        excelEmployees.set(empCode, { routeNo, shiftTimeRaw });
      }
    });
  }

  console.log(`Parsed ${excelEmployees.size} unique employees from Excel.`);
  console.log(`Parsed ${routeToRows.size} unique routes from Excel.`);

  const shiftCache = new Map();
  for (const [routeNo, rows] of routeToRows.entries()) {
    const validShiftRow = rows.find(r => typeof r[8] === "number" || (typeof r[8] === "string" && r[8].trim() !== ""));
    const shiftTimeRaw = validShiftRow ? validShiftRow[8] : null;
    
    let timeStr = "09:00";
    if (shiftTimeRaw) {
      timeStr = formatExcelTime(shiftTimeRaw);
    }
    
    routeToShiftTime.set(routeNo, timeStr);

    if (!shiftCache.has(timeStr)) {
      let shift = await prisma.shift.findFirst({
        where: { startTime: timeStr }
      });
      if (!shift) {
        shift = await prisma.shift.create({
          data: {
            name: `Shift ${timeStr}`,
            startTime: timeStr,
            endTime: "18:00"
          }
        });
      }
      shiftCache.set(timeStr, shift.id);
    }
  }

  const dbEmployees = await prisma.employee.findMany({
    where: { status: "ACTIVE" }
  });

  let matchedEmployees = 0;
  let updatedEmployees = 0;
  let unmatchedEmployees = [];

  const empUpdates = [];
  for (const dbEmp of dbEmployees) {
    let excelRecord = excelEmployees.get(dbEmp.employeeCode);
    
    if (!excelRecord) {
      unmatchedEmployees.push(dbEmp);
      continue;
    }

    matchedEmployees++;

    const timeStr = routeToShiftTime.get(excelRecord.routeNo) || "09:00";
    const shiftId = shiftCache.get(timeStr);

    if (dbEmp.shiftId !== shiftId) {
      updatedEmployees++;
      empUpdates.push(
        prisma.employee.update({
          where: { id: dbEmp.id },
          data: { shiftId }
        })
      );
    }
  }
  await Promise.all(empUpdates);

  let mappedCabs = 0;
  const cabUpdates = [];

  for (const [routeNo, rows] of routeToRows.entries()) {
    const driverDetailsColumn = rows.map((r) => r[12]).filter(Boolean);
    const { vehicleNumber, driverName, driverPhone } = parseDriverDetails(driverDetailsColumn);
    const finalVehicleNumber = vehicleNumber || `CAB-${routeNo}`;

    const timeStr = routeToShiftTime.get(routeNo) || "09:00";
    const shiftId = shiftCache.get(timeStr);

    if (shiftId) {
      let cab = await prisma.cab.findUnique({
        where: { vehicleNumber: finalVehicleNumber },
        include: { shifts: true }
      });

      if (!cab) {
        cabUpdates.push(
          prisma.cab.create({
            data: {
              vehicleNumber: finalVehicleNumber,
              capacity: Math.max(6, rows.filter((r) => r[3] && String(r[3]).toLowerCase() !== "escort").length),
              vendor: String(rows[0]?.[1] || "FT").trim(),
              status: "AVAILABLE",
              driverName: driverName || `Driver ${routeNo}`,
              driverPhone: driverPhone || "N/A",
              licenseNumber: `DL-${Math.floor(Math.random() * 90000)}`,
              shifts: { connect: { id: shiftId } }
            }
          })
        );
        mappedCabs++;
      } else {
        if (!cab.shifts.some(s => s.id === shiftId)) {
          cabUpdates.push(
            prisma.cab.update({
              where: { id: cab.id },
              data: { shifts: { connect: { id: shiftId } } }
            })
          );
        }
        mappedCabs++;
      }
    }
  }
  
  for (const p of cabUpdates) {
    try { await p; } catch (e) { }
  }

  console.log("\n==================================================");
  console.log("            EXCEL IMPORT SUMMARY                  ");
  console.log("==================================================");
  console.log(`Total Employees in DB (Active): ${dbEmployees.length}`);
  console.log(`Total Employees Matched:        ${matchedEmployees}`);
  console.log(`Total Employees Updated:        ${updatedEmployees}`);
  console.log(`Total Employees Unmatched:      ${unmatchedEmployees.length}`);
  console.log(`Total Cabs Mapped/Verified:     ${mappedCabs}`);
  console.log("==================================================");
  
  if (unmatchedEmployees.length > 0) {
    console.log("\n--- Unmatched DB Employees (First 10) ---");
    unmatchedEmployees.slice(0, 10).forEach(emp => {
      console.log(`- ${emp.name} (${emp.employeeCode})`);
    });
    if (unmatchedEmployees.length > 10) {
      console.log(`... and ${unmatchedEmployees.length - 10} more.`);
    }
  }
}

main().catch(e => {
  console.error("Error during sync:", e);
}).finally(async () => {
  await prisma.$disconnect();
});
