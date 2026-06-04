/**
 * One-time script: parse Roster.xlsx → data/excel_routes.json
 * Run: NODE_PATH=./node_modules node scripts/parse-excel-routes.js
 *
 * What it does:
 * - Reads the first non-empty sheet of Roster.xlsx
 * - Groups rows by "Rout No" (P* = pickup, D* = drop)
 * - Matches each employee by email → DB coordinates
 * - Calculates Haversine distance/duration per route
 * - Writes output to data/excel_routes.json (no DB writes)
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const AVG_SPEED_KM_MIN = 0.5; // 30 km/h
const CIRCUITY = 1.3;

const DEPOT = { x: 79.0526, y: 21.0625 }; // MIHAN, Nagpur

const SHIFT_MAP = {
  5:    { id: 'shift-0500', name: '05:00 Shift', startTime: '05:00', endTime: '05:00' },
  8:    { id: 'shift-0800', name: '08:00 Shift', startTime: '08:00', endTime: '08:00' },
  10:   { id: 'shift-1000', name: '10:00 Shift', startTime: '10:00', endTime: '10:00' },
  11:   { id: 'shift-1100', name: '11:00 Shift', startTime: '11:00', endTime: '11:00' },
  11.5: { id: 'shift-1130', name: '11:30 Shift', startTime: '11:30', endTime: '11:30' },
};

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.y - a.y) * Math.PI) / 180;
  const dLon = ((b.x - a.x) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.y * Math.PI) / 180) *
      Math.cos((b.y * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * CIRCUITY;
}

function excelTimeToHours(serial) {
  if (!serial || isNaN(serial)) return null;
  const hours = serial * 24;
  // Round to nearest 0.5
  return Math.round(hours * 2) / 2;
}

function getShift(serial) {
  const h = excelTimeToHours(serial);
  if (h === null) return SHIFT_MAP[5];
  return SHIFT_MAP[h] || SHIFT_MAP[5];
}

function extractDriverDetails(rows) {
  let vehicleNumber = 'UNKNOWN';
  let driverName = 'Unknown';
  let driverPhone = 'N/A';

  for (const row of rows) {
    const d = row[12] ? String(row[12]).trim() : '';
    if (!d) continue;

    if (/^MH/i.test(d)) {
      vehicleNumber = d;
    } else if (/^(MOB|mob|Mob)-?/.test(d)) {
      driverPhone = d.replace(/^(MOB|mob|Mob)-?/, '');
    } else if (/^(DRIVER|Driver|driver)[- =]/i.test(d)) {
      driverName = d;
    } else if (/^\d{10}$/.test(d.replace(/[- ]/g, ''))) {
      driverPhone = d.replace(/[- ]/g, '');
    }
  }

  return { vehicleNumber, driverName, driverPhone };
}

// Nagpur metro bounding box — skip employees geocoded outside this area
const NAGPUR_BOUNDS = { minX: 78.6, maxX: 79.4, minY: 20.6, maxY: 21.5 };
function inNagpur(x, y) {
  return x >= NAGPUR_BOUNDS.minX && x <= NAGPUR_BOUNDS.maxX &&
         y >= NAGPUR_BOUNDS.minY && y <= NAGPUR_BOUNDS.maxY;
}

function cleanEmail(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase();
}

async function main() {
  console.log('Loading employees from DB...');
  const dbEmployees = await prisma.employee.findMany();
  const byEmail = new Map(dbEmployees.map(e => [e.email.toLowerCase(), e]));
  const byName = new Map(dbEmployees.map(e => [e.name.toLowerCase(), e]));
  console.log(`Loaded ${dbEmployees.length} employees.`);

  const filePath = path.join(__dirname, '..', 'Roster.xlsx');
  const workbook = XLSX.readFile(filePath);
  console.log('Sheets:', workbook.SheetNames);

  // Use first non-empty sheet
  let raw = [];
  let usedSheet = null;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const hasData = rows.some(r => r && r[0] && r[0] !== 'Rout No');
    if (hasData) {
      raw = rows;
      usedSheet = name;
      break;
    }
  }
  console.log(`Using sheet: ${usedSheet} (${raw.length} rows)`);

  // Group rows by Route No
  const groups = new Map();
  for (const row of raw) {
    if (!row || !row[0] || row[0] === 'Rout No') continue;
    const routeNo = String(row[0]).trim();
    if (!groups.has(routeNo)) groups.set(routeNo, []);
    groups.get(routeNo).push(row);
  }

  console.log(`Found ${groups.size} route groups: ${[...groups.keys()].sort().join(', ')}`);

  const routes = [];
  let routeIndex = 0;
  let unmatchedCount = 0;

  for (const [routeNo, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const isPickup = routeNo.startsWith('P');
    const { vehicleNumber, driverName, driverPhone } = extractDriverDetails(rows);

    // Get shift from the first non-Escort row with a shift value
    const shiftRow = rows.find(r => r[8] && String(r[4]).toLowerCase() !== 'escort');
    const shift = getShift(shiftRow ? shiftRow[8] : null);

    // Filter to active, real passengers (not Escort, Status=YES or empty)
    const passengerRows = rows.filter(r => {
      const name = r[4] ? String(r[4]).trim().toLowerCase() : '';
      const status = r[11] ? String(r[11]).trim().toUpperCase() : '';
      if (name === 'escort') return false;
      if (status === 'NO SHOW') return false;
      return true;
    });

    // Sort by pickup time (col 10) ascending
    passengerRows.sort((a, b) => {
      const ta = typeof a[10] === 'number' ? a[10] : 0;
      const tb = typeof b[10] === 'number' ? b[10] : 0;
      return ta - tb;
    });

    const stops = [];
    let cumDist = 0;
    let cumDur = 0;
    let prevPt = DEPOT;

    for (const pRow of passengerRows) {
      const email = cleanEmail(pRow[6]);
      const name = pRow[4] ? String(pRow[4]).trim() : '';
      const gender = pRow[13] === 'F' ? 'FEMALE' : 'MALE';

      // Match to DB employee
      let emp = null;
      if (email && email !== 'na') {
        emp = byEmail.get(email) || null;
      }
      if (!emp && name) {
        emp = byName.get(name.toLowerCase()) || null;
      }

      if (!emp) {
        unmatchedCount++;
        console.warn(`  [UNMATCHED] Route ${routeNo}: "${name}" <${email}> — no DB record, skipping`);
        continue;
      }

      // Skip employees with bad geocoordinates (outside Nagpur area)
      if (!inNagpur(emp.x, emp.y)) {
        unmatchedCount++;
        console.warn(`  [BAD COORDS] Route ${routeNo}: "${emp.name}" (${emp.x}, ${emp.y}) is outside Nagpur — skipping`);
        continue;
      }

      const pt = { x: emp.x, y: emp.y };
      const legDist = haversineKm(prevPt, pt);
      cumDist += legDist;
      cumDur += legDist / AVG_SPEED_KM_MIN;
      prevPt = pt;

      const stopId = `excel-stop-${routeNo}-${stops.length}`;
      const routeId = `excel-route-${routeNo}`;

      stops.push({
        id: stopId,
        routeId,
        employeeId: emp.id,
        employee: {
          id: emp.id,
          name: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
          phone: emp.phone,
          email: emp.email,
          department: emp.department,
          employeeCode: emp.employeeCode,
          shiftId: emp.shiftId || '',
          status: emp.status,
        },
        stopOrder: stops.length + 1,
        etaMinutes: Math.round(cumDur),
        status: 'PENDING',
      });
    }

    if (stops.length === 0) {
      console.log(`  Skipping ${routeNo} — no matched passengers.`);
      continue;
    }

    // Last stop → Depot leg
    const lastPt = { x: stops[stops.length - 1].employee.x, y: stops[stops.length - 1].employee.y };
    const depotLeg = haversineKm(lastPt, DEPOT);
    cumDist += depotLeg;
    cumDur += depotLeg / AVG_SPEED_KM_MIN;

    const hasEscort = rows.some(r => String(r[4]).trim().toLowerCase() === 'escort');
    const routeId = `excel-route-${routeNo}`;

    routes.push({
      id: routeId,
      cabId: `excel-cab-${routeNo}`,
      cab: {
        id: `excel-cab-${routeNo}`,
        vehicleNumber,
        capacity: 6,
        vendor: 'FT',
        status: 'ACTIVE',
        driverName,
        driverPhone,
        licenseNumber: '',
        driverAddress: '',
      },
      date: '2026-06-01', // baseline date
      shiftId: shift.id,
      shift,
      isPickup,
      totalDistance: Math.round(cumDist * 10) / 10,
      totalDuration: Math.round(cumDur),
      status: 'PENDING',
      optimizationScore: 0,
      stops,
      violations: [],
      hasEscort,
      tripSequence: 1,
      routeNumber: routeIndex + 1,
    });

    console.log(`  ${routeNo} (${isPickup ? 'Pickup' : 'Drop'}): ${stops.length} stops, ${Math.round(cumDist * 10) / 10} km, ${Math.round(cumDur)} min, vehicle=${vehicleNumber}`);
    routeIndex++;
  }

  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'excel_routes.json');
  fs.writeFileSync(outFile, JSON.stringify(routes, null, 2), 'utf-8');

  console.log(`\n✅ Done! ${routes.length} routes written to data/excel_routes.json`);
  console.log(`⚠️  ${unmatchedCount} passenger rows could not be matched to a DB employee.`);
}

main()
  .catch(err => { console.error('Error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
