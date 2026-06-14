const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const queryTerms = ["vajja", "prakash", "devalla", "meghana", "pathlavat", "sudheer", "bhanu"];
  const employees = await prisma.employee.findMany();
  
  console.log(`Total employees in DB: ${employees.length}`);
  
  console.log("\nMatches in database:");
  for (const emp of employees) {
    for (const term of queryTerms) {
      if (emp.name.toLowerCase().includes(term)) {
        console.log(` - Name: "${emp.name}", Code: ${emp.employeeCode}, Email: ${emp.email}, Address: "${emp.address}"`);
        break;
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
