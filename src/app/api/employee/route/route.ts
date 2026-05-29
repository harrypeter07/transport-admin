import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "EMPLOYEE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split("T")[0];

    const employee = await prisma.employee.findUnique({
      where: { userId: session.userId }
    });

    if (!employee) {
      return NextResponse.json({ route: null });
    }

    const routeStop = await prisma.routeStop.findFirst({
      where: {
        employeeId: employee.id,
        route: {
          date: today,
          status: { in: ["PLANNED", "ASSIGNED", "IN_PROGRESS"] }
        }
      },
      include: {
        route: {
          include: {
            cab: { include: { driver: true } },
            stops: {
              include: { employee: true },
              orderBy: { stopOrder: "asc" }
            }
          }
        }
      }
    });

    return NextResponse.json({ route: routeStop?.route || null, myStop: routeStop || null });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
