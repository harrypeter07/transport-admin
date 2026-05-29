const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    where: { userId: null }
  });

  console.log(`Found ${employees.length} employees without User accounts. Starting backfill...`);

  const defaultPassword = await bcrypt.hash("Welcome@123", 10);
  let createdCount = 0;

  for (const emp of employees) {
    try {
      const email = emp.email || `${emp.employeeCode.toLowerCase()}@corporate.com`;
      
      const user = await prisma.user.create({
        data: {
          email,
          password: defaultPassword,
          name: emp.name,
          role: emp.designation === "Manager" || emp.designation === "Senior Manager" ? "MANAGER" : "EMPLOYEE",
          requiresPasswordChange: true,
          isActive: true
        }
      });

      await prisma.employee.update({
        where: { id: emp.id },
        data: { userId: user.id }
      });

      createdCount++;
    } catch (e) {
      console.error(`Failed to backfill user for employee ${emp.employeeCode}:`, e.message);
    }
  }

  console.log(`Backfill completed. Created ${createdCount} User accounts.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
