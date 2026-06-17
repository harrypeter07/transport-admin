const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  console.log("=== ROUTE R1 (05:00, 2026-06-16) ===");
  const r1 = await prisma.route.findUnique({
    where: { id: "37477f61-9f8d-4ab5-b0ba-05dbf7a83f82" },
    include: {
      stops: {
        include: {
          employee: {
            include: { shift: true }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(r1, null, 2));

  console.log("\n=== ROUTE R3 (09:00, 2026-06-16) ===");
  const r3 = await prisma.route.findUnique({
    where: { id: "40ad39c7-276e-405a-8f32-5be0890ca3ae" },
    include: {
      stops: {
        include: {
          employee: {
            include: { shift: true }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(r3, null, 2));

  console.log("\n=== DEEPAK'S ROUTE ON 2026-06-12 ===");
  const dep12 = await prisma.route.findUnique({
    where: { id: "c69ee318-56d1-43b6-a3a0-b724afd6cf55" },
    include: {
      stops: {
        include: {
          employee: {
            include: { shift: true }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(dep12, null, 2));

  console.log("\n=== YASH'S ROUTE ON 2026-06-12 ===");
  const yash12 = await prisma.route.findUnique({
    where: { id: "ea6e50b8-cc66-40e8-98dc-3ce6b22ba01f" },
    include: {
      stops: {
        include: {
          employee: {
            include: { shift: true }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(yash12, null, 2));

  await prisma.$disconnect();
}

run();
