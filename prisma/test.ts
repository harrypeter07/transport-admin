import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const date = new Date().toISOString().split("T")[0];
  const routes = await prisma.route.findMany({
    where: { date }
  });
  console.log("Current routes:", routes.length);
}
check();
