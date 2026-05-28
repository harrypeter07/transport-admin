const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning database and running clean seed...");

  // Clear existing data
  await prisma.violation.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.cab.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.user.deleteMany();

  // Create default Admin User
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@transitadmin.com",
      password: "admin",
      name: "Admin User",
      role: "ADMIN",
    },
  });

  console.log("Database reset complete. Created default admin:", adminUser.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
