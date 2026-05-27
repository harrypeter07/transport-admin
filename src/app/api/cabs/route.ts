import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const cabs = await prisma.cab.findMany({
      include: {
        driver: true,
      },
    });
    return NextResponse.json(cabs);
  } catch (e) {
    console.error("Error fetching cabs:", e);
    return NextResponse.json({ error: "Failed to fetch cabs" }, { status: 500 });
  }
}
