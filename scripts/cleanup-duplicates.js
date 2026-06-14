const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database deduplication...");
  
  const employees = await prisma.employee.findMany();
  console.log(`Loaded ${employees.length} total employees.`);

  const byName = new Map();
  for (const emp of employees) {
    const list = byName.get(emp.name.toLowerCase()) || [];
    list.push(emp);
    byName.set(emp.name.toLowerCase(), list);
  }

  let mergedCount = 0;

  for (const [name, list] of byName.entries()) {
    if (list.length <= 1) continue;

    console.log(`\nMerging duplicate records for name: "${list[0].name}"`);

    // Determine primary record: prefer one with numeric employeeCode, otherwise the first one
    const isNumeric = (code) => /^\d+$/.test(code);
    let primary = list.find(emp => isNumeric(emp.employeeCode));
    if (!primary) {
      primary = list[0];
    }

    const duplicates = list.filter(emp => emp.id !== primary.id);
    console.log(`  Primary: ID=${primary.id}, Code=${primary.employeeCode}, Email=${primary.email}`);

    for (const dup of duplicates) {
      console.log(`  Duplicate: ID=${dup.id}, Code=${dup.employeeCode}, Email=${dup.email}`);

      // 1. Reassign RouteStops
      const routeStops = await prisma.routeStop.findMany({ where: { employeeId: dup.id } });
      if (routeStops.length > 0) {
        console.log(`    Reassigning ${routeStops.length} RouteStops to primary...`);
        await prisma.routeStop.updateMany({
          where: { employeeId: dup.id },
          data: { employeeId: primary.id }
        });
      }

      // 2. Reassign TimingChangeRequests
      const timingRequests = await prisma.timingChangeRequest.findMany({ where: { employeeId: dup.id } });
      if (timingRequests.length > 0) {
        console.log(`    Reassigning ${timingRequests.length} TimingChangeRequests to primary...`);
        await prisma.timingChangeRequest.updateMany({
          where: { employeeId: dup.id },
          data: { employeeId: primary.id }
        });
      }

      // 3. Reassign OperationalEvents (if any)
      const operationalEvents = await prisma.operationalEvent.findMany({ where: { employeeId: dup.id } });
      if (operationalEvents.length > 0) {
        console.log(`    Reassigning ${operationalEvents.length} OperationalEvents to primary...`);
        await prisma.operationalEvent.updateMany({
          where: { employeeId: dup.id },
          data: { employeeId: primary.id }
        });
      }

      // 4. Handle User association
      if (dup.userId) {
        if (!primary.userId) {
          console.log(`    Transferring User ID ${dup.userId} to primary...`);
          // Temporarily set duplicate's userId to null so we don't violate unique constraint
          await prisma.employee.update({
            where: { id: dup.id },
            data: { userId: null }
          });
          await prisma.employee.update({
            where: { id: primary.id },
            data: { userId: dup.userId }
          });
        } else {
          console.log(`    Both have user accounts. Keeping primary user account.`);
        }
      }

      // 5. Delete duplicate employee record
      await prisma.employee.delete({
        where: { id: dup.id }
      });
      console.log(`    Deleted duplicate record.`);
      mergedCount++;
    }
  }

  console.log(`\nSuccessfully merged ${mergedCount} duplicate employee records.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
