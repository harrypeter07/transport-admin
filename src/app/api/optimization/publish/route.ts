import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const auth = await requireApiRole(["ADMIN", "MANAGER"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { date, shiftId } = body;

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    // Find all PENDING or PLANNED routes for the given date and shift
    const routesToUpdate = await prisma.route.findMany({
      where: {
        date,
        ...(shiftId ? { shiftId } : {}),
        status: { in: ["PENDING", "PLANNED"] }
      },
      select: { id: true }
    });

    const routeIds = routesToUpdate.map(r => r.id);

    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, message: "No pending routes found to publish." });
    }

    // Update Routes to ASSIGNED
    await prisma.route.updateMany({
      where: { id: { in: routeIds } },
      data: { status: "ASSIGNED" }
    });

    return NextResponse.json({ success: true, count: routeIds.length });
  } catch (error: any) {
    console.error("Failed to publish routes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
