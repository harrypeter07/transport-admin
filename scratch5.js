const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const OFFICE_LAT = 21.0625;
const OFFICE_LNG = 79.0526;

async function main() {
  const emps = await prisma.employee.findMany({ where: { shiftId: 'shift-0800' } });
  const cabs = await prisma.cab.findMany({ take: 10 });
  
  if (emps.length === 0) {
    console.log("No employees found for 8:00 AM shift.");
    return;
  }
  
  // Create clusters based on geography (k-means or simple grid/distance)
  // Let's do simple manual clustering for 20 employees into 4-5 routes.
  // First, sort by distance to office (descending)
  emps.forEach(e => {
    e.distToOffice = getDistance(e.y, e.x, OFFICE_LAT, OFFICE_LNG);
  });
  
  // Simple clustering algorithm:
  // 1. Pick unassigned employee farthest from office.
  // 2. Find nearest 4 unassigned employees to this employee.
  // 3. This forms a cluster. Repeat.
  let unassigned = [...emps];
  const clusters = [];
  while (unassigned.length > 0) {
    unassigned.sort((a, b) => b.distToOffice - a.distToOffice);
    const center = unassigned[0];
    unassigned.splice(0, 1);
    
    const cluster = [center];
    while (cluster.length < 5 && unassigned.length > 0) {
      unassigned.sort((a, b) => {
        const distA = getDistance(center.y, center.x, a.y, a.x);
        const distB = getDistance(center.y, center.x, b.y, b.x);
        return distA - distB;
      });
      cluster.push(unassigned[0]);
      unassigned.splice(0, 1);
    }
    
    // Sort cluster by distance to office (descending) so farthest is picked first
    cluster.sort((a, b) => b.distToOffice - a.distToOffice);
    clusters.push(cluster);
  }
  
  console.log("CLUSTERS:");
  clusters.forEach((c, idx) => {
    console.log(`\nRoute ${idx+1}`);
    c.forEach((emp, i) => {
      console.log(`  Stop ${i+1}: ${emp.name} | Dist to office: ${emp.distToOffice.toFixed(2)} km`);
    });
  });
}

main().finally(() => prisma.$disconnect());
