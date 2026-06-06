const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const http = require('http');

async function main() {
  const route = await prisma.route.findFirst({ include: { stops: { include: { employee: true } } } });
  if (!route) return console.log("No route");
  
  const cab = await prisma.cab.findFirst({ where: { id: { not: route.cabId } } });
  if (!cab) return console.log("No cab");

  console.log("Found route", route.id, "and cab", cab.id);

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/routes/' + route.id,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  }, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Response:', res.statusCode, data));
  });
  req.on('error', console.error);
  req.write(JSON.stringify({ action: "SWAP_CAB", cabId: cab.id }));
  req.end();
}
main().finally(() => prisma.$disconnect());
