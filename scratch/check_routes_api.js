const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const routes = await prisma.route.findMany({
    where: {
      date: "2026-06-16",
      cab: { status: { not: "INACTIVE" } },
    },
    include: {
      cab: true,
      shift: true,
      stops: {
        include: { employee: { include: { pickupPoint: true } } },
        orderBy: { stopOrder: "asc" },
      },
      violations: true,
    },
    orderBy: { tripSequence: "asc" },
  });

  console.log("Returned routes count:", routes.length);
  if (routes.length > 0) {
    const r = routes[0];
    console.log("Sample Route Object:");
    console.log(JSON.stringify({
      id: r.id,
      routeNumber: r.routeNumber,
      cabId: r.cabId,
      cab: r.cab,
      shift: r.shift,
    }, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
