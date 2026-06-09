const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const routes = await prisma.route.findMany({ include: { shift: true } });
  console.log(routes.map(r => ({ id: r.id, shift: r.shift?.startTime, cab: r.cabId })));
  
  const optimizedRoutes = await prisma.optimizedRouteSnapshot.findMany();
  console.log("Optimized snapshots:", optimizedRoutes.length);
  
  const baselineRoutes = await prisma.baselineRoute.findMany();
  console.log("Baseline routes:", baselineRoutes.length);
}

main().finally(() => prisma.$disconnect());
