const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding test data...");

  // 1. Create a default Shift
  const shift = await prisma.shift.upsert({
    where: { id: "test-shift-1" },
    update: {},
    create: {
      id: "test-shift-1",
      name: "Morning Shift",
      startTime: "09:00",
      endTime: "18:00",
    }
  });

  const defaultPassword = await bcrypt.hash("Welcome@123", 10);

  // 2. Create Test Employee User
  const employeeUser = await prisma.user.upsert({
    where: { email: "employee@test.com" },
    update: {},
    create: {
      email: "employee@test.com",
      password: defaultPassword,
      name: "Test Employee",
      role: "EMPLOYEE",
      requiresPasswordChange: false,
    }
  });

  // 3. Create Test Employee Record
  await prisma.employee.upsert({
    where: { employeeCode: "EMP-TEST-001" },
    update: {},
    create: {
      employeeCode: "EMP-TEST-001",
      name: "Test Employee",
      gender: "MALE",
      phone: "9876543210",
      email: "employee@test.com",
      address: "123 Test Street, Nagpur",
      x: 21.1458,
      y: 79.0882, // Nagpur coords
      department: "Engineering",
      designation: "Software Engineer",
      status: "ACTIVE",
      shiftId: shift.id,
      userId: employeeUser.id,
    }
  });

  // 4. Create Test Driver User
  const driverUser = await prisma.user.upsert({
    where: { email: "driver@test.com" },
    update: {},
    create: {
      email: "driver@test.com",
      password: defaultPassword,
      name: "Test Driver",
      role: "DRIVER",
      requiresPasswordChange: false,
    }
  });

  // 5. Create Test Cab (Driver) Record
  await prisma.cab.upsert({
    where: { vehicleNumber: "MH31TEST1234" },
    update: { userId: driverUser.id },
    create: {
      vehicleNumber: "MH31TEST1234",
      capacity: 4,
      vendor: "Test Transport",
      status: "AVAILABLE",
      userId: driverUser.id,
      driverName: "Test Driver",
      driverPhone: "9876543211",
      licenseNumber: "DL-TEST-9999",
      shiftId: shift.id,
    }
  });

  console.log("Test data seeded successfully!");
  console.log("-----------------------------------------");
  console.log("Test Employee Login: employee@test.com / Welcome@123");
  console.log("Test Driver Login: driver@test.com / Welcome@123");
  console.log("-----------------------------------------");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
