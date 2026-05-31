import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding test data...");

  // Setup Default Settings and Shift
  const shift = await prisma.shift.upsert({
    where: { id: "test-shift" },
    update: {},
    create: {
      id: "test-shift",
      name: "Standard Day Shift",
      startTime: "09:00",
      endTime: "18:00",
    }
  });

  const defaultPassword = await bcrypt.hash("Test@123", 10);

  // 1. Create a Test Manager
  const managerUser = await prisma.user.upsert({
    where: { email: "manager@test.com" },
    update: {},
    create: {
      email: "manager@test.com",
      name: "Sarah Manager",
      password: defaultPassword,
      role: "MANAGER",
      requiresPasswordChange: false,
    }
  });

  const manager = await prisma.employee.upsert({
    where: { email: "manager@test.com" },
    update: {},
    create: {
      employeeCode: "MGR-001",
      name: "Sarah Manager",
      gender: "FEMALE",
      phone: "+91 9999999990",
      email: "manager@test.com",
      address: "IT Park, Nagpur",
      x: 21.1111,
      y: 79.1111,
      department: "Engineering",
      designation: "Manager",
      shiftId: shift.id,
      status: "ACTIVE",
      userId: managerUser.id,
    }
  });

  // 2. Create a Test Employee reporting to Manager
  const empUser = await prisma.user.upsert({
    where: { email: "employee@test.com" },
    update: {},
    create: {
      email: "employee@test.com",
      name: "John Employee",
      password: defaultPassword,
      role: "EMPLOYEE",
      requiresPasswordChange: false,
    }
  });

  await prisma.employee.upsert({
    where: { email: "employee@test.com" },
    update: { managerId: manager.id }, // Assign manager
    create: {
      employeeCode: "EMP-001",
      name: "John Employee",
      gender: "MALE",
      phone: "+91 9999999991",
      email: "employee@test.com",
      address: "Sadar, Nagpur",
      x: 21.1555,
      y: 79.1222,
      department: "Engineering",
      designation: "Engineer",
      shiftId: shift.id,
      managerId: manager.id, // Assign manager
      status: "ACTIVE",
      userId: empUser.id,
    }
  });

  // 3. Create a Test Cab and Driver
  await prisma.cab.upsert({
    where: { vehicleNumber: "MH31 TEST" },
    update: {},
    create: {
      vehicleNumber: "MH31 TEST",
      capacity: 4,
      vendor: "Test Transport",
      status: "AVAILABLE",
      driverName: "Raj Driver",
      driverPhone: "+91 9999999992",
      licenseNumber: "DL-MH31-TEST",
      shifts: {
        connect: { id: shift.id }
      }
    }
  });

  console.log("Seeding complete! You can log in with:");
  console.log("- employee@test.com / Test@123");
  console.log("- manager@test.com / Test@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
