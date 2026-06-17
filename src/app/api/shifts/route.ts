export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";
import { getCachedShifts, invalidateShiftsCache } from "@/lib/cache";

export async function GET() {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

  try {
    const shifts = await getCachedShifts();
    return NextResponse.json(shifts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
 const session = await verifySession();
 if (session.role !== "ADMIN") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

  try {
    const body = await req.json();
    const { name, startTime, endTime } = body;

    const newShift = await prisma.shift.create({
      data: { name, startTime, endTime },
    });
    invalidateShiftsCache();
    return NextResponse.json(newShift);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
