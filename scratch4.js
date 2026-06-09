const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const baselineRoute = await prisma.baselineRoute.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (!baselineRoute) return;
  
  let routeData = baselineRoute.routeData;
  if (typeof routeData === 'string') routeData = JSON.parse(routeData);
  if (routeData && !Array.isArray(routeData) && Array.isArray(routeData.routes)) routeData = routeData.routes;
  
  const employees = await prisma.employee.findMany();
  const empMap = {};
  for (const e of employees) {
    empMap[e.id] = e;
  }
  
  const shift0800Routes = routeData.filter(r => r.shiftId === "shift-0800");
  
  for (const route of shift0800Routes) {
    console.log(`\nRoute Cab: ${route.cabId} | isPickup: ${route.isPickup}`);
    for (const stop of route.stops) {
      const emp = empMap[stop.employeeId];
      if (emp) {
        console.log(`  Stop: ${emp.name} | [${emp.x}, ${emp.y}] | Area: ${emp.address} | ID: ${emp.id}`);
      } else {
        console.log(`  Stop: ${stop.employeeId} (Not Found in DB)`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
