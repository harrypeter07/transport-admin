export const dynamic = "force-dynamic";
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
 return NextResponse.json({ route: null, myStop: null });
 }

 const routeStop = await prisma.routeStop.findFirst({
 where: {
 employeeId: employee.id,
 route: {
 date: { gte: today },
	status: { in: ["ASSIGNED", "IN_PROGRESS"] }
 }
 },
 orderBy: {
 route: { date: "asc" }
 },
 include: {
 route: {
 include: {
	cab: { include: { user: { select: { name: true } } } },
 shift: true,
 stops: {
 include: { employee: true },
 orderBy: { stopOrder: "asc" }
 }
 }
 }
 }
 });

 if (routeStop) {
   return NextResponse.json({ route: routeStop.route, myStop: routeStop });
 }

 // FALLBACK TO BASELINE SNAPSHOT DIRECTLY FOR MANUAL ROUTING BYPASS
 const baseline = await prisma.baselineRoute.findFirst({
   where: { date: today }, // Only match today's published manual manifest
   orderBy: { createdAt: 'desc' }
 });

 if (baseline) {
   let routeData = baseline.routeData;
   if (typeof routeData === 'string') routeData = JSON.parse(routeData);
   if (routeData && !Array.isArray(routeData) && Array.isArray((routeData as any).routes)) routeData = (routeData as any).routes;

   if (Array.isArray(routeData)) {
     // EXACT MANIFEST AS REQUESTED - No filtering
     const myRoutes = routeData.map((r: any) => ({
       ...r,
       isManualManifest: true
     }));

     if (myRoutes.length > 0) {
       return NextResponse.json({ route: null, myStop: null, isManualManifest: true, manualRoutes: myRoutes });
     }
   }
 }

 return NextResponse.json({ route: null, myStop: null });

 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
