import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSafetyViolations, DEPOT, fetchGoogleRouteMetrics, fetchGoogleMapsMatrix } from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";

export async function PATCH(
 req: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 const { id: routeId } = await params;
 const body = await req.json();
 const { action } = body;

 // Fetch the target route
 const route = await prisma.route.findUnique({
 where: { id: routeId },
 include: {
 stops: {
 include: { employee: true },
 orderBy: { stopOrder: "asc" },
 },
 violations: true,
 },
 });

 if (!route) {
 return NextResponse.json({ error: "Route not found" }, { status: 404 });
 }

 if (action === "UPDATE_STATUS") {
 const { stopId, status } = body;
 if (!["PENDING", "REACHED", "BOARDED", "SKIPPED"].includes(status)) {
 return NextResponse.json({ error: "Invalid stop status" }, { status: 400 });
 }

 await prisma.routeStop.update({
 where: { id: stopId },
 data: { status },
 });

 // Fetch all stops to check if route is completed
 const allStops = await prisma.routeStop.findMany({
 where: { routeId },
 });
 const allCompletedOrMissed = allStops.every(
 (s) => s.status === "BOARDED" || s.status === "SKIPPED"
 );

 const routeStatus = allCompletedOrMissed ? "COMPLETED" : "IN_PROGRESS";
 await prisma.route.update({
 where: { id: routeId },
 data: { status: routeStatus },
 });

 return NextResponse.json({ success: true });
 }

 if (action === "REORDER") {
 const { stopId, direction } = body;
 const stops = [...route.stops];

 const targetIdx = stops.findIndex((s) => s.id === stopId);
 if (targetIdx === -1) {
 return NextResponse.json({ error: "Stop not found" }, { status: 404 });
 }

 const targetStop = stops[targetIdx];
 if (targetStop.status === "SKIPPED") {
 return NextResponse.json({ error: "Cannot reorder a skipped stop" }, { status: 400 });
 }

 // Reorder stops in array
 if (direction === "up" && targetIdx > 0) {
 const siblingStop = stops[targetIdx - 1];
 if (siblingStop.status === "SKIPPED") {
 return NextResponse.json({ error: "Cannot swap with a skipped stop" }, { status: 400 });
 }
 const temp = stops[targetIdx];
 stops[targetIdx] = stops[targetIdx - 1];
 stops[targetIdx - 1] = temp;
 } else if (direction === "down" && targetIdx < stops.length - 1) {
 const siblingStop = stops[targetIdx + 1];
 if (siblingStop.status === "SKIPPED") {
 return NextResponse.json({ error: "Cannot swap with a skipped stop" }, { status: 400 });
 }
 const temp = stops[targetIdx];
 stops[targetIdx] = stops[targetIdx + 1];
 stops[targetIdx + 1] = temp;
 } else {
 return NextResponse.json({ error: "Invalid swap direction" }, { status: 400 });
 }

 // Re-assign stopOrder indexes (1-indexed)
 stops.forEach((stop, idx) => {
 stop.stopOrder = idx + 1;
 });

  // Recalculate ETAs using Google Routes Matrix API
  const isPickup = route.isPickup;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  const stopsCoords = stops.map(s => ({ x: s.employee.x, y: s.employee.y }));
  const { durationMatrix: legDur } = await fetchGoogleMapsMatrix(stopsCoords, apiKey);

  let cumulativeMinutes = 0;
  for (let j = 0; j < stops.length; j++) {
    const s = stops[j];
    if (j > 0) {
      cumulativeMinutes += legDur[j - 1][j];
    }
    s.etaMinutes = cumulativeMinutes + (isPickup ? 10 : 0);
  }

  // Fetch road distance and duration for the new stop order
  const routeMetrics = await fetchGoogleRouteMetrics(
 stops.map(s => ({ x: s.employee.x, y: s.employee.y })),
 isPickup
 );

 // Re-evaluate safety violations
 const finalViolations = checkSafetyViolations(
 stops.map((s) => ({ name: s.employee.name, gender: s.employee.gender as "MALE" | "FEMALE", status: s.status })),
 isPickup,
 false // escort starts as false on re-evaluation
 );

 // Perform DB updates in transaction
 await prisma.$transaction(async (tx) => {
 // Update each stop order and ETA
 for (const stop of stops) {
 await tx.routeStop.update({
 where: { id: stop.id },
 data: { stopOrder: stop.stopOrder, etaMinutes: stop.etaMinutes },
 });
 }

 // Delete old violations
 await tx.violation.deleteMany({ where: { routeId } });

 // Insert new violations
 for (const viol of finalViolations) {
 await tx.violation.create({
 data: {
 routeId,
 type: viol.type,
 severity: viol.severity,
 resolved: false,
 notes: viol.notes,
 },
 });
 }

 // Update Route parameters
 const penalty = finalViolations.length * 30;
  const score = Math.max(30, Math.round(100 - routeMetrics.distance * 0.8 - penalty));

 await tx.route.update({
 where: { id: routeId },
 data: {
  totalDistance: routeMetrics.distance,
  totalDuration: routeMetrics.duration,
 optimizationScore: score,
 },
 });
 });

 return NextResponse.json({ success: true });
 }

 if (action === "APPLY_SEQUENCE") {
 const { stopIds, distance, duration } = body;
 if (!Array.isArray(stopIds)) {
 return NextResponse.json({ error: "stopIds array is required" }, { status: 400 });
 }

 const stops = [...route.stops];
 // Reorder stops in array matching the order of stopIds
 const reorderedStops = stopIds.map((id, index) => {
 const stop = stops.find(s => s.id === id);
 if (!stop) {
 throw new Error(`Stop ${id} not found in this route`);
 }
 return {
 ...stop,
 stopOrder: index + 1
 };
 });

  // Recalculate ETAs using Google Routes Matrix API
  const isPickup = route.isPickup;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  const stopsCoords = reorderedStops.map(s => ({ x: s.employee.x, y: s.employee.y }));
  const { durationMatrix: legDur } = await fetchGoogleMapsMatrix(stopsCoords, apiKey);

  let cumulativeMinutes = 0;
  reorderedStops.forEach((stop, idx) => {
    if (idx > 0) {
      cumulativeMinutes += legDur[idx - 1][idx];
    }
    stop.etaMinutes = cumulativeMinutes + (isPickup ? 10 : 0);
  });

 // Re-evaluate safety violations
 const finalViolations = checkSafetyViolations(
 reorderedStops.map((s) => ({ name: s.employee.name, gender: s.employee.gender as "MALE" | "FEMALE", status: s.status })),
 isPickup,
 route.hasEscort || false
 );

 // Perform DB updates in transaction
 await prisma.$transaction(async (tx) => {
 // Update each stop order and ETA
 for (const stop of reorderedStops) {
 await tx.routeStop.update({
 where: { id: stop.id },
 data: { stopOrder: stop.stopOrder, etaMinutes: stop.etaMinutes },
 });
 }

 // Delete old violations
 await tx.violation.deleteMany({ where: { routeId } });

 // Insert new violations
 for (const viol of finalViolations) {
 await tx.violation.create({
 data: {
 routeId,
 type: viol.type,
 severity: viol.severity,
 resolved: false,
 notes: viol.notes,
 },
 });
 }

 // Update Route parameters
 const penalty = finalViolations.length * 30;
 const score = Math.max(30, Math.round(100 - distance * 0.8 - penalty));

 await tx.route.update({
 where: { id: routeId },
 data: {
 totalDistance: distance,
 totalDuration: duration,
 optimizationScore: score,
 },
 });
 });

 return NextResponse.json({ success: true });
 }

 if (action === "SWAP_CAB") {
 const { cabId } = body;
 if (!cabId) {
 return NextResponse.json({ error: "cabId is required" }, { status: 400 });
 }

 // Check if cab exists
 const targetCab = await prisma.cab.findUnique({
 where: { id: cabId },
 });

 if (!targetCab) {
 return NextResponse.json({ error: "Cab not found" }, { status: 404 });
 }

 // Update Route with new cabId
 await prisma.route.update({
 where: { id: routeId },
 data: { cabId },
 });

 return NextResponse.json({ success: true });
 }

 return NextResponse.json({ error: "Invalid action" }, { status: 400 });
 } catch (e) {
 console.error("Failed route edit:", e);
 return NextResponse.json({ error: "Failed to update route" }, { status: 500 });
 }
}
