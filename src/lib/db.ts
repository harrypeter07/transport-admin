import { PrismaClient } from "@prisma/client";

const globalForPrisma2 = global as unknown as { prisma2: PrismaClient };

export const prisma =
  globalForPrisma2.prisma2 || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma2.prisma2 = prisma;

export default prisma;
