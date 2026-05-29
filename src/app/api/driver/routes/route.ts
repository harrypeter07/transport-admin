import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "DRIVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split("T")[0];

    const driver = await prisma.driver.findUnique({
      where: { userId: session.userId },
      include: { cab: true }
    });

    if (!driver || !driver.cab) {
      return NextResponse.json({ routes: [] });
    }

    const routes = await prisma.route.findMany({
      where: {
        cabId: driver.cab.id,
        date: today,
        status: { in: ["PLANNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"] }
      },
      include: {
        stops: {
          include: { employee: true },
          orderBy: { stopOrder: "asc" }
        }
      },
      orderBy: { startedAt: "desc" }
    });

    return NextResponse.json({ routes });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
