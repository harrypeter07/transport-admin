export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cab = await prisma.cab.findUnique({
      where: { userId: session.userId },
      include: { documents: true },
    });

    if (!cab) {
      return NextResponse.json({ error: "Driver profile not found" }, { status: 404 });
    }

    return NextResponse.json(cab);
  } catch (error) {
    console.error("[api] ❌ GET /api/driver/profile", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
