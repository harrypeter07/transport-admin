import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const TEST_LOGIN_ACCOUNTS = [
  { email: "admin@transitadmin.com", name: "Admin User", role: "ADMIN", password: "Admin@1234" },
  { email: "manager@test.com", name: "Sarah Manager", role: "MANAGER", password: "Test@123" },
  { email: "employee@test.com", name: "John Employee", role: "EMPLOYEE", password: "Test@123" },
];

async function ensureTestLoginAccounts() {
  for (const account of TEST_LOGIN_ACCOUNTS) {
    const password = await bcrypt.hash(account.password, 10);
    await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        role: account.role,
        password,
        isActive: true,
        requiresPasswordChange: false,
        resetToken: null,
        resetTokenExpiry: null,
      },
      create: {
        email: account.email,
        name: account.name,
        role: account.role,
        password,
        isActive: true,
        requiresPasswordChange: false,
      },
    });
  }
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.log("This will clear current transport/business data and keep only test login accounts.");
    console.log("Run with: npm run db:prepare-import -- --confirm");
    return;
  }

  const preservedEmails = TEST_LOGIN_ACCOUNTS.map((account) => account.email);
  console.log("Preparing database for a fresh Excel import...");

  await prisma.$transaction([
    prisma.routeDeviation.deleteMany(),
    prisma.vehicleLocation.deleteMany(),
    prisma.operationalEvent.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationSettings.deleteMany(),
    prisma.violation.deleteMany(),
    prisma.routeStop.deleteMany(),
    prisma.route.deleteMany(),
    prisma.timingChangeRequest.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.cab.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.systemSettings.deleteMany(),
    prisma.user.deleteMany({ where: { email: { notIn: preservedEmails } } }),
  ]);

  await ensureTestLoginAccounts();
  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const rosterPath = path.join(process.cwd(), "roster.xlsx");
  if (fs.existsSync(rosterPath)) {
    fs.unlinkSync(rosterPath);
  }

  console.log("Ready for Excel import.");
  console.log("Preserved accounts:");
  TEST_LOGIN_ACCOUNTS.forEach((account) => {
    console.log(`- ${account.email}`);
  });
}

main()
  .catch((error) => {
    console.error("Failed preparing database for Excel import:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
