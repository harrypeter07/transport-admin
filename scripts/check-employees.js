const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany();
  console.log(`Total employees: ${employees.length}`);
  
  const byName = new Map();
  for (const emp of employees) {
    const list = byName.get(emp.name) || [];
    list.push(emp);
    byName.set(emp.name, list);
  }

  console.log("\n--- Duplicate Names ---");
  let duplicatesCount = 0;
  for (const [name, list] of byName.entries()) {
    if (list.length > 1) {
      duplicatesCount++;
      console.log(`\nName: "${name}" (${list.length} entries):`);
      for (const emp of list) {
        console.log(`  - ID: ${emp.id}, Code: ${emp.employeeCode}, Email: ${emp.email}, Address: "${emp.address}", ShiftId: ${emp.shiftId}`);
      }
    }
  }
  console.log(`\nFound ${duplicatesCount} names with multiple database records.`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
