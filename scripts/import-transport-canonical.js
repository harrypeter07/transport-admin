const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const DEPOT = { x: 79.0526, y: 21.0625 }; // MIHAN Depot Nagpur
const AVG_SPEED_KM_MIN = 0.5; // 30 km/h
const CIRCUITY = 1.3;

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

const CANONICAL_CABS = {
  "MH49CW0078": {"name": "SURAJ", "phone": "9561326459", "address": "S/O Pradip Krushnarao Wasnik, near gajanan maharaj mandir, 220, new balaji nagar vistar, \nmanewada road, bhgwan nagar, Nagpur, Maharashtra-440027"},
  "MH40CT4542": {"name": "Tapan", "phone": "8208223602", "address": "House.No-285 Near Awachat Kirana Store Beldar Nagar, Narsala Hudkeshwar khurd. Nagpur (rural) Nagpur 440034"},
  "MH31FC8592": {"name": "Sandeep", "phone": "9021863195", "address": "91, SUDAM NAGARI, AMBAZARI, NAGPUR., NAGPUR (M CORP.) NAGPUR"},
  "MH49CW0218": {"name": "ANIKET", "phone": "9325911859", "address": "NEAR KUNBI PURA BHAVAN HOUSE NO 435 AYACHIT MANDIR BUS STOP \nKUNBI PURA MAHAL Nagpur (Urban), Nagpur, MH"},
  "MH40DC0486": {"name": "SHAFIQUE", "phone": "9595420800", "address": "Add P NO 190 MOTHI VIHIR MUMTAZ MANZIL SADABHAWANA NAGAR NAGPUR (URBAN), NAGPUR"},
  "MH49CW0139": {"name": "Nikhil", "phone": "9764325500", "address": "61, Hudkeshwar Bujrug Hudkeshwar Bk. Nagpur Maharashtra 440034"},
  "MH49CW1305": {"name": "Shantanu", "phone": "8261990745", "address": "P NO 15/B JAI GURUDEV NAGAR NEAR BHARAT GAS"},
  "MH31FC8407": {"name": "Prashant", "phone": "7620971911", "address": "PLOT NO-65, RATHI LAYOUT NR ASHIRWAD SCHOOL GODHANI ROAD\n ZINGABAI TAKLI NAGPUR NAGPUR (M CORP.), NAGPUR,MH"},
  "MH49CW0876": {"name": "Shreekant", "phone": "9326604708", "address": "Dnyaneshwar Bus Stop, Kunbi pura Mahal, Nagpur City, PO: aneshwar Kalmegh, Plot No 441, Ayachit"}
};

