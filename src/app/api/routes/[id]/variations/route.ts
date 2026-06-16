export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRouteVariations, OptimizeEmployee } from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";

export async function GET(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
  const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) {
  console.warn("[api] 🔒 GET /routes/[id]/variations — UNAUTHORIZED", { role: auth.session.role, ip });
  return auth.response;
 }

 const { id: routeId } = await params;
 
 // Fetch the target route and its current stops/employees
 const route = await prisma.route.findUnique({
 where: { id: routeId },
 include: {
  stops: {
  include: { employee: { include: { pickupPoint: true } } },
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
  const optEmployees: OptimizeEmployee[] = route.stops.map((stop) => {
    const emp = stop.employee;
    const usePickup = !!(emp.pickupPointId && emp.pickupPoint);
    const pp = emp.pickupPoint;
    return {
      id: emp.id,
      name: emp.name,
      gender: emp.gender as "MALE" | "FEMALE",
      x: (usePickup && pp) ? pp.x : emp.x,
      y: (usePickup && pp) ? pp.y : emp.y,
      address: (usePickup && pp) ? (pp.address || pp.name) : emp.address,
      department: emp.department,
      phone: emp.phone,
    };
  });

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
  console.error("[api] ❌ GET /routes/[id]/variations", { ip }, e);
  return NextResponse.json({ error: "Failed to calculate route variations" }, { status: 500 });
 }
}
