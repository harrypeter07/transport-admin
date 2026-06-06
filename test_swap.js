const { PrismaClient } = require('@prisma/client');
const { fetchGoogleRouteMetrics } = require('./src/lib/optimization');

const prisma = new PrismaClient();

async function main() {
  const route = await prisma.route.findFirst({ include: { stops: { include: { employee: true } } } });
  if (!route) return console.log("No route");
  
  const cab = await prisma.cab.findFirst({ where: { id: { not: route.cabId } } });
  if (!cab) return console.log("No other cab");

  console.log("Found route:", route.id, "Cab:", cab.id);
  
  // mock request
  const fetch = require('node-fetch');
  const res = await fetch('http://localhost:3000/api/routes/' + route.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: "SWAP_CAB", cabId: cab.id })
  });
  
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text);
}
main().catch(console.error);
