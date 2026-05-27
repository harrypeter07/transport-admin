const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding started...");

  // Clear existing data
  await prisma.violation.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.cab.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Admin User
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@transitadmin.com",
      password: "admin",
      name: "Admin User",
      role: "ADMIN",
    },
  });

  console.log("Created users:", {
    admin: adminUser.email,
  });

  // 2. Create Shifts
  const shiftMorning = await prisma.shift.create({
    data: { name: "Morning Shift", startTime: "09:00", endTime: "18:00" },
  });

  const shiftEvening = await prisma.shift.create({
    data: { name: "Evening Shift", startTime: "18:00", endTime: "02:00" },
  });

  const shiftNight = await prisma.shift.create({
    data: { name: "Night Shift", startTime: "22:00", endTime: "06:00" },
  });

  console.log("Created shifts.");

  // 3. Create Drivers & Cabs
  const driverData = [
    { name: "John Doe", phone: "+91 98765 43210", licenseNumber: "DL-NGP-01", status: "AVAILABLE" },
    { name: "David Miller", phone: "+91 98765 43211", licenseNumber: "DL-NGP-02", status: "AVAILABLE" },
    { name: "Robert Chen", phone: "+91 98765 43212", licenseNumber: "DL-NGP-03", status: "AVAILABLE" },
    { name: "Sarah Connor", phone: "+91 98765 43213", licenseNumber: "DL-NGP-04", status: "AVAILABLE" },
  ];

  const cabData = [
    { vehicleNumber: "MH-31-TR-1111", capacity: 4, vendor: "Maharaja Transport", status: "AVAILABLE" },
    { vehicleNumber: "MH-31-TR-2222", capacity: 4, vendor: "Maharaja Transport", status: "AVAILABLE" },
    { vehicleNumber: "MH-31-TR-3333", capacity: 6, vendor: "Orange Travels", status: "AVAILABLE" },
    { vehicleNumber: "MH-31-TR-4444", capacity: 4, vendor: "Orange Travels", status: "AVAILABLE" },
  ];

  for (let i = 0; i < driverData.length; i++) {
    const driver = await prisma.driver.create({
      data: driverData[i],
    });
    await prisma.cab.create({
      data: {
        ...cabData[i],
        driverId: driver.id,
      },
    });
  }

  console.log("Created drivers & cabs.");

  // 4. Create Employees at various places in Nagpur relative to MIHAN (x=lng, y=lat)
  const employees = [
    // Manish Nagar Area (lng: ~79.0832, lat: ~21.0945)
    { employeeCode: "EMP001", name: "Alice Smith", gender: "FEMALE", phone: "+91 99000 11001", email: "alice.smith@corporate.com", address: "Manish Nagar, Nagpur", x: 79.0832, y: 21.0945, department: "Engineering", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP002", name: "Bob Jones", gender: "MALE", phone: "+91 99000 11002", email: "bob.jones@corporate.com", address: "Somi Layout, Manish Nagar", x: 79.0845, y: 21.0935, department: "Engineering", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP003", name: "Chloe Miller", gender: "FEMALE", phone: "+91 99000 11003", email: "chloe.miller@corporate.com", address: "Jayanti Mansion, Manish Nagar", x: 79.0815, y: 21.0965, department: "HR", shiftId: shiftMorning.id, status: "ACTIVE" },

    // Dharampeth / Pratap Nagar (lng: ~79.0612, lat: ~21.1432)
    { employeeCode: "EMP004", name: "Danny Green", gender: "MALE", phone: "+91 99000 11004", email: "danny.green@corporate.com", address: "Dharampeth, Nagpur", x: 79.0612, y: 21.1432, department: "Marketing", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP005", name: "Emma Watson", gender: "FEMALE", phone: "+91 99000 11005", email: "emma.watson@corporate.com", address: "Pratap Nagar, Nagpur", x: 79.0560, y: 21.1189, department: "Finance", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP006", name: "Frank Wright", gender: "MALE", phone: "+91 99000 11006", email: "frank.wright@corporate.com", address: "Dharampeth Extension", x: 79.0595, y: 21.1450, department: "Operations", shiftId: shiftMorning.id, status: "ACTIVE" },
    
    // Besa / Wardha Road (lng: ~79.1121, lat: ~21.0872)
    { employeeCode: "EMP007", name: "Grace Hopper", gender: "FEMALE", phone: "+91 99000 11007", email: "grace.hopper@corporate.com", address: "Besa, Nagpur", x: 79.1121, y: 21.0872, department: "Engineering", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP008", name: "Henry Cavill", gender: "MALE", phone: "+91 99000 11008", email: "henry.cavill@corporate.com", address: "Wardha Road, Nagpur", x: 79.0712, y: 21.0822, department: "Operations", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP009", name: "Ivy League", gender: "FEMALE", phone: "+91 99000 11009", email: "ivy.league@corporate.com", address: "Besa Circle", x: 79.1105, y: 21.0890, department: "Sales", shiftId: shiftMorning.id, status: "ACTIVE" },

    // Sitabuldi / Sadar (lng: ~79.0880, lat: ~21.1444)
    { employeeCode: "EMP010", name: "Jack Reacher", gender: "MALE", phone: "+91 99000 11010", email: "jack.reacher@corporate.com", address: "Sitabuldi, Nagpur", x: 79.0880, y: 21.1444, department: "Security", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP011", name: "Kate Beckinsale", gender: "FEMALE", phone: "+91 99000 11011", email: "kate.b@corporate.com", address: "Sadar, Nagpur", x: 79.0805, y: 21.1611, department: "Engineering", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP012", name: "Leo DiCaprio", gender: "MALE", phone: "+91 99000 11012", email: "leo.d@corporate.com", address: "Mount Road, Sadar", x: 79.0785, y: 21.1625, department: "Product", shiftId: shiftMorning.id, status: "ACTIVE" },

    // Nandanvan (lng: ~79.1220, lat: ~21.1340)
    { employeeCode: "EMP013", name: "Mila Kunis", gender: "FEMALE", phone: "+91 99000 11013", email: "mila.k@corporate.com", address: "Nandanvan, Nagpur", x: 79.1220, y: 21.1340, department: "Design", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP014", name: "Nathan Drake", gender: "MALE", phone: "+91 99000 11014", email: "nathan.d@corporate.com", address: "KDK College Rd, Nandanvan", x: 79.1235, y: 21.1330, department: "Security", shiftId: shiftMorning.id, status: "ACTIVE" },
    { employeeCode: "EMP015", name: "Olivia Wilde", gender: "FEMALE", phone: "+91 99000 11015", email: "olivia.w@corporate.com", address: "Nandanvan Colony", x: 79.1205, y: 21.1355, department: "Marketing", shiftId: shiftMorning.id, status: "ACTIVE" },
  ];

  for (const emp of employees) {
    await prisma.employee.create({
      data: emp,
    });
  }

  console.log("Created Nagpur employees.");
  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
