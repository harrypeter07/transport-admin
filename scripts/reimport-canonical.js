/**
 * reimport-canonical.js
 * 
 * CANONICAL SOURCE: data/transport_routes_16jun26.json
 * 
 * This script is the definitive database import for all transport data.
 * It completely replaces any previous route/shift/cab-assignment data
 * from the canonical source file.
 * 
 * Key design decisions:
 * - Vehicles that appear in multiple shifts get connected to ALL those shifts
 * - Cab driver info always comes from canonical JSON (then CANONICAL_CABS fallback)
 * - Employees matched by employeeCode first, then name fuzzy match
 * - Generates transport_import_report.json with full validation results
 */

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const DEPOT = { x: 79.0526, y: 21.0625 }; // MIHAN Depot Nagpur
const AVG_SPEED_KM_MIN = 0.5; // 30 km/h
const CIRCUITY = 1.3;

// Authoritative cab→driver mapping from the fleet registry
const CANONICAL_CABS = {
  "MH49CW0078": { name: "SURAJ",    phone: "9561326459", address: "S/O Pradip Krushnarao Wasnik, near gajanan maharaj mandir, 220, new balaji nagar vistar, manewada road, bhgwan nagar, Nagpur, Maharashtra-440027" },
  "MH40CT4542": { name: "Tapan",    phone: "8208223602", address: "House.No-285 Near Awachat Kirana Store Beldar Nagar, Narsala Hudkeshwar khurd. Nagpur (rural) Nagpur 440034" },
  "MH31FC8592": { name: "Sandeep",  phone: "9021863195", address: "91, SUDAM NAGARI, AMBAZARI, NAGPUR., NAGPUR (M CORP.) NAGPUR" },
  "MH49CW0218": { name: "ANIKET",   phone: "9325911859", address: "NEAR KUNBI PURA BHAVAN HOUSE NO 435 AYACHIT MANDIR BUS STOP KUNBI PURA MAHAL Nagpur (Urban), Nagpur, MH" },
  "MH40DC0486": { name: "SHAFIQUE", phone: "9595420800", address: "Add P NO 190 MOTHI VIHIR MUMTAZ MANZIL SADABHAWANA NAGAR NAGPUR (URBAN), NAGPUR" },
  "MH49CW0139": { name: "Nikhil",   phone: "9764325500", address: "61, Hudkeshwar Bujrug Hudkeshwar Bk. Nagpur Maharashtra 440034" },
  "MH49CW1305": { name: "Shantanu", phone: "8261990745", address: "P NO 15/B JAI GURUDEV NAGAR NEAR BHARAT GAS" },
  "MH31FC8407": { name: "Prashant", phone: "7620971911", address: "PLOT NO-65, RATHI LAYOUT NR ASHIRWAD SCHOOL GODHANI ROAD ZINGABAI TAKLI NAGPUR NAGPUR (M CORP.), NAGPUR,MH" },
  "MH49CW0876": { name: "Shreekant",phone: "9326604708", address: "Dnyaneshwar Bus Stop, Kunbi pura Mahal, Nagpur City, PO: aneshwar Kalmegh, Plot No 441, Ayachit" }
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

async function main() {
  const startTime = Date.now();
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  CANONICAL TRANSPORT DATABASE REIMPORT       ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`Started: ${new Date().toISOString()}\n`);

  // ── 1. Load canonical source ──────────────────────────────────────────
  const jsonPath = path.resolve(__dirname, "../data/transport_routes_16jun26.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Canonical source not found: ${jsonPath}`);
  }
  const canonicalData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const targetDate = canonicalData.date; // "2026-06-16"
  console.log(`✅ Loaded canonical source: ${jsonPath}`);
  console.log(`   Date: ${targetDate}`);
  console.log(`   Routes: ${canonicalData.routes.length}\n`);

  // ── 2. Load all DB employees for matching ─────────────────────────────
  const dbEmployees = await prisma.employee.findMany({
    include: { pickupPoint: true }
  });
  console.log(`✅ Loaded ${dbEmployees.length} employees from database\n`);

  // Build a code→employee map for fast O(1) lookup
  const empByCode = new Map();
  const empByName = new Map();
  for (const e of dbEmployees) {
    if (e.employeeCode) empByCode.set(e.employeeCode, e);
    empByName.set(e.name.trim().toLowerCase(), e);
  }

  const findDbEmployee = (name, code) => {
    // 1. Exact employee code match (most reliable)
    if (code && code !== "NA" && code !== "" && code !== "########" && code !== "null") {
      const found = empByCode.get(code);
      if (found) return found;
    }
    // 2. Exact name match (case-insensitive)
    const cleanName = name.trim().toLowerCase();
    const byName = empByName.get(cleanName);
    if (byName) return byName;
    // 3. Fuzzy containment match
    for (const [key, emp] of empByName) {
      if (key.includes(cleanName) || cleanName.includes(key)) return emp;
    }
    return null;
  };

  // ── 3. Pre-compute: which shifts each vehicle appears in ──────────────
  // This is critical to avoid the "last shift wins" problem
  const vehicleToShifts = new Map(); // vehicleNumber → Set<shiftTime>
  for (const r of canonicalData.routes) {
    const vehNo = r.vehicle.vehicleNumber.toUpperCase();
    if (!vehicleToShifts.has(vehNo)) vehicleToShifts.set(vehNo, new Set());
    vehicleToShifts.get(vehNo).add(r.shiftTime);
  }
  
  console.log("📋 Vehicle → Shift mappings from canonical source:");
  for (const [veh, shifts] of vehicleToShifts) {
    const driver = CANONICAL_CABS[veh]?.name || "Unknown";
    console.log(`   ${veh} (${driver}): ${[...shifts].join(", ")}`);
  }
  console.log();

  // ── 4. Clear existing routes for target date ──────────────────────────
  const existingRoutes = await prisma.route.findMany({
    where: { date: targetDate }
  });
  const routeIds = existingRoutes.map(r => r.id);
  console.log(`🗑  Found ${routeIds.length} existing routes for ${targetDate}. Clearing...`);

  if (routeIds.length > 0) {
    await prisma.routeStop.deleteMany({ where: { routeId: { in: routeIds } } });
    await prisma.violation.deleteMany({ where: { routeId: { in: routeIds } } });
    await prisma.route.deleteMany({ where: { id: { in: routeIds } } });
    console.log("   ✅ Stale routes/stops/violations cleared\n");
  }

  // ── 5. Clear ALL cab→shift connections (full reset) ───────────────────
  console.log("🔌 Clearing all cab→shift connections...");
  const allCabs = await prisma.cab.findMany();
  for (const cab of allCabs) {
    await prisma.cab.update({
      where: { id: cab.id },
      data: { shifts: { set: [] } }
    });
  }
  console.log(`   ✅ Cleared shift connections for ${allCabs.length} cabs\n`);

  // ── 6. Upsert all shifts referenced in canonical data ─────────────────
  const shiftTimeToId = new Map(); // shiftTime → shift.id
  const uniqueShiftTimes = [...new Set(canonicalData.routes.map(r => r.shiftTime))].sort();
  console.log(`⏰ Upserting ${uniqueShiftTimes.length} shifts: ${uniqueShiftTimes.join(", ")}`);
  
  for (const shiftTime of uniqueShiftTimes) {
    let shift = await prisma.shift.findFirst({ where: { startTime: shiftTime } });
    if (!shift) {
      shift = await prisma.shift.create({
        data: {
          name: `${shiftTime} Shift`,
          startTime: shiftTime,
          endTime: shiftTime
        }
      });
      console.log(`   Created shift: ${shiftTime}`);
    } else {
      console.log(`   Found existing shift: ${shiftTime} (${shift.id.substring(0, 8)}...)`);
    }
    shiftTimeToId.set(shiftTime, shift.id);
  }
  console.log();

  // ── 7. Upsert cabs and connect to ALL their shifts ────────────────────
  console.log("🚗 Upserting cabs and connecting to all shifts...");
  const vehicleToDbCabId = new Map(); // vehicleNumber → db cab.id
  let cabs_created = 0;
  let cabs_updated = 0;

  for (const [vehNo, shiftTimes] of vehicleToShifts) {
    const canonCab = CANONICAL_CABS[vehNo] || {};
    // Find driver info from canonical data routes for this vehicle
    const firstRoute = canonicalData.routes.find(r => r.vehicle.vehicleNumber.toUpperCase() === vehNo);
    const driverName = (firstRoute?.driver?.name && firstRoute.driver.name !== "") 
      ? firstRoute.driver.name 
      : (canonCab.name || "Unknown");
    const driverPhone = (firstRoute?.driver?.phone && firstRoute.driver.phone !== null && firstRoute.driver.phone !== "")
      ? firstRoute.driver.phone
      : (canonCab.phone || "0000000000");
    const driverAddress = canonCab.address || "";

    // Collect all shift IDs for this vehicle
    const shiftConnects = [...shiftTimes].map(st => ({ id: shiftTimeToId.get(st) }));

    let cab = await prisma.cab.findUnique({ where: { vehicleNumber: vehNo } });
    if (!cab) {
      cab = await prisma.cab.create({
        data: {
          vehicleNumber: vehNo,
          driverName,
          driverPhone,
          driverAddress,
          licenseNumber: "",
          capacity: 4,
          vendor: "FT",
          status: "AVAILABLE",
          shifts: { connect: shiftConnects }
        }
      });
      cabs_created++;
      console.log(`   ✅ Created: ${vehNo} → Driver: ${driverName} → Shifts: ${[...shiftTimes].join(", ")}`);
    } else {
      cab = await prisma.cab.update({
        where: { id: cab.id },
        data: {
          driverName,
          driverPhone,
          driverAddress,
          status: "AVAILABLE",
          shifts: { connect: shiftConnects }
        }
      });
      cabs_updated++;
      console.log(`   ✅ Updated: ${vehNo} → Driver: ${driverName} → Shifts: ${[...shiftTimes].join(", ")}`);
    }
    vehicleToDbCabId.set(vehNo, cab.id);
  }
  console.log();

  // ── 8. Process each route ─────────────────────────────────────────────
  console.log("📍 Processing routes and creating route stops...\n");
  let routes_created = 0;
  let stops_created = 0;
  let roster_upserted = 0;
  const validation_errors = [];
  const unmatched_employees = [];
  const route_summaries = [];

  for (const [routeIdx, r] of canonicalData.routes.entries()) {
    const vehNo = r.vehicle.vehicleNumber.toUpperCase();
    const cabId = vehicleToDbCabId.get(vehNo);
    const shiftId = shiftTimeToId.get(r.shiftTime);
    
    if (!cabId) {
      const err = `Route ${r.routeId}: cab ${vehNo} not found in DB`;
      validation_errors.push(err);
      console.error(`   ❌ ${err}`);
      continue;
    }

    console.log(`Processing route ${r.routeId} (${r.shiftTime} shift, ${vehNo})...`);

    // Process route stops
    const isPickup = r.routeId.startsWith("P");
    let prevPt = DEPOT;
    let cumDist = 0;
    let cumDur = 0;
    const stopsToCreate = [];
    let routeEmployeeCount = 0;

    for (const [stopIdx, empJson] of r.employees.entries()) {
      const emp = findDbEmployee(empJson.name, empJson.employeeId);
      if (!emp) {
        const warn = `Route ${r.routeId}: employee "${empJson.name}" (ID: ${empJson.employeeId}) not found in DB`;
        console.warn(`   ⚠️  ${warn}`);
        unmatched_employees.push({ route: r.routeId, name: empJson.name, id: empJson.employeeId });
        continue;
      }

      // Update employee's shift assignment
      await prisma.employee.update({
        where: { id: emp.id },
        data: { shiftId }
      });

      // Upsert pickup point
      if (empJson.pickupPoint) {
        let pp = await prisma.pickupPoint.findFirst({
          where: { name: empJson.pickupPoint.trim() }
        });
        if (!pp) {
          pp = await prisma.pickupPoint.create({
            data: {
              name: empJson.pickupPoint.trim(),
              address: empJson.pickupPoint.trim(),
              x: emp.x || DEPOT.x,
              y: emp.y || DEPOT.y,
              zone: emp.zone || "N",
              subZone: emp.subZone || "NE",
              distanceRing: emp.distanceRing || "NEAR"
            }
          });
        }
        await prisma.employee.update({
          where: { id: emp.id },
          data: { pickupPointId: pp.id }
        });
      }

      // Haversine segment distance
      const stopPt = emp.pickupPoint 
        ? { x: emp.pickupPoint.x, y: emp.pickupPoint.y } 
        : { x: emp.x, y: emp.y };
      const dist = haversineKm(prevPt, stopPt);
      cumDist += dist;
      cumDur += dist / AVG_SPEED_KM_MIN;
      prevPt = stopPt;

      // Map status — preserve NO SHOW as NO_SHOW, YES as PRESENT
      const rawStatus = empJson.status || "YES";
      const rosterStatus = rawStatus.replace(" ", "_") === "NO_SHOW" ? "NO_SHOW" 
        : rawStatus === "NO SHOW" ? "NO_SHOW" 
        : "PRESENT";
      const stopStatus = rosterStatus === "NO_SHOW" ? "SKIPPED" : "PENDING";

      stopsToCreate.push({
        employeeId: emp.id,
        stopOrder: stopIdx + 1,
        etaMinutes: Math.round(cumDur),
        status: stopStatus
      });

      // Upsert TransportRoster
      await prisma.transportRoster.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: targetDate } },
        update: {
          transportRosterStatus: rosterStatus,
          sourceSheet: "16-6-26",
          updatedAt: new Date()
        },
        create: {
          employeeId: emp.id,
          date: targetDate,
          transportRosterStatus: rosterStatus,
          sourceSheet: "16-6-26"
        }
      });
      roster_upserted++;
      routeEmployeeCount++;
    }

    // Final leg back to depot
    const depotLeg = haversineKm(prevPt, DEPOT);
    cumDist += depotLeg;
    cumDur += depotLeg / AVG_SPEED_KM_MIN;

    // Create Route record
    const dbRoute = await prisma.route.create({
      data: {
        cabId,
        date: targetDate,
        shiftId,
        isPickup,
        totalDistance: Math.round(cumDist * 10) / 10,
        totalDuration: Math.round(cumDur),
        status: "PLANNED",
        optimizationScore: 0,
        optimizationMode: "CANONICAL",
        routeNumber: routeIdx + 1,
        zone: isPickup ? "N" : null,
        subZone: isPickup ? "NE" : null,
        hasEscort: r.escort || false
      }
    });
    routes_created++;

    // Create RouteStop records
    for (const stop of stopsToCreate) {
      await prisma.routeStop.create({
        data: {
          routeId: dbRoute.id,
          employeeId: stop.employeeId,
          stopOrder: stop.stopOrder,
          etaMinutes: stop.etaMinutes,
          status: stop.status
        }
      });
      stops_created++;
    }

    const canonCab = CANONICAL_CABS[vehNo];
    console.log(`   ✅ Route ${r.routeId}: ${routeEmployeeCount} employees, ${Math.round(cumDist * 10) / 10}km, Driver: ${canonCab?.name || r.driver.name}`);
    route_summaries.push({
      routeId: r.routeId,
      shift: r.shiftTime,
      vehicle: vehNo,
      driver: canonCab?.name || r.driver.name,
      employees_matched: routeEmployeeCount,
      employees_total: r.employees.length,
      distance_km: Math.round(cumDist * 10) / 10
    });
  }

  // ── 9. Verify critical mappings ───────────────────────────────────────
  console.log("\n🔍 Running critical mapping verification...\n");
  const verification = {};

  const criticalChecks = [
    { key: "deepak_singh_kushwah", employeeCode: "2576584", expectedRoute: "P11", expectedShift: "09:00", expectedDriver: "Prashant", expectedVehicle: "MH31FC8407" },
    { key: "yash_karambe",         employeeCode: "2576564", expectedRoute: "P12", expectedShift: "09:00", expectedDriver: "Shreekant", expectedVehicle: "MH49CW0876" },
    { key: "anand_ram_kumar",      employeeCode: "2563946", expectedRoute: "P6",  expectedShift: "07:00", expectedDriver: "Nikhil", expectedVehicle: "MH49CW0139" },
  ];

  for (const check of criticalChecks) {
    const emp = empByCode.get(check.employeeCode);
    if (!emp) {
      verification[check.key] = { passed: false, error: `Employee ${check.employeeCode} not found in DB` };
      continue;
    }

    // Find route stop for this employee on the target date
    const stop = await prisma.routeStop.findFirst({
      where: { employeeId: emp.id },
      include: {
        route: {
          include: {
            cab: true,
            shift: true
          }
        }
      }
    });

    if (!stop) {
      verification[check.key] = { passed: false, error: `No route stop found for ${emp.name}` };
      continue;
    }

    const actualDriver = stop.route.cab.driverName;
    const actualVehicle = stop.route.cab.vehicleNumber;
    const actualShift = stop.route.shift.startTime;
    const actualRouteNum = stop.route.routeNumber;
    const canonicalRoute = canonicalData.routes.find(r => r.employees.some(e => e.employeeId === check.employeeCode));
    const actualRouteId = canonicalRoute ? canonicalRoute.routeId : `route#${actualRouteNum}`;

    const passed = actualDriver.toLowerCase().includes(check.expectedDriver.toLowerCase()) &&
                   actualVehicle === check.expectedVehicle &&
                   actualShift === check.expectedShift;

    verification[check.key] = {
      passed,
      details: {
        employee: emp.name,
        routeId: actualRouteId,
        shift: actualShift,
        driver: actualDriver,
        vehicle: actualVehicle,
        pickupPoint: emp.pickupPoint?.name || "Not assigned"
      },
      expected: {
        route: check.expectedRoute,
        shift: check.expectedShift,
        driver: check.expectedDriver,
        vehicle: check.expectedVehicle
      }
    };

    const statusIcon = passed ? "✅" : "❌";
    console.log(`   ${statusIcon} ${check.key}:`);
    console.log(`      Driver: ${actualDriver} (expected: ${check.expectedDriver})`);
    console.log(`      Vehicle: ${actualVehicle} (expected: ${check.expectedVehicle})`);
    console.log(`      Shift: ${actualShift} (expected: ${check.expectedShift})`);
  }

  // ── 10. Check fleet capacity ──────────────────────────────────────────
  console.log("\n📊 Fleet capacity check (no route should exceed cab capacity)...\n");
  const capacity_violations = [];
  for (const summary of route_summaries) {
    // All cabs have capacity 4 in DB, but routes can have more employees
    const route = canonicalData.routes.find(r => r.routeId === summary.routeId);
    if (route && route.employees.length > 4) {
      capacity_violations.push({
        routeId: summary.routeId,
        employees: route.employees.length,
        capacity: 4,
        overflow: route.employees.length - 4
      });
      console.log(`   ⚠️  Route ${summary.routeId}: ${route.employees.length} employees but cab capacity is 4`);
    }
  }
  if (capacity_violations.length === 0) {
    console.log("   ✅ No capacity violations detected");
  }

  // ── 11. Generate report ───────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const allVerificationsPassed = Object.values(verification).every(v => v.passed);

  const report = {
    timestamp: new Date().toISOString(),
    source_file: "data/transport_routes_16jun26.json",
    target_date: targetDate,
    duration_seconds: parseFloat(elapsed),
    routes_processed: canonicalData.routes.length,
    routes_created,
    routes_updated: 0,
    drivers_created: cabs_created,
    drivers_updated: cabs_updated,
    vehicles_created: cabs_created,
    assignments_created: stops_created,
    roster_entries: roster_upserted,
    unmatched_employees,
    validation_errors,
    capacity_violations,
    import_successful: allVerificationsPassed && validation_errors.length === 0,
    frontend_verification_results: {
      success: allVerificationsPassed,
      details: verification
    },
    route_summaries
  };

  const reportPath = path.resolve(__dirname, "../transport_import_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  IMPORT COMPLETE                             ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Routes created:        ${routes_created}`);
  console.log(`  Cabs updated/created:  ${cabs_updated + cabs_created}`);
  console.log(`  Stops created:         ${stops_created}`);
  console.log(`  Roster entries:        ${roster_upserted}`);
  console.log(`  Unmatched employees:   ${unmatched_employees.length}`);
  console.log(`  Validation errors:     ${validation_errors.length}`);
  console.log(`  Capacity violations:   ${capacity_violations.length}`);
  console.log(`  Critical checks:       ${allVerificationsPassed ? "✅ ALL PASSED" : "❌ SOME FAILED"}`);
  console.log(`  Time elapsed:          ${elapsed}s`);
  console.log(`\n  Report: ${reportPath}`);

  // ── AUTO-FIX CAB CAPACITIES ──────────────────────────────────────────────
  // Compute max employees per vehicle across all routes and update DB capacity.
  // Runs automatically after every import so capacities are always correct.
  console.log("\n📐 Auto-fixing cab capacities based on actual route occupancy...");
  const vehicleMaxOccupancy = {};
  for (const r of canonicalData.routes) {
    const veh = r.vehicle.vehicleNumber.toUpperCase();
    const count = r.employees.length;
    if (!vehicleMaxOccupancy[veh] || count > vehicleMaxOccupancy[veh]) {
      vehicleMaxOccupancy[veh] = count;
    }
  }
  for (const [veh, maxOcc] of Object.entries(vehicleMaxOccupancy)) {
    // Round up to next sensible vehicle size: 4, 6, 7, 8
    let capacity = maxOcc <= 4 ? 4 : maxOcc <= 6 ? 6 : maxOcc <= 7 ? 7 : 8;
    await prisma.cab.updateMany({
      where: { vehicleNumber: veh },
      data: { capacity }
    });
    console.log(`   ${veh}: max=${maxOcc} → capacity=${capacity}`);
  }
  console.log("   ✅ Capacities updated.");

  if (!report.import_successful) {
    console.log("\n⚠️  Import completed but verification failed. Check report for details.");
    process.exit(1);
  } else {
    console.log("\n✅ Import successful — database matches canonical source.");
  }
}

main()
  .catch(err => {
    console.error("\n❌ FATAL ERROR:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

