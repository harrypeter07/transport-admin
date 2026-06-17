const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  console.log("=== CHECKING BY SPECIFIC CODES ===");
  const codeEmployees = await prisma.employee.findMany({
    where: {
      OR: [
        { employeeCode: "2576584" },
        { employeeCode: "2576584-1" }
      ]
    },
    include: {
      shift: true,
      stops: {
        include: {
          route: true
        }
      }
    }
  });
  console.log(JSON.stringify(codeEmployees, null, 2));

  console.log("\n=== CHECKING BY NAME: YASH ===");
  const yashEmployees = await prisma.employee.findMany({
    where: {
      OR: [
        { name: { contains: "Yash", mode: "insensitive" } },
        { name: { contains: "Karambe", mode: "insensitive" } }
      ]
    },
    include: {
      shift: true,
      stops: {
        include: {
          route: true
        }
      }
    }
  });
  console.log(JSON.stringify(yashEmployees, null, 2));

  console.log("\n=== CHECKING BY NAME: DEEPAK ===");
  const deepakEmployees = await prisma.employee.findMany({
    where: {
      name: { contains: "Deepak", mode: "insensitive" }
    },
    include: {
      shift: true,
      stops: {
        include: {
          route: true
        }
      }
    }
  });
  console.log(JSON.stringify(deepakEmployees, null, 2));

  console.log("\n=== GROUP BY CODE TO IDENTIFY DUPLICATES ===");
  const dups = await prisma.employee.groupBy({
    by: ["employeeCode"],
    _count: true,
    having: {
      employeeCode: {
        _count: {
          gt: 1
        }
      }
    }
  });
  console.log(dups);

  await prisma.$disconnect();
}

run();
