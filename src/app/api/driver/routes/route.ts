import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session?.userId || session.role !== "DRIVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const history = searchParams.get("history") === "true";
    const today = new Date().toISOString().split("T")[0];

    const cab = await prisma.cab.findUnique({
      where: { userId: session.userId }
    });

    if (!cab) {
      return NextResponse.json({ routes: [] });
    }

    const routes = await prisma.route.findMany({
      where: {
        cabId: cab.id,
        ...(history
          ? { OR: [
              { status: { in: ["COMPLETED", "CANCELLED"] } },
              { date: { lt: today } }
            ]}
          : { 
              date: { gte: today },
              status: { in: ["ASSIGNED", "IN_PROGRESS"] }
            }
        )
      },
      include: {
        shift: true,
        stops: {
          include: { employee: true },
          orderBy: { stopOrder: "asc" }
        }
      },
      orderBy: [
        { date: "desc" },
        { startedAt: "desc" }
      ]
    });

    return NextResponse.json({ routes });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
