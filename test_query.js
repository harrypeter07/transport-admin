const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const search = "";
  const role = "";

  const users = await prisma.user.findMany({
    where: {
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(role && { role }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      requiresPasswordChange: true,
    },
    orderBy: { name: "asc" },
  });

  console.log(`API Query returned ${users.length} records.`);
  if (users.length > 0) {
    console.log("First 5 records:");
    console.log(JSON.stringify(users.slice(0, 5), null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
