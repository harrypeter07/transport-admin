import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiRole } from "@/lib/apiAuth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
  const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) {
  console.warn("[api] 🔒 POST /routes/violation — UNAUTHORIZED", { role: auth.session.role, ip });
  return auth.response;
 }

 const { violationId } = await req.json();
 if (!violationId) {
 return NextResponse.json({ error: "violationId is required" }, { status: 400 });
 }

 const violation = await prisma.violation.findUnique({
 where: { id: violationId },
 });

 if (!violation) {
 return NextResponse.json({ error: "Violation not found" }, { status: 404 });
 }

 // Resolve violation
 await prisma.violation.update({
 where: { id: violationId },
 data: {
 resolved: true,
 notes: "Approved override by Admin - verified safety alternatives.",
 },
 });

 // Fetch parent route and increment its score slightly for resolution
 const route = await prisma.route.findUnique({
 where: { id: violation.routeId },
 });
  if (route) {
  const newScore = Math.min(100, route.optimizationScore + 20);
  await prisma.route.update({
  where: { id: route.id },
  data: { optimizationScore: newScore },
  });
  }

  await audit({
  userId: auth.session.userId,
  role: auth.session.role,
  action: "UPDATE",
  entity: "Route",
  entityId: violation.routeId,
  before: { resolved: false },
  after: { resolved: true, optimizationScore: route ? Math.min(100, route.optimizationScore + 20) : undefined },
  ip,
  });

  return NextResponse.json({ success: true });
  } catch (e) {
  console.error("[api] ❌ POST /routes/violation", { ip }, e);
  return NextResponse.json({ error: "Failed to override violation" }, { status: 500 });
  }
}
