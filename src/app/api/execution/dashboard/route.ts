import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    let routesQuery: any = { date: today };

    if (session.role === "MANAGER") {
      // Manager only sees routes containing their team members
      const team = await prisma.employee.findMany({
        where: { managerId: session.userId }, // Wait, managerId is Employee ID, not User ID
        // Actually, let's just get the Employee record for this manager
      });
      
      const managerEmployee = await prisma.employee.findFirst({
        where: { userId: session.userId }
      });

      if (!managerEmployee) {
         return NextResponse.json({ activeRoutes: [], delayedEmployees: [], metrics: {} });
      }

      const subordinates = await prisma.employee.findMany({
        where: { managerId: managerEmployee.id }
      });
      const subordinateIds = subordinates.map(s => s.id);

      routesQuery.stops = {
        some: { employeeId: { in: subordinateIds } }
      };
    }

    const activeRoutes = await prisma.route.findMany({
      where: {
        ...routesQuery,
        status: "IN_PROGRESS"
      },
      include: {
        cab: { include: { driver: true } },
        stops: {
          include: { employee: true },
          orderBy: { stopOrder: "asc" }
        }
      }
    });

    const delayedEmployees = await prisma.routeStop.findMany({
      where: {
        route: routesQuery,
        employeeDelayMins: { gt: 0 }
      },
      include: {
        employee: true,
        route: { include: { cab: { include: { driver: true } } } }
      }
    });

    const completedRoutes = await prisma.route.count({
      where: { ...routesQuery, status: "COMPLETED" }
    });

    // ROI Visibility - Calculate savings for today's routes
    const allRoutesToday = await prisma.route.findMany({
      where: routesQuery,
      include: { stops: { include: { employee: true } } }
    });

    // Calculate straight-line or simplistic unoptimized distance for comparison
    // Assuming DEPOT is at MIHAN (21.0543, 79.0350)
    const DEPOT = { x: 21.0543, y: 79.0350 };
    
    // Haversine formula for distance
    const getDistance = (p1: any, p2: any) => {
      const toRad = (v: number) => (v * Math.PI) / 180;
      const R = 6371; // km
      const dLat = toRad(p2.x - p1.x);
      const dLon = toRad(p2.y - p1.y);
      const lat1 = toRad(p1.x);
      const lat2 = toRad(p2.x);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    let totalOptimizedDistance = 0;
    let totalUnoptimizedDistance = 0;

    for (const r of allRoutesToday) {
      totalOptimizedDistance += r.totalDistance;
      // Unoptimized assumes 1 cab per employee (or just round trip to each employee)
      for (const s of r.stops) {
        if (s.employee.x && s.employee.y) {
          totalUnoptimizedDistance += (getDistance(DEPOT, s.employee) * 2); 
        }
      }
    }

    const metrics = {
      activeCount: activeRoutes.length,
      completedCount: completedRoutes,
      delayedEmployeesCount: delayedEmployees.length,
      totalOptimizedDistance: Math.round(totalOptimizedDistance),
      totalUnoptimizedDistance: Math.round(totalUnoptimizedDistance),
      savings: Math.round(totalUnoptimizedDistance - totalOptimizedDistance)
    };

    return NextResponse.json({ activeRoutes, delayedEmployees, metrics });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
