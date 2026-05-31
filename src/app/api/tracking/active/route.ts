import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
 try {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const routeWhere =
 session.role === "MANAGER"
 ? {
 status: "IN_PROGRESS",
 stops: {
 some: {
 employee: {
 manager: {
 userId: session.userId,
 },
 },
 },
 },
 }
 : { status: "IN_PROGRESS" };

 // Fetch active routes in the caller's scope
 const routes = await prisma.route.findMany({
 where: routeWhere,
 include: {
 cab: true,
 stops: {
 include: { employee: true },
 orderBy: { stopOrder: "asc" }
 },
 deviations: {
 where: { resolved: false }
 }
 }
 });

 const activeVehicles = routes.map(r => {
 let isDelayed = false;
 const nextStop = r.stops.find(s => s.status === "PENDING");
 if (nextStop && nextStop.expectedTime) {
 const now = new Date();
 const diffMins = (now.getTime() - nextStop.expectedTime.getTime()) / 60000;
 if (diffMins > 10) isDelayed = true; // 10 mins late
 }

 let status = "ON_TIME";
 if (r.deviations.length > 0) status = "DEVIATED";
 else if (isDelayed) status = "DELAYED";

 return {
 routeId: r.id,
 cabNumber: r.cab.vehicleNumber,
 driverName: r.cab.driverName || "Unassigned",
 currentLat: r.currentLat,
 currentLng: r.currentLng,
 lastLocationAt: r.lastLocationAt,
 status,
 passengerCount: r.stops.filter(s => s.status === "BOARDED").length,
 totalPassengers: r.stops.length
 };
 });

 return NextResponse.json({ activeVehicles });

 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
