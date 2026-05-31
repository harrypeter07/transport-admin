import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function parseDriverDetails(detailsList: any[]) {
  let vehicleNumber = ''; let driverName = ''; let driverPhone = '';
  for (const item of detailsList) {
    if (!item) continue;
    const val = String(item).trim();
    if (val.match(/MH\s?\d{2}\s?[A-Z]{1,2}\s?\d{4}/i)) vehicleNumber = val.toUpperCase().replace(/\s+/g, '');
    else if (val.toLowerCase().includes('driver') || val.toLowerCase().includes('drver')) driverName = val.replace(/(driver|drver)[:=\s-]+/gi, '').trim();
    else if (val.toLowerCase().includes('mob') || val.toLowerCase().includes('phone') || val.match(/^\+?\d[\d\s-]{8,12}$/)) driverPhone = val.replace(/(mob|phone)[:=\s-]+/gi, '').trim();
    else if (!vehicleNumber && val.length > 5 && val.startsWith('MH')) vehicleNumber = val.toUpperCase().replace(/\s+/g, '');
    else if (!driverName && val.length > 2 && isNaN(val as any)) driverName = val;
    else if (!driverPhone && val.match(/\d{9,11}/)) driverPhone = val;
  }
  return { vehicleNumber, driverName, driverPhone };
}

function formatExcelTime(val: any) {
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    return displayHours + ':' + displayMinutes + ' ' + ampm;
  }
  return String(val || '').trim();
}

async function main() {
  const filePath = path.join(process.cwd(), 'roster.xlsx');
  const buffer = fs.readFileSync(filePath);
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const defaultPassword = await bcrypt.hash('Welcome@123', 10);
  
  const routeBlocks: any = {};
  const uniqueEmployeeCodes = new Set();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    let currentRouteNo: string | null = null;
    rows.forEach(row => {
      if (!row || row.length === 0) return;
      if (row[0] === 'Rout No' || row[0] === 'Route No') return;
      const routeNo = String(row[0] || '').trim();
      if (routeNo) currentRouteNo = routeNo;
      if (!currentRouteNo) return;
      const empCode = String(row[3] || '').trim();
      const rowKey = currentRouteNo + '_' + empCode;
      if (!uniqueEmployeeCodes.has(rowKey)) {
        uniqueEmployeeCodes.add(rowKey);
        if (!routeBlocks[currentRouteNo]) routeBlocks[currentRouteNo] = [];
        routeBlocks[currentRouteNo].push(row);
      }
    });
  }

  let importedEmployeesCount = 0;
  let importedCabsCount = 0;

  for (const [routeNo, rRows] of Object.entries<any[][]>(routeBlocks)) {
    const driverDetailsColumn = rRows.map((r) => r[12]).filter(Boolean);
    const { vehicleNumber, driverName, driverPhone } = parseDriverDetails(driverDetailsColumn);
    const finalVehicleNumber = vehicleNumber || 'CAB-' + routeNo;
    const finalDriverName = driverName || 'Driver ' + routeNo;
    const finalDriverPhone = driverPhone || '+91 99000 00000';

    let existingCab = await prisma.cab.findUnique({ where: { vehicleNumber: finalVehicleNumber } });
    if (!existingCab) {
      const capacity = Math.max(6, rRows.filter((r) => r[3] && String(r[3]).toLowerCase() !== 'escort').length);
      existingCab = await prisma.cab.create({
        data: {
          vehicleNumber: finalVehicleNumber,
          capacity: capacity,
          vendor: String(rRows[0]?.[1] || 'FT').trim(),
          status: 'AVAILABLE',
          driverName: finalDriverName,
          driverPhone: finalDriverPhone,
          licenseNumber: 'DL-AUTO-' + Math.floor(1000 + Math.random() * 9000),
        },
      });
      importedCabsCount++;
    }

    const firstEmpRow = rRows.find((r) => r[3] && String(r[3]).toLowerCase() !== 'escort');
    const excelShiftTime = firstEmpRow ? firstEmpRow[8] : null;
    const formattedShiftTime = formatExcelTime(excelShiftTime) || '09:00 AM';

    const cleanTime = formattedShiftTime.replace(/\s*[AP]M/gi, '').trim();
    let shift = await prisma.shift.findFirst({ where: { startTime: cleanTime } });
    if (!shift) {
      const isPM = formattedShiftTime.toLowerCase().includes('pm');
      let hours = parseInt(cleanTime.split(':')[0]);
      const mins = cleanTime.split(':')[1] || '00';
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      const endHours = (hours + 9) % 24;
      shift = await prisma.shift.create({
        data: {
          name: 'Shift ' + formattedShiftTime,
          startTime: String(hours).padStart(2, '0') + ':' + mins,
          endTime: String(endHours).padStart(2, '0') + ':' + mins,
        },
      });
    }

    for (const r of rRows) {
      const empCode = String(r[3] || '').trim();
      const empName = String(r[4] || '').trim();
      if (!empCode || !empName) continue;
      if (empCode.toLowerCase() === 'escort' || empName.toLowerCase() === 'escort') continue;

      const phone = String(r[5] || '').trim() || '+91 99000 00000';
      const email = String(r[6] || '').trim();
      const address = String(r[7] || '').trim() || 'Nagpur';
      const phoneDigits = phone.replace(/\D/g, '').slice(-4) || '0000';
      const finalEmpCode = (empCode === 'NA' || empCode === '#######' || empCode === '') 
        ? 'EMP-' + empName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '-' + phoneDigits
        : empCode;
      
      const finalEmail = email && email.includes('@') ? email : finalEmpCode.toLowerCase().replace(/[^a-z0-9]/g, '') + '.' + phoneDigits + '@corporate.com';
      const employeeStatus = String(r[11] || 'YES').trim().toUpperCase() === 'YES' ? 'ACTIVE' : 'INACTIVE';
      const gender = String(r[13] || 'M').trim().toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE';

      let user = await prisma.user.findUnique({ where: { email: finalEmail } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: finalEmail,
            password: defaultPassword,
            name: empName,
            role: (empCode.includes('MGR') || String(r[10] || '').toLowerCase().includes('manager')) ? 'MANAGER' : 'EMPLOYEE',
            requiresPasswordChange: true,
          },
        });
      }

      let employee = await prisma.employee.findFirst({
        where: { OR: [{ employeeCode: finalEmpCode }, { email: finalEmail }] }
      });

      if (!employee) {
        const xVal = Math.round((79.00 + Math.random() * 0.20) * 10000) / 10000;
        const yVal = Math.round((21.04 + Math.random() * 0.18) * 10000) / 10000;
        
        await prisma.employee.create({
          data: {
            employeeCode: finalEmpCode,
            name: empName,
            gender: gender as any,
            phone: phone,
            email: finalEmail,
            address: address,
            x: xVal,
            y: yVal,
            department: 'Operations',
            shiftId: shift.id,
            status: employeeStatus,
            userId: user.id,
          },
        });
        importedEmployeesCount++;
      }
    }
  }

  // CREATE DUMMY ACCOUNTS
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

  console.log('Imported ' + importedEmployeesCount + ' employees and ' + importedCabsCount + ' cabs from roster.');
  console.log('Created completely dummy test accounts!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
