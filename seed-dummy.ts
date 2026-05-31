import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const defaultPassword = await bcrypt.hash('Welcome@123', 10);
  
  const dummyShift = await prisma.shift.findFirst() || await prisma.shift.create({
    data: { name: 'Dummy Shift', startTime: '09:00', endTime: '18:00' }
  });

  const mUser = await prisma.user.upsert({
    where: { email: 'manager_test@transitadmin.com' },
    update: { password: defaultPassword, requiresPasswordChange: false },
    create: { email: 'manager_test@transitadmin.com', name: 'Test Manager', password: defaultPassword, role: 'MANAGER', requiresPasswordChange: false }
  });
  const mEmp = await prisma.employee.upsert({
    where: { email: 'manager_test@transitadmin.com' },
    update: {},
    create: { employeeCode: 'TEST-MGR-01', name: 'Test Manager', gender: 'MALE', phone: '+91 9999999991', email: 'manager_test@transitadmin.com', address: 'Nagpur', x: 79.088, y: 21.145, department: 'Test', shiftId: dummyShift.id, status: 'ACTIVE', userId: mUser.id }
  });

  const eUser = await prisma.user.upsert({
    where: { email: 'employee_test@transitadmin.com' },
    update: { password: defaultPassword, requiresPasswordChange: false },
    create: { email: 'employee_test@transitadmin.com', name: 'Test Employee', password: defaultPassword, role: 'EMPLOYEE', requiresPasswordChange: false }
  });
  await prisma.employee.upsert({
    where: { email: 'employee_test@transitadmin.com' },
    update: {},
    create: { employeeCode: 'TEST-EMP-01', name: 'Test Employee', gender: 'FEMALE', phone: '+91 9999999992', email: 'employee_test@transitadmin.com', address: 'Nagpur', x: 79.089, y: 21.146, department: 'Test', shiftId: dummyShift.id, managerId: mEmp.id, status: 'ACTIVE', userId: eUser.id }
  });

  const dUser = await prisma.user.upsert({
    where: { email: 'driver_test@transitadmin.com' },
    update: { password: defaultPassword, requiresPasswordChange: false },
    create: { email: 'driver_test@transitadmin.com', name: 'Test Driver', password: defaultPassword, role: 'DRIVER', requiresPasswordChange: false }
  });
  await prisma.cab.upsert({
    where: { vehicleNumber: 'TEST CAB 01' },
    update: {},
    create: { vehicleNumber: 'TEST CAB 01', capacity: 6, vendor: 'Test Transport', status: 'AVAILABLE', driverName: 'Test Driver', driverPhone: '+91 9999999993', licenseNumber: 'DL-TEST-01', shiftId: dummyShift.id }
  });

  console.log('Created completely dummy test accounts!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
