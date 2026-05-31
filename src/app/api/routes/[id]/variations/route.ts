import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRouteVariations, OptimizeEmployee } from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";

export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 const { id: routeId } = await params;
 
 // Fetch the target route and its current stops/employees
 const route = await prisma.route.findUnique({
 where: { id: routeId },
 include: {
 stops: {
 include: { employee: true },
 orderBy: { stopOrder: "asc" },
 },
 },
 });

 if (!route) {
 return NextResponse.json({ error: "Route not found" }, { status: 404 });
 }

 if (route.stops.length === 0) {
 return NextResponse.json([]);
 }

 // Map to Optimizer employees
 const optEmployees: OptimizeEmployee[] = route.stops.map((stop) => ({
 id: stop.employee.id,
 name: stop.employee.name,
 gender: stop.employee.gender as "MALE" | "FEMALE",
 x: stop.employee.x,
 y: stop.employee.y,
 address: stop.employee.address,
 department: stop.employee.department,
 phone: stop.employee.phone,
 }));

 const apiKeyHeader = req.headers.get("x-google-maps-key") || "";
 const apiKey = apiKeyHeader || process.env.GOOGLE_MAPS_API_KEY || "";

 const variations = await getRouteVariations(
 optEmployees,
 route.isPickup,
 route.hasEscort || false,
 apiKey
 );

 return NextResponse.json(variations);
 } catch (e) {
 console.error("Failed fetching route variations:", e);
 return NextResponse.json({ error: "Failed to calculate route variations" }, { status: 500 });
 }
}
