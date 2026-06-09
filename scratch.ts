import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const shift = await prisma.shift.findFirst({
    where: { startTime: '08:00' },
    include: {
      routes: {
        include: {
          stops: {
            include: { employee: true },
            orderBy: { stopOrder: 'asc' }
          },
          cab: true
        }
      }
    }
  });
  
  if (!shift) {
    console.log("No 8:00 AM shift found.");
    return;
  }
  
  console.log(`Shift ID: ${shift.id}`);
  for (const route of shift.routes) {
    console.log(`Route ID: ${route.id} | Cab: ${route.cab?.vehicleNumber} | Date: ${route.date}`);
    for (const stop of route.stops) {
      console.log(`  Stop ${stop.stopOrder}: ${stop.employee?.name} (${stop.employee?.address}) [Lat: ${stop.employee?.lat}, Lng: ${stop.employee?.lng}]`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
