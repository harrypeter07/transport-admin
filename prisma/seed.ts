const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning database and running clean seed...");

  // Clear in dependency order
  await prisma.stopOperationalLog.deleteMany();
  await prisma.violation.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.timingChangeRequest.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.cab.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.systemSettings.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.user.deleteMany();

  // Hash password with bcrypt (cost factor 10)
  const hashedPassword = await bcrypt.hash("Admin@1234", 10);

  // Create default Admin User
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@transitadmin.com",
      password: hashedPassword,
      name: "Admin User",
      role: "ADMIN",
    },
  });

  // Create default SystemSettings
  await prisma.systemSettings.create({
    data: {
      id: "default",
      leaveApprovalRequired: true,
      timingChangeApprovalRequired: true,
    },
  });

  console.log("✅ Database seeded. Admin:", adminUser.email);
  console.log("   Default password: Admin@1234  (change this after first login)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
