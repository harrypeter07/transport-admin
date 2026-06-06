import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getDistance, makeDepot } from "@/lib/optimization";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
    const session = await verifySession();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const today = new Date().toISOString().split("T")[0];
    let routesFilter: any = { date: today };

    // Manager-specific state
    let teamSize = 0;
    let employeesOnLeaveToday = 0;
    let pendingApprovalsCount = 0;
    let teamLeavesList: string[] = [];

    // Admin-specific state
    let totalEmployeesCount = 0;
    let totalManagersCount = 0;
    let totalLeavesTodayCount = 0;
    let totalAbsencesCount = 0;
    let totalPendingRequestsCount = 0;
    let totalEmployeesTravelling = 0;
    let totalDriversActive = 0;
    let totalCabsActive = 0;
    let delayedRoutesCount = 0;
    let delayedDriversCount = 0;
    let delayedEmployeesCount = 0;

    if (session.role === "MANAGER") {
      const managerEmployee = await prisma.employee.findFirst({
        where: { userId: session.userId }
      });

      if (!managerEmployee) {
        return NextResponse.json({ activeRoutes: [], delayedEmployees: [], metrics: {} });
      }

      const subordinates = await prisma.employee.findMany({
        where: { managerId: managerEmployee.id, status: "ACTIVE" }
      });
      const subordinateIds = subordinates.map(s => s.id);
      const subordinateUserIds = subordinates.filter(s => s.userId).map(s => s.userId as string);

      teamSize = subordinates.length;

      routesFilter.stops = {
        some: { employeeId: { in: subordinateIds } }
      };

      const approvedLeavesToday = await prisma.leaveRequest.findMany({
        where: {
          applicantId: { in: subordinateUserIds },
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today }
        },
        include: { applicant: true }
      });
      employeesOnLeaveToday = approvedLeavesToday.length;
      teamLeavesList = approvedLeavesToday.map(l => l.applicant?.name || "Unknown");

      const pendingLeaves = await prisma.leaveRequest.count({
        where: { applicantId: { in: subordinateUserIds }, status: "PENDING" }
      });
      const pendingTimings = await prisma.timingChangeRequest.count({
        where: { employeeId: { in: subordinateIds }, status: "PENDING" }
      });
      pendingApprovalsCount = pendingLeaves + pendingTimings;
    } else if (session.role === "ADMIN") {
      totalEmployeesCount = await prisma.employee.count({ where: { status: "ACTIVE" } });
      totalManagersCount = await prisma.user.count({ where: { role: "MANAGER", isActive: true } });

      totalLeavesTodayCount = await prisma.leaveRequest.count({
        where: {
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today }
        }
      });

      // Absences: active employees not assigned to today's routes and not on leave
      const assignedStopsToday = await prisma.routeStop.findMany({
        where: { route: { date: today } },
        select: { employeeId: true }
      });
      const assignedEmployeeIds = new Set(assignedStopsToday.map(s => s.employeeId));

      const activeEmployees = await prisma.employee.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, userId: true }
      });

      const usersOnLeaveToday = await prisma.leaveRequest.findMany({
        where: {
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today }
        },
        select: { applicantId: true }
      });
      const leaveUserIds = new Set(usersOnLeaveToday.map(l => l.applicantId));

      totalAbsencesCount = await prisma.routeStop.count({
        where: {
          route: { date: today },
          status: "SKIPPED"
        }
      });

      const pendingLeaves = await prisma.leaveRequest.count({ where: { status: "PENDING" } });
      const pendingTimings = await prisma.timingChangeRequest.count({ where: { status: "PENDING" } });
      totalPendingRequestsCount = pendingLeaves + pendingTimings;
    }

    // ── Single consolidated query for all routes today ──────────────────
    const allRoutesToday = await prisma.route.findMany({
      where: routesFilter,
      include: {
        cab: true,
        stops: {
          include: { employee: true },
          orderBy: { stopOrder: "asc" }
        }
      }
    });

    const activeRoutes = allRoutesToday.filter(r => r.status === "IN_PROGRESS");
    const completedCount = allRoutesToday.filter(r => r.status === "COMPLETED").length;

    // ── Delayed stops ──────────────────────────────────────────────────
    const delayedEmployees = await prisma.routeStop.findMany({
      where: {
        route: routesFilter,
        OR: [
          { employeeDelayMins: { gt: 0 } },
          { driverDelayMins: { gt: 0 } }
        ]
      },
      include: {
        employee: true,
        route: { include: { cab: true } }
      }
    });

    // ── Compute stats from allRoutesToday ──────────────────────────────
    const activeUniqueCabs = new Set<string>();
    const activeUniqueDrivers = new Set<string>();

    for (const r of allRoutesToday) {
      if (r.status === "IN_PROGRESS") {
        activeUniqueCabs.add(r.cabId);
        if (r.cab?.driverName) activeUniqueDrivers.add(r.cab.driverName);
        totalEmployeesTravelling += r.stops.length;
      }

      if (r.stops.some(s => s.driverDelayMins > 0 || s.employeeDelayMins > 0)) {
        delayedRoutesCount++;
      }
    }

    totalCabsActive = activeUniqueCabs.size;
    totalDriversActive = activeUniqueDrivers.size;
    delayedEmployeesCount = delayedEmployees.filter(s => s.employeeDelayMins > 0).length;
    delayedDriversCount = delayedEmployees.filter(s => s.driverDelayMins > 0).length;

    // ── ROI savings ────────────────────────────────────────────────────
    const settings = await prisma.systemSettings.findFirst({
      where: { id: "default" }
    }) || { defaultDepotLat: 21.0625, defaultDepotLng: 79.0526 };

    const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);
    let totalOptimizedDistance = 0;
    let totalUnoptimizedDistance = 0;

    // Batch-fetch all employee coordinates for naive distance calculation
    const allStopEmployeeIds = Array.from(
      new Set(allRoutesToday.flatMap(r => r.stops.map(s => s.employeeId)))
    );
    const employeeCoordMap = new Map<string, { x: number; y: number }>();

    if (allStopEmployeeIds.length > 0) {
      const employees = await prisma.employee.findMany({
        where: { id: { in: allStopEmployeeIds } },
        select: { id: true, x: true, y: true }
      });
      for (const emp of employees) {
        if (emp.x && emp.y) {
          employeeCoordMap.set(emp.id, { x: emp.x, y: emp.y });
        }
      }
    }

    for (const r of allRoutesToday) {
      totalOptimizedDistance += r.totalDistance;
      for (const s of r.stops) {
        const coord = employeeCoordMap.get(s.employeeId);
        if (coord) {
          totalUnoptimizedDistance += getDistance(depot, coord) * 2;
        }
      }
    }

    const metrics = {
      activeCount: activeRoutes.length,
      completedCount,
      totalDelayedCount: delayedEmployees.length,
      totalOptimizedDistance: Math.round(totalOptimizedDistance),
      totalUnoptimizedDistance: Math.round(totalUnoptimizedDistance),
      savings: Math.round(totalUnoptimizedDistance - totalOptimizedDistance),

      teamSize,
      employeesOnLeaveToday,
      pendingApprovalsCount,
      teamLeavesList,

      totalEmployeesCount,
      totalManagersCount,
      totalLeavesTodayCount,
      totalAbsencesCount,
      totalPendingRequestsCount,
      totalEmployeesTravelling,
      totalDriversActive,
      totalCabsActive,
      delayedRoutesCount,
      delayedDriversCount,
      delayedEmployeesCount
    };

    return NextResponse.json({ activeRoutes, delayedEmployees, metrics });

  } catch (error: any) {
    console.error("[api] ❌ GET /api/execution/dashboard", { ip }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
