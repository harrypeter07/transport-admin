const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  const today = new Date().toISOString().split("T")[0];
  console.log(`Starting parallel metrics measurement for date: ${today}`);

  const start = performance.now();

  try {
    const [
      totalEmployeesCount,
      totalManagersCount,
      totalLeavesTodayCount,
      totalAbsencesCount,
      pendingLeaves,
      pendingTimings,
      allRoutesToday,
      delayedEmployees,
      settings
    ] = await Promise.all([
      prisma.employee.count({ where: { status: "ACTIVE" } }),
      prisma.employee.count({
        where: {
          designation: { in: ["Manager", "Senior Manager"] },
          status: "ACTIVE",
        },
      }),
      prisma.leaveRequest.count({
        where: {
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today }
        }
      }),
      prisma.routeStop.count({
        where: {
          route: { date: today },
          status: "SKIPPED"
        }
      }),
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.timingChangeRequest.count({ where: { status: "PENDING" } }),
      prisma.route.findMany({
        where: { date: today },
        include: {
          cab: true,
          stops: {
            include: { employee: true },
            orderBy: { stopOrder: "asc" }
          }
        }
      }),
      prisma.routeStop.findMany({
        where: {
          route: { date: today },
          OR: [
            { employeeDelayMins: { gt: 0 } },
            { driverDelayMins: { gt: 0 } }
          ]
        },
        include: {
          employee: true,
          route: { include: { cab: true } }
        }
      }),
      prisma.systemSettings.findFirst({
        where: { id: "default" }
      })
    ]);

    const end = performance.now();
    console.log(`  ✅ All 9 dashboard queries in parallel: ${(end - start).toFixed(2)} ms`);
    console.log(`  Summary of results:`);
    console.log(`    Employees: ${totalEmployeesCount}`);
    console.log(`    Managers: ${totalManagersCount}`);
    console.log(`    Leaves: ${totalLeavesTodayCount}`);
    console.log(`    Absences: ${totalAbsencesCount}`);
    console.log(`    Pending Leaves: ${pendingLeaves}`);
    console.log(`    Pending Timings: ${pendingTimings}`);
    console.log(`    Routes count: ${allRoutesToday.length}`);
    console.log(`    Delayed count: ${delayedEmployees.length}`);
  } catch (err) {
    const end = performance.now();
    console.log(`  ❌ Failed parallel query block: ${(end - start).toFixed(2)} ms. Error: ${err.message}`);
  }

  await prisma.$disconnect();
}

run();