async function main() {
  console.log("=== RUNNING DATABASE UPDATE FROM CANONICAL SOURCE ===");

  // 1. Read transport_routes_16jun26.json
  const jsonPath = path.resolve(__dirname, "../data/transport_routes_16jun26.json");
  const canonicalData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const targetDate = canonicalData.date; // "2026-06-16"

  // 2. Fetch all employees from DB for mapping
  const dbEmployees = await prisma.employee.findMany({
    include: {
      pickupPoint: true
    }
  });
  console.log(`Fetched ${dbEmployees.length} employees from database.`);

  const findDbEmployee = (name, code) => {
    const cleanName = name.trim().toLowerCase();
    if (code && code !== "NA" && code !== "") {
      const found = dbEmployees.find(e => e.employeeCode === code);
      if (found) return found;
    }
    const foundByName = dbEmployees.find(e => e.name.trim().toLowerCase() === cleanName);
    if (foundByName) return foundByName;
    
    const fuzzy = dbEmployees.find(e => e.name.trim().toLowerCase().includes(cleanName) || cleanName.includes(e.name.trim().toLowerCase()));
    if (fuzzy) return fuzzy;
    
    return null;
  };

  // 3. Clear existing routes for 2026-06-16
  const existingRoutes = await prisma.route.findMany({
    where: { date: targetDate }
  });
  const routeIds = existingRoutes.map(r => r.id);
  console.log(`Found ${routeIds.length} existing routes for ${targetDate}. Cleaning up...`);

  if (routeIds.length > 0) {
    await prisma.routeStop.deleteMany({
      where: { routeId: { in: routeIds } }
    });
    await prisma.violation.deleteMany({
      where: { routeId: { in: routeIds } }
    });
    await prisma.route.deleteMany({
      where: { id: { in: routeIds } }
    });
    console.log("Stale routes, stops, and violations cleared.");
  }

  // 4. Disconnect all cabs from all shifts to prevent driver-shift mismatches
  const allCabs = await prisma.cab.findMany();
  console.log(`Clearing shift connections for all ${allCabs.length} cabs...`);
  for (const cab of allCabs) {
    await prisma.cab.update({
      where: { id: cab.id },
      data: {
        shifts: {
          set: []
        }
      }
    });
  }
  console.log("Cab shift connections cleared.");

  let cabsUpdated = 0;
  let shiftsUpdated = 0;
  let routesCreated = 0;
  let stopsCreated = 0;
  let rosterUpserted = 0;

  // 5. Process each route from canonical JSON
  for (const [routeIdx, r] of canonicalData.routes.entries()) {
    console.log(`Processing route ${r.routeId}...`);

    // A. Upsert Shift
    let shift = await prisma.shift.findFirst({
      where: { startTime: r.shiftTime }
    });
    if (!shift) {
      shift = await prisma.shift.create({
        data: {
          name: `${r.shiftTime} Shift`,
          startTime: r.shiftTime,
          endTime: r.shiftTime
        }
      });
      shiftsUpdated++;
      console.log(`  Created shift ${r.shiftTime}`);
    }

    // B. Upsert Cab (Driver and Vehicle)
    const vehNo = r.vehicle.vehicleNumber.toUpperCase();
    const canonCab = CANONICAL_CABS[vehNo] || {};
    const driverName = r.driver.name || canonCab.name || "Unknown";
    const driverPhone = r.driver.phone || canonCab.phone || "0000000000";
    const driverAddress = canonCab.address || "";

    let cab = await prisma.cab.findUnique({
      where: { vehicleNumber: vehNo }
    });

    if (!cab) {
      cab = await prisma.cab.create({
        data: {
          vehicleNumber: vehNo,
          driverName: driverName,
          driverPhone: driverPhone,
          driverAddress: driverAddress,
          capacity: 4,
          vendor: "FT",
          status: "AVAILABLE"
        }
      });
      console.log(`  Created Cab: ${vehNo} (Driver: ${driverName})`);
    } else {
      cab = await prisma.cab.update({
        where: { id: cab.id },
        data: {
          driverName: driverName,
          driverPhone: driverPhone,
          driverAddress: driverAddress,
          status: "AVAILABLE"
        }
      });
      console.log(`  Updated Cab: ${vehNo} (Driver: ${driverName})`);
    }
    cabsUpdated++;

    // Connect Cab to Shift
    await prisma.cab.update({
      where: { id: cab.id },
      data: {
        shifts: {
          connect: { id: shift.id }
        }
      }
    });

    // C. Process Route Stops
    const isPickup = r.routeId.startsWith("P");
    let prevPt = DEPOT;
    let cumDist = 0;
    let cumDur = 0;
    const stopsToCreate = [];

    for (const [stopIdx, empJson] of r.employees.entries()) {
      const emp = findDbEmployee(empJson.name, empJson.employeeId);
      if (!emp) {
        console.warn(`  ⚠️ Employee "${empJson.name}" (ID: ${empJson.employeeId}) not found in DB!`);
        continue;
      }

      // Update Employee shift
      await prisma.employee.update({
        where: { id: emp.id },
        data: { shiftId: shift.id }
      });

      // Handle Pickup Point Upsert and assignment
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
          console.log(`  Created Pickup Point: ${pp.name}`);
        }
        
        // Connect employee to pickup point
        await prisma.employee.update({
          where: { id: emp.id },
          data: { pickupPointId: pp.id }
        });
      }

      // Calculate Haversine segment distance
      const stopPt = emp.pickupPoint ? { x: emp.pickupPoint.x, y: emp.pickupPoint.y } : { x: emp.x, y: emp.y };
      const dist = haversineKm(prevPt, stopPt);
      cumDist += dist;
      cumDur += dist / AVG_SPEED_KM_MIN;
      prevPt = stopPt;

      stopsToCreate.push({
        employeeId: emp.id,
        stopOrder: stopIdx + 1,
        etaMinutes: Math.round(cumDur),
        status: empJson.status === "NO_SHOW" ? "SKIPPED" : "PENDING"
      });

      // Upsert TransportRoster
      const rosterStatus = empJson.status === "NO_SHOW" ? "NO_SHOW" : "PRESENT";
      await prisma.transportRoster.upsert({
        where: {
          employeeId_date: {
            employeeId: emp.id,
            date: targetDate
          }
        },
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
      rosterUpserted++;
    }

    // Add final leg back to Depot
    const depotLeg = haversineKm(prevPt, DEPOT);
    cumDist += depotLeg;
    cumDur += depotLeg / AVG_SPEED_KM_MIN;

    // D. Create Route record in DB
    const dbRoute = await prisma.route.create({
      data: {
        cabId: cab.id,
        date: targetDate,
        shiftId: shift.id,
        isPickup,
        totalDistance: Math.round(cumDist * 10) / 10,
        totalDuration: Math.round(cumDur),
        status: "PLANNED",
        optimizationScore: 0,
        optimizationMode: "FASTEST_TRAVEL",
        routeNumber: routeIdx + 1,
        zone: isPickup ? "N" : null,
        subZone: isPickup ? "NE" : null,
        hasEscort: r.escort || false
      }
    });
    routesCreated++;

    // E. Create RouteStops in DB
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
      stopsCreated++;
    }
  }

  console.log("\n=== DATABASE UPDATE COMPLETED ===");
  console.log(`  Shifts updated/created: ${shiftsUpdated}`);
  console.log(`  Cabs updated/created: ${cabsUpdated}`);
  console.log(`  Routes created: ${routesCreated}`);
  console.log(`  Route stops created: ${stopsCreated}`);
  console.log(`  Roster status entries: ${rosterUpserted}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
