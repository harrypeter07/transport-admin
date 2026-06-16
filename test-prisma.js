const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function test() {
  try {
    console.log("Prisma object keys:");
    console.log(Object.keys(prisma));
    console.log("\nChecking for transportRoster:");
    console.log("transportRoster" in prisma);
    console.log(prisma.transportRoster);
    
    const result = await prisma.employee.count();
    console.log(`Employee count: ${result}`);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
