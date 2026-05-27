import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const shifts = await prisma.shift.findMany();
    return NextResponse.json(shifts);
  } catch (e) {
    console.error("Error fetching shifts:", e);
    return NextResponse.json({ error: "Failed to fetch shifts" }, { status: 500 });
  }
}
