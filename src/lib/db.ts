import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  const dbName = "dev.db";
  const sourcePath = path.join(process.cwd(), "prisma", dbName);
  const targetPath = path.join("/tmp", dbName);

  if (!fs.existsSync(targetPath)) {
    try {
      console.log(`Copying database from ${sourcePath} to ${targetPath}...`);
      // Ensure target directory exists
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      console.log("Database copied successfully!");
    } catch (e) {
      console.error("Failed to copy database:", e);
    }
  }

  process.env.DATABASE_URL = `file:${targetPath}`;
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${targetPath}`,
      },
    },
  });
} else {
  // Local development
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient();
  }
  prisma = (global as any).prisma;
}

export { prisma };
