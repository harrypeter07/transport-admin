import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiRole } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

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

 return NextResponse.json({ success: true });
 } catch (e) {
 console.error("Error overriding violation:", e);
 return NextResponse.json({ error: "Failed to override violation" }, { status: 500 });
 }
}
