const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employeeCount = await prisma.employee.count();
  const userCount = await prisma.user.count();
  const roleEmployeeCount = await prisma.user.count({ where: { role: 'EMPLOYEE' } });
  const roleManagerCount = await prisma.user.count({ where: { role: 'MANAGER' } });
  const roleAdminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  const roleDriverCount = await prisma.user.count({ where: { role: 'DRIVER' } });
  const employeesWithUserId = await prisma.employee.count({ where: { userId: { not: null } } });
  
  const employeesWithoutUser = await prisma.employee.findMany({
    where: { userId: null },
    take: 3,
  });

  const someUsers = await prisma.user.findMany({
    take: 5
  });

  console.log("=== DIAGNOSTIC REPORT ===");
  console.log(`1. Total Employees: ${employeeCount}`);
  console.log(`2. Total Users: ${userCount}`);
  console.log(`3. Users with role EMPLOYEE: ${roleEmployeeCount}`);
  console.log(`-  Users with role MANAGER: ${roleManagerCount}`);
  console.log(`-  Users with role ADMIN: ${roleAdminCount}`);
  console.log(`-  Users with role DRIVER: ${roleDriverCount}`);
  console.log(`4. Employees with a linked userId: ${employeesWithUserId}`);
  
  console.log("\nSample Employees without userId (if any):");
  console.log(JSON.stringify(employeesWithoutUser, null, 2));

  console.log("\nSample Users in DB:");
  console.log(JSON.stringify(someUsers, null, 2));

}

main().catch(console.error).finally(() => prisma.$disconnect());
