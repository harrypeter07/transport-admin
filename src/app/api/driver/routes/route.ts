export const dynamic = "force-dynamic";
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

 // 1. CHECK DATABASE FOR OPTIMIZED ROUTES
 const dbRoutes = await prisma.route.findMany({
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

 if (dbRoutes.length > 0) {
   return NextResponse.json({ routes: dbRoutes });
 }

 // 2. FALLBACK TO BASELINE SNAPSHOT DIRECTLY FOR MANUAL ROUTING BYPASS
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
       return NextResponse.json({ routes: myRoutes, isManualManifest: true });
     }
   }
 }

 return NextResponse.json({ routes: [] });

 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
