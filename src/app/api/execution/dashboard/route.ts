import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getDistance, makeDepot } from "@/lib/optimization";

export async function GET(req: Request) {
 try {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
 let routesQuery: any = { date: today };

 // Manager dashboard variables
 let teamSize = 0;
 let employeesOnLeaveToday = 0;
 let pendingApprovalsCount = 0;
 let teamLeavesList: string[] = [];

 // Admin dashboard variables
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
 where: { managerId: managerEmployee.id }
 });
 const subordinateIds = subordinates.map(s => s.id);
 const subordinateUserIds = subordinates.filter(s => s.userId).map(s => s.userId as string);

 teamSize = subordinates.length;

 routesQuery.stops = {
 some: { employeeId: { in: subordinateIds } }
 };

 // Query leaves today for subordinates
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

 // Query pending approvals for subordinates
 const pendingLeaves = await prisma.leaveRequest.count({
 where: {
 applicantId: { in: subordinateUserIds },
 status: "PENDING"
 }
 });
 const pendingTimings = await prisma.timingChangeRequest.count({
 where: {
 employeeId: { in: subordinateIds },
 status: "PENDING"
 }
 });
 pendingApprovalsCount = pendingLeaves + pendingTimings;
 } else if (session.role === "ADMIN") {
 // General Stats
 totalEmployeesCount = await prisma.employee.count({ where: { status: "ACTIVE" } });
 totalManagersCount = await prisma.user.count({ where: { role: "MANAGER", isActive: true } });
 
 // Approved leaves matching today
 totalLeavesTodayCount = await prisma.leaveRequest.count({
 where: {
 status: "APPROVED",
 startDate: { lte: today },
 endDate: { gte: today }
 }
 });

 // Absences = Employees active today but not in any assigned route stops today
 const assignedStopsToday = await prisma.routeStop.findMany({
 where: { route: { date: today } },
 select: { employeeId: true }
 });
 const assignedEmployeeIds = new Set(assignedStopsToday.map(s => s.employeeId));
 const activeEmployees = await prisma.employee.findMany({
 where: { status: "ACTIVE" },
 select: { id: true, userId: true }
 });
 
 // Also exclude employees on approved leaves today
 const usersOnLeaveToday = await prisma.leaveRequest.findMany({
 where: {
 status: "APPROVED",
 startDate: { lte: today },
 endDate: { gte: today }
 },
 select: { applicantId: true }
 });
 const leaveUserIds = new Set(usersOnLeaveToday.map(l => l.applicantId));

 const absentEmployees = activeEmployees.filter(
 emp => !assignedEmployeeIds.has(emp.id) && (!emp.userId || !leaveUserIds.has(emp.userId))
 );
 totalAbsencesCount = absentEmployees.length;

 // Pending Approvals
 const pendingLeaves = await prisma.leaveRequest.count({ where: { status: "PENDING" } });
 const pendingTimings = await prisma.timingChangeRequest.count({ where: { status: "PENDING" } });
 totalPendingRequestsCount = pendingLeaves + pendingTimings;
 }

 const activeRoutes = await prisma.route.findMany({
 where: {
 ...routesQuery,
 status: "IN_PROGRESS"
 },
 include: {
 cab: true,
 stops: {
 include: { employee: true },
 orderBy: { stopOrder: "asc" }
 }
 }
 });

 const delayedEmployees = await prisma.routeStop.findMany({
 where: {
 route: routesQuery,
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

 // Calculate admin statistics from today's routes
 const routesToday = await prisma.route.findMany({
 where: routesQuery,
 include: {
 cab: true,
 stops: true
 }
 });

 const activeUniqueCabs = new Set<string>();
 const activeUniqueDrivers = new Set<string>();

 for (const r of routesToday) {
 if (r.status === "IN_PROGRESS") {
 activeUniqueCabs.add(r.cabId);
 if (r.cab?.driverName) {
 activeUniqueDrivers.add(r.cab.driverName);
 }
 totalEmployeesTravelling += r.stops.length;
 }

 // Check if route has any delay
 const hasDelays = r.stops.some(s => s.driverDelayMins > 0 || s.employeeDelayMins > 0);
 if (hasDelays) {
 delayedRoutesCount++;
 }
 }

 totalCabsActive = activeUniqueCabs.size;
 totalDriversActive = activeUniqueDrivers.size;

 delayedEmployeesCount = delayedEmployees.filter(s => s.employeeDelayMins > 0).length;
 delayedDriversCount = delayedEmployees.filter(s => s.driverDelayMins > 0).length;

 const completedRoutes = await prisma.route.count({
 where: { ...routesQuery, status: "COMPLETED" }
 });

 // Calculate ROI Distance savings
 const settings = await prisma.systemSettings.upsert({
 where: { id: "default" }, update: {}, create: { id: "default" }
 });
 const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);

 let totalOptimizedDistance = 0;
 let totalUnoptimizedDistance = 0;

 for (const r of routesToday) {
 totalOptimizedDistance += r.totalDistance;
 // Unoptimized assumes naively ordered stops (represent as naive total distances)
 for (const s of r.stops) {
 // Fetch stop coordinates
 const emp = await prisma.employee.findUnique({ where: { id: s.employeeId } });
 if (emp?.x && emp?.y) {
 totalUnoptimizedDistance += (getDistance(depot, emp) * 2);
 }
 }
 }

 const metrics = {
 activeCount: activeRoutes.length,
 completedCount: completedRoutes,
 totalDelayedCount: delayedEmployees.length,
 totalOptimizedDistance: Math.round(totalOptimizedDistance),
 totalUnoptimizedDistance: Math.round(totalUnoptimizedDistance),
 savings: Math.round(totalUnoptimizedDistance - totalOptimizedDistance),
 
 // Manager specifics
 teamSize,
 employeesOnLeaveToday,
 pendingApprovalsCount,
 teamLeavesList,

 // Admin specifics
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
 console.error("Dashboard API error:", error);
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
