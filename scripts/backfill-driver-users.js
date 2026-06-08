const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const cabs = await prisma.cab.findMany({
    where: { userId: null },
  });

  console.log(`Found ${cabs.length} cabs without users.`);

  for (const cab of cabs) {
    const driverName = cab.driverName && cab.driverName !== "Unassigned" ? cab.driverName : `Driver ${cab.vehicleNumber}`;
    const sanitizedName = driverName.toLowerCase().replace(/[^a-z0-9]/g, "");
    let email = `${sanitizedName}@transitadmin.com`;
    
    let existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        email = `${sanitizedName}_${cab.vehicleNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@transitadmin.com`;
    }

    const defaultPassword = await bcrypt.hash("Welcome@123", 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: defaultPassword,
        name: driverName,
        role: "DRIVER",
        requiresPasswordChange: true,
      },
    });

    await prisma.cab.update({
      where: { id: cab.id },
      data: { userId: user.id },
    });

    console.log(`Created user ${email} for cab ${cab.vehicleNumber}`);
  }

  console.log("Done.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
