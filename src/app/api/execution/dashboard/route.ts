export const dynamic = "force-dynamic";
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
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const today = dateParam || "2026-06-16";
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

    let allRoutesToday: any[] = [];
    let delayedEmployees: any[] = [];
    let settings: any = null;

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

      const [
        leavesData,
        pendingTimings,
        routesTodayData,
        settingsData
      ] = await Promise.all([
        prisma.leaveRequest.findMany({
          where: {
            applicantId: { in: subordinateUserIds },
            OR: [
              { status: "PENDING" },
              {
                status: "APPROVED",
                startDate: { lte: today },
                endDate: { gte: today }
              }
            ]
          },
          include: { applicant: true }
        }),
        prisma.timingChangeRequest.count({
          where: { employeeId: { in: subordinateIds }, status: "PENDING" }
        }),
        prisma.route.findMany({
          where: routesFilter,
          include: {
            cab: true,
            stops: {
              include: { employee: true },
              orderBy: { stopOrder: "asc" }
            }
          }
        }),
        prisma.systemSettings.findFirst({
          where: { id: "default" }
        })
      ]);

      const approvedLeavesToday = leavesData.filter(l => l.status === "APPROVED");
      const pendingLeaves = leavesData.filter(l => l.status === "PENDING").length;

      allRoutesToday = routesTodayData;
      settings = settingsData;

      employeesOnLeaveToday = approvedLeavesToday.length;
      teamLeavesList = approvedLeavesToday.map(l => l.applicant?.name || "Unknown");
      pendingApprovalsCount = pendingLeaves + pendingTimings;

      // Construct delayedEmployees in memory
      delayedEmployees = [];
      for (const r of allRoutesToday) {
        for (const s of r.stops) {
          if (s.employeeDelayMins > 0 || s.driverDelayMins > 0) {
            delayedEmployees.push({
              ...s,
              route: {
                id: r.id,
                cabId: r.cabId,
                date: r.date,
                shiftId: r.shiftId,
                isPickup: r.isPickup,
                totalDistance: r.totalDistance,
                totalDuration: r.totalDuration,
                status: r.status,
                tripSequence: r.tripSequence,
                routeNumber: r.routeNumber,
                startedAt: r.startedAt,
                completedAt: r.completedAt,
                currentLat: r.currentLat,
                currentLng: r.currentLng,
                lastLocationAt: r.lastLocationAt,
                optimizationScore: r.optimizationScore,
                optimizationMode: r.optimizationMode,
                zone: r.zone,
                subZone: r.subZone,
                updatedAt: r.updatedAt,
                hasEscort: r.hasEscort,
                cab: r.cab
              }
            });
          }
        }
      }
    } else if (session.role === "ADMIN") {
      const countsPromise = prisma.$queryRaw<Array<{ empCount: number; mgrCount: number; leavesTodayCount: number; pendingLeaves: number; pendingTimings: number }>>`
        SELECT
          (SELECT COUNT(*)::int FROM "Employee" WHERE "status" = 'ACTIVE') as "empCount",
          (SELECT COUNT(*)::int FROM "Employee" WHERE "status" = 'ACTIVE' AND "designation" IN ('Manager', 'Senior Manager')) as "mgrCount",
          (SELECT COUNT(*)::int FROM "LeaveRequest" WHERE "status" = 'APPROVED' AND "startDate" <= ${today} AND "endDate" >= ${today}) as "leavesTodayCount",
          (SELECT COUNT(*)::int FROM "LeaveRequest" WHERE "status" = 'PENDING') as "pendingLeaves",
          (SELECT COUNT(*)::int FROM "TimingChangeRequest" WHERE "status" = 'PENDING') as "pendingTimings"
      `;

      const [countsResult, routesTodayData, settingsData] = await Promise.all([
        countsPromise,
        prisma.route.findMany({
          where: routesFilter,
          include: {
            cab: true,
            stops: {
              include: { employee: true },
              orderBy: { stopOrder: "asc" }
            }
          }
        }),
        prisma.systemSettings.findFirst({
          where: { id: "default" }
        })
      ]);

      const counts = countsResult[0] || {
        empCount: 0,
        mgrCount: 0,
        leavesTodayCount: 0,
        pendingLeaves: 0,
        pendingTimings: 0
      };

      totalEmployeesCount = counts.empCount;
      totalManagersCount = counts.mgrCount;
      totalLeavesTodayCount = counts.leavesTodayCount;
      totalPendingRequestsCount = counts.pendingLeaves + counts.pendingTimings;
      allRoutesToday = routesTodayData;
      settings = settingsData;

      // Construct delayedEmployees and compute totalAbsencesCount in memory
      delayedEmployees = [];
      totalAbsencesCount = 0;
      for (const r of allRoutesToday) {
        for (const s of r.stops) {
          if (s.status === "SKIPPED") {
            totalAbsencesCount++;
          }
          if (s.employeeDelayMins > 0 || s.driverDelayMins > 0) {
            delayedEmployees.push({
              ...s,
              route: {
                id: r.id,
                cabId: r.cabId,
                date: r.date,
                shiftId: r.shiftId,
                isPickup: r.isPickup,
                totalDistance: r.totalDistance,
                totalDuration: r.totalDuration,
                status: r.status,
                tripSequence: r.tripSequence,
                routeNumber: r.routeNumber,
                startedAt: r.startedAt,
                completedAt: r.completedAt,
                currentLat: r.currentLat,
                currentLng: r.currentLng,
                lastLocationAt: r.lastLocationAt,
                optimizationScore: r.optimizationScore,
                optimizationMode: r.optimizationMode,
                zone: r.zone,
                subZone: r.subZone,
                updatedAt: r.updatedAt,
                hasEscort: r.hasEscort,
                cab: r.cab
              }
            });
          }
        }
      }
    }

    const activeRoutes = allRoutesToday.filter((r: any) => r.status === "IN_PROGRESS");
    const completedCount = allRoutesToday.filter((r: any) => r.status === "COMPLETED").length;

    // ── Compute stats from allRoutesToday ──────────────────────────────
    const activeUniqueCabs = new Set<string>();
    const activeUniqueDrivers = new Set<string>();

    for (const r of allRoutesToday) {
      if (r.status === "IN_PROGRESS") {
        activeUniqueCabs.add(r.cabId);
        if (r.cab?.driverName) activeUniqueDrivers.add(r.cab.driverName);
        totalEmployeesTravelling += r.stops.length;
      }

      if (r.stops.some((s: any) => s.driverDelayMins > 0 || s.employeeDelayMins > 0)) {
        delayedRoutesCount++;
      }
    }

    totalCabsActive = activeUniqueCabs.size;
    totalDriversActive = activeUniqueDrivers.size;
    delayedEmployeesCount = delayedEmployees.filter((s: any) => s.employeeDelayMins > 0).length;
    delayedDriversCount = delayedEmployees.filter((s: any) => s.driverDelayMins > 0).length;

    // ── ROI savings ────────────────────────────────────────────────────
    const depot = makeDepot(
      settings?.defaultDepotLat ?? 21.0625,
      settings?.defaultDepotLng ?? 79.0526
    );
    let totalOptimizedDistance = 0;
    let totalUnoptimizedDistance = 0;

    for (const r of allRoutesToday) {
      totalOptimizedDistance += r.totalDistance;
      for (const s of r.stops) {
        if (s.employee && s.employee.x && s.employee.y) {
          totalUnoptimizedDistance += getDistance(depot, s.employee) * 2;
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
