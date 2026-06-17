const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  const dates = ["2026-06-16", "2026-06-17"];

  for (const d of dates) {
    console.log(`=== AUDIT FOR DATE: ${d} ===`);
    const stops = await prisma.routeStop.findMany({
      where: {
        route: { date: d },
        employee: {
          name: {
            in: ["Deepak singh kushwah", "yash karambe", "Yash Karambe"],
            mode: "insensitive"
          }
        }
      },
      include: {
        employee: { include: { shift: true } },
        route: { include: { shift: true } }
      }
    });

    console.log(`Found ${stops.length} stops for Deepak / Yash:`);
    for (const s of stops) {
      console.log({
        stopId: s.id,
        employeeCode: s.employee.employeeCode,
        employeeName: s.employee.name,
        employeeProfileShift: s.employee.shift?.name,
        routeId: s.routeId,
        routeDate: s.route.date,
        routeShift: s.route.shift?.name,
        routeNumber: s.route.routeNumber,
        stopOrder: s.stopOrder
      });
    }
  }

  await prisma.$disconnect();
}

run();
