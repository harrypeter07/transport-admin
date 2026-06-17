/**
 * fix-cab-capacities.js
 * Updates cab capacity in DB based on the actual max employees
 * seen in any single route in transport_routes_16jun26.json
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.resolve(__dirname, "../data/transport_routes_16jun26.json");
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  // Compute max employees per vehicle across all routes
  const vehicleMaxOccupancy = {};
  for (const r of data.routes) {
    const veh = r.vehicle.vehicleNumber.toUpperCase();
    const count = r.employees.length;
    if (!vehicleMaxOccupancy[veh] || count > vehicleMaxOccupancy[veh]) {
      vehicleMaxOccupancy[veh] = count;
    }
  }

  console.log("Updating cab capacities based on actual route occupancy:");
  for (const [veh, maxOcc] of Object.entries(vehicleMaxOccupancy)) {
    // Round up to next sensible vehicle size: 4, 6, 7, 8, 10, 12
    let capacity = maxOcc;
    if (maxOcc <= 4) capacity = 4;
    else if (maxOcc <= 6) capacity = 6;
    else if (maxOcc <= 7) capacity = 7;
    else capacity = 8;

    const updated = await prisma.cab.updateMany({
      where: { vehicleNumber: veh },
      data: { capacity }
    });
    console.log(`  ${veh}: max occupancy=${maxOcc} → capacity set to ${capacity} (updated ${updated.count} record)`);
  }

  console.log("\n✅ Cab capacities updated.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
