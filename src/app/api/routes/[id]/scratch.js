const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const route = await prisma.route.findFirst({ include: { stops: { include: { employee: true } } } });
  console.log("Route id:", route.id, "stops:", route.stops.length);
}
main();
