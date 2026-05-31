const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Check employees - how many have null/zero coordinates
  const employees = await p.employee.findMany({
    select: { id: true, name: true, x: true, y: true, status: true }
  });

  const nullCoords = employees.filter(e => !e.x || !e.y || e.x === 0 || e.y === 0);
  const validCoords = employees.filter(e => e.x && e.y && e.x !== 0 && e.y !== 0);

  console.log(`\nTotal employees: ${employees.length}`);
  console.log(`With valid coordinates: ${validCoords.length}`);
  console.log(`With null/zero coordinates: ${nullCoords.length}`);

  // Check cabs
  const cabs = await p.cab.findMany({
    select: { id: true, vehicleNumber: true, capacity: true, status: true }
  });

  console.log(`\nTotal cabs: ${cabs.length}`);
  console.log('Cab capacities:');
  cabs.forEach(c => console.log(`  ${c.vehicleNumber}: capacity=${c.capacity}, status=${c.status}`));

  const totalCapacity = cabs.filter(c => c.status === 'AVAILABLE').reduce((s, c) => s + c.capacity, 0);
  const activeEmployees = employees.filter(e => e.status === 'ACTIVE').length;
  console.log(`\nTotal available cab capacity: ${totalCapacity}`);
  console.log(`Active employees: ${activeEmployees}`);
  console.log(`Shortfall: ${Math.max(0, activeEmployees - totalCapacity)}`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
