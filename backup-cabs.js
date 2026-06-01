const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function backup() {
  console.log('Fetching cabs...');
  const cabs = await prisma.cab.findMany({
    where: { shiftId: { not: null } },
    select: { id: true, shiftId: true }
  });
  
  fs.writeFileSync('cabs_backup.json', JSON.stringify(cabs, null, 2));
  console.log(`Backed up ${cabs.length} cab shift assignments to cabs_backup.json`);
  
  await prisma.$disconnect();
}

backup().catch(console.error);
