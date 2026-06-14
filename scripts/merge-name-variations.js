const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function mergePair(primaryName, duplicateName) {
  const primary = await prisma.employee.findFirst({ where: { name: primaryName } });
  const duplicate = await prisma.employee.findFirst({ where: { name: duplicateName } });

  if (!primary) {
    console.log(`Primary employee "${primaryName}" not found. Skipping.`);
    return;
  }
  if (!duplicate) {
    console.log(`Duplicate employee "${duplicateName}" not found. Already merged/deleted.`);
    return;
  }

  console.log(`Merging "${duplicateName}" (ID=${duplicate.id}) into "${primaryName}" (ID=${primary.id})...`);

  // 1. Reassign RouteStops
  const stops = await prisma.routeStop.findMany({ where: { employeeId: duplicate.id } });
  if (stops.length > 0) {
    console.log(`  Reassigning ${stops.length} RouteStops...`);
    await prisma.routeStop.updateMany({
      where: { employeeId: duplicate.id },
      data: { employeeId: primary.id }
    });
  }

  // 2. Reassign TimingChangeRequests
  const timings = await prisma.timingChangeRequest.findMany({ where: { employeeId: duplicate.id } });
  if (timings.length > 0) {
    console.log(`  Reassigning ${timings.length} TimingChangeRequests...`);
    await prisma.timingChangeRequest.updateMany({
      where: { employeeId: duplicate.id },
      data: { employeeId: primary.id }
    });
  }

  // 3. Reassign OperationalEvents
  const events = await prisma.operationalEvent.findMany({ where: { employeeId: duplicate.id } });
  if (events.length > 0) {
    console.log(`  Reassigning ${events.length} OperationalEvents...`);
    await prisma.operationalEvent.updateMany({
      where: { employeeId: duplicate.id },
      data: { employeeId: primary.id }
    });
  }

  // 4. Handle User account association
  if (duplicate.userId) {
    if (!primary.userId) {
      console.log(`  Transferring User ID ${duplicate.userId} to primary...`);
      await prisma.employee.update({
        where: { id: duplicate.id },
        data: { userId: null }
      });
      await prisma.employee.update({
        where: { id: primary.id },
        data: { userId: duplicate.userId }
      });
    } else {
      console.log(`  Both have User IDs. Keeping primary's User ID.`);
    }
  }

  // 5. Delete duplicate employee
  await prisma.employee.delete({ where: { id: duplicate.id } });
  console.log(`  Successfully deleted "${duplicateName}".`);
}

async function main() {
  // Pairs to merge: [Primary, Duplicate]
  const pairs = [
    ["Devalla Sudheer Kumar", "Devalla Kumar"],
    ["Prashant Pathlavat", "Prashanth Pathlavath"],
    ["Meghana B U", "Meghana U"],
    ["Vajja Bhanu Prakash", "Vajja Prakash"]
  ];

  for (const [prim, dup] of pairs) {
    await mergePair(prim, dup);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
