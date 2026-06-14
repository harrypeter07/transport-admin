import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { assignZone } from "../src/lib/zones";

const prisma = new PrismaClient();

const MIHAN_COORDS = { lat: 21.0458, lng: 79.0322 };

const LOCATIONS = [
  { name: "Pratap Nagar", lat: 21.1215, lng: 79.0526 },
  { name: "Manish Nagar", lat: 21.1042, lng: 79.0583 },
  { name: "Besa", lat: 21.0825, lng: 79.0712 },
  { name: "Narendra Nagar", lat: 21.1075, lng: 79.0683 },
  { name: "Trimurti Nagar", lat: 21.1170, lng: 79.0435 },
  { name: "Wardha Road", lat: 21.0850, lng: 79.0485 },
  { name: "Hudkeshwar", lat: 21.0965, lng: 79.1178 },
  { name: "Nandanvan", lat: 21.1265, lng: 79.1118 },
  { name: "Omkar Nagar", lat: 21.0990, lng: 79.0833 },
  { name: "Sonegaon", lat: 21.1050, lng: 79.0380 },
  { name: "Jaitala", lat: 21.1055, lng: 79.0135 },
  { name: "Mahalgaon", lat: 21.1710, lng: 79.1415 },
];

async function main() {
  console.log("Cleaning database for UAT seed...");

  await prisma.routeDeviation.deleteMany();
  await prisma.vehicleLocation.deleteMany();
  await prisma.operationalEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationSettings.deleteMany();
  await prisma.violation.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.timingChangeRequest.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.pickupPoint.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.cab.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.systemSettings.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash("Welcome@123", 10);

  // 1. Create Admin
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@transitadmin.com",
      password: hashedPassword,
      name: "System Administrator",
      role: "ADMIN",
      isActive: true,
      requiresPasswordChange: false,
    },
  });

  // 2. Create Manager
  const managerUser = await prisma.user.create({
    data: {
      email: "rohit.deshmukh@transitadmin.com",
      password: hashedPassword,
      name: "Rohit Deshmukh",
      role: "MANAGER",
      isActive: true,
      requiresPasswordChange: false,
    },
  });

  // 3. Create Shift
  const shift = await prisma.shift.create({
    data: {
      name: "Morning Shift",
      startTime: "09:00",
      endTime: "18:00",
    },
  });

  const pickupPointSeeds = [
    { name: "Majestic Manor Gate", x: 79.09, y: 21.14, zone: "N", subZone: "NE" },
    { name: "Apollo Pharmacy Wardha", x: 79.12, y: 21.08, zone: "E", subZone: "NE" },
    { name: "Gittikhadan Bus Stop", x: 79.02, y: 21.15, zone: "N", subZone: "NW" },
    { name: "Kalamna Market", x: 78.95, y: 21.08, zone: "W", subZone: "NW" },
    { name: "Hingna T-Point", x: 78.99, y: 21.02, zone: "S", subZone: "SW" },
    { name: "Besa Main Square", x: 79.13, y: 21.10, zone: "E", subZone: "NE" },
    { name: "Manish Nagar Square", x: 79.08, y: 21.16, zone: "N", subZone: "NE" },
    { name: "Koradi Naka", x: 78.92, y: 21.09, zone: "W", subZone: "NW" },
    { name: "Wadi Railway Gate", x: 79.10, y: 21.05, zone: "E", subZone: "SE" },
    { name: "Amravati Road Naka", x: 78.89, y: 21.05, zone: "W", subZone: "SW" },
  ];

  for (const pp of pickupPointSeeds) {
    const zoneData = assignZone(pp.x, pp.y);
    const existing = await prisma.pickupPoint.findFirst({ where: { name: pp.name } });
    if (!existing) {
      await prisma.pickupPoint.create({
        data: {
          name: pp.name,
          x: pp.x,
          y: pp.y,
          zone: pp.zone,
          subZone: pp.subZone,
          distanceRing: zoneData.distanceRing,
          address: `${pp.name}, Nagpur`,
        },
      });
    }
  }

  // 4. Create Manager Employee Record
  const managerZone = assignZone(79.0583, 21.1042);
  const managerEmployee = await prisma.employee.create({
    data: {
      userId: managerUser.id,
      employeeCode: "EMP-MGR-01",
      name: "Rohit Deshmukh",
      email: "rohit.deshmukh@transitadmin.com",
      gender: "MALE",
      phone: "9876543210",
      address: "Manish Nagar",
      x: 79.0583,
      y: 21.1042,
      zone: managerZone.zone,
      subZone: managerZone.subZone,
      distanceRing: managerZone.distanceRing,
      distanceFromDepotKm: managerZone.distanceFromDepotKm,
      department: "Operations",
      designation: "Senior Manager",
      status: "ACTIVE",
      shiftId: shift.id,
    },
  });

  // 5. Create 11 more employees to make exactly 12 total including manager
  const employeeData = [
    { name: "Amit Kale", email: "amit.kale@transitadmin.com", desig: "Engineer", loc: "Besa" },
    { name: "Sneha Patil", email: "sneha.patil@transitadmin.com", desig: "Lead", loc: "Pratap Nagar" },
    { name: "Kiran Sharma", email: "kiran.sharma@transitadmin.com", desig: "Lead", loc: "Narendra Nagar" },
    { name: "Ravi Verma", email: "ravi.verma@transitadmin.com", desig: "Senior Engineer", loc: "Trimurti Nagar" },
    { name: "Pooja Jadhav", email: "pooja.jadhav@transitadmin.com", desig: "Senior Engineer", loc: "Wardha Road" },
    { name: "Vikram Singh", email: "vikram.singh@transitadmin.com", desig: "Senior Engineer", loc: "Hudkeshwar" },
    { name: "Neha Gupta", email: "neha.gupta@transitadmin.com", desig: "Senior Engineer", loc: "Nandanvan" },
    { name: "Arjun Reddy", email: "arjun.reddy@transitadmin.com", desig: "Engineer", loc: "Omkar Nagar" },
    { name: "Divya Deshmukh", email: "divya.deshmukh@transitadmin.com", desig: "Engineer", loc: "Sonegaon" },
    { name: "Sanjay Kumar", email: "sanjay.kumar@transitadmin.com", desig: "Engineer", loc: "Jaitala" },
    { name: "Riya Kulkarni", email: "riya.kulkarni@transitadmin.com", desig: "Engineer", loc: "Mahalgaon" },
  ];

  const employees = [managerEmployee];

  for (let i = 0; i < employeeData.length; i++) {
    const data = employeeData[i];
    const locCoords = LOCATIONS.find(l => l.name === data.loc) || LOCATIONS[0];
    const zoneData = assignZone(locCoords.lng, locCoords.lat);
    
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: "EMPLOYEE",
        isActive: true,
        requiresPasswordChange: false,
      },
    });

    const emp = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: `EMP-UAT-${i + 2}`,
        name: data.name,
        email: data.email,
        gender: i % 3 === 0 ? "FEMALE" : "MALE", // Mix of genders
        phone: `98765432${11 + i}`,
        address: data.loc,
        x: locCoords.lng,
        y: locCoords.lat,
        zone: zoneData.zone,
        subZone: zoneData.subZone,
        distanceRing: zoneData.distanceRing,
        distanceFromDepotKm: zoneData.distanceFromDepotKm,
        department: "Engineering",
        designation: data.desig,
        status: "ACTIVE",
        shiftId: shift.id,
        managerId: managerEmployee.id,
      },
    });
    employees.push(emp);
  }

  // 6. Create Drivers and Cabs
  const driverData = [
    { name: "Suresh Wankhede", cabNo: "CAB-01", cap: 6, email: "suresh@transitadmin.com" },
    { name: "Mahesh Borkar", cabNo: "CAB-02", cap: 6, email: "mahesh@transitadmin.com" },
    { name: "Vijay Sonkusare", cabNo: "CAB-03", cap: 4, email: "vijay@transitadmin.com" },
  ];

  const cabs = [];
  for (let d of driverData) {
    const user = await prisma.user.create({
      data: {
        email: d.email,
        password: hashedPassword,
        name: d.name,
        role: "DRIVER",
        isActive: true,
        requiresPasswordChange: false,
      },
    });

    const cab = await prisma.cab.create({
      data: {
        userId: user.id,
        vehicleNumber: d.cabNo,
        capacity: d.cap,
        vendor: "Nagpur Travels",
        status: "AVAILABLE",
        driverName: d.name,
        driverPhone: "9988776655",
        licenseNumber: "MH31-" + Math.floor(Math.random() * 10000),
        shifts: {
          connect: { id: shift.id },
        },
      },
    });
    cabs.push(cab);
  }

  // 7. Test Leave Scenario
  const amitUser = await prisma.user.findUnique({ where: { email: "amit.kale@transitadmin.com" } });
  
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 2);
  const dateString = futureDate.toISOString().split('T')[0];

  if (amitUser) {
    await prisma.leaveRequest.create({
      data: {
        applicantId: amitUser.id,
        startDate: dateString,
        endDate: dateString,
        status: "APPROVED",
        approverId: managerUser.id,
        comments: "Approved for UAT Testing",
      },
    });
  }

  // 8. Route Execution Test Data & ROI Test Data
  const amitEmp = employees.find(e => e.email === "amit.kale@transitadmin.com");
  const otherEmps = employees.filter(e => e.email !== "amit.kale@transitadmin.com" && e.id !== managerEmployee.id).slice(0, 3);
  const routePassengers = [amitEmp, ...otherEmps].filter(Boolean);

  const routeDate = new Date().toISOString().split('T')[0];
  const sureshCab = cabs[0]; // Suresh Wankhede

  const testRoute = await prisma.route.create({
    data: {
      cabId: sureshCab.id,
      date: routeDate,
      shiftId: shift.id,
      isPickup: true,
      totalDistance: 31.2, // Optimized ROI distance
      totalDuration: 55,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      optimizationScore: 88,
      optimizationMode: "FASTEST_TRAVEL",
    },
  });

  // Create stops for the route
  for (let i = 0; i < routePassengers.length; i++) {
    const p = routePassengers[i]!;
    await prisma.routeStop.create({
      data: {
        routeId: testRoute.id,
        employeeId: p.id,
        stopOrder: i + 1,
        etaMinutes: (i + 1) * 10,
        status: i === 0 ? "BOARDED" : "PENDING",
        boardedTime: i === 0 ? new Date() : null,
      },
    });
  }

  // Final summary
  const totalUsers = await prisma.user.count();
  const totalEmployees = await prisma.employee.count();
  const totalCabs = await prisma.cab.count();

  console.log("====================================================");
  console.log("UAT SEED COMPLETE");
  console.log("====================================================");
  console.log(`Users generated: ${totalUsers} (Expected 17)`);
  console.log(`Admin: 1`);
  console.log(`Manager: 1`);
  console.log(`Drivers: ${totalCabs}`);
  console.log(`Employees: ${totalEmployees}`);
  console.log(`Routes Active: 1`);
  console.log("====================================================");
  console.log("All accounts use password: Welcome@123");
  console.log("System Ready for UAT.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
