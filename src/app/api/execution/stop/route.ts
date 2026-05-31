import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function POST(req: Request) {
 try {
 const session = await verifySession();
 if (session.role !== "DRIVER" && session.role !== "ADMIN") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { stopId, action, metadata } = await req.json();

 if (!stopId || !action) {
 return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
 }

 const stop = await prisma.routeStop.findUnique({
 where: { id: stopId },
 include: {
 route: { include: { cab: true } },
 employee: true
 }
 });

 if (!stop) {
 return NextResponse.json({ error: "Stop not found" }, { status: 404 });
 }

 if (stop.route.status !== "IN_PROGRESS") {
 return NextResponse.json({ error: "Route is not in progress" }, { status: 400 });
 }

 if (session.role === "DRIVER" && stop.route.cab.userId !== session.userId) {
 return NextResponse.json({ error: "Stop not assigned to this driver" }, { status: 403 });
 }

 const now = new Date();

 if (action === "REACH_STOP") {
 if (stop.status !== "PENDING") {
 return NextResponse.json({ error: "Stop is not pending" }, { status: 400 });
 }

 // Calculate Driver Delay
 let driverDelayMins = 0;
 if (stop.expectedTime) {
 const diffMs = now.getTime() - stop.expectedTime.getTime();
 driverDelayMins = Math.max(0, Math.floor(diffMs / 60000));
 }

 const updatedStop = await prisma.$transaction(async (tx) => {
 const s = await tx.routeStop.update({
 where: { id: stopId },
 data: {
 status: "REACHED",
 actualArrivalTime: now,
 driverDelayMins,
 }
 });

 await tx.operationalEvent.create({
 data: {
 type: "STOP_REACHED",
 timestamp: now,
 routeId: stop.routeId,
 routeStopId: stopId,
 cabId: stop.route.cab.id,
 employeeId: stop.employeeId,
 metadata: metadata ? JSON.stringify(metadata) : null,
 }
 });

 return s;
 });

 if (stop.employee.userId) {
 createNotification(
 stop.employee.userId,
 "Driver is arriving!",
 "Your driver has reached your stop. Please proceed to board.",
 "ROUTE",
 "/dashboard/employee/route"
 ).catch(console.error);
 }

 return NextResponse.json({ success: true, stop: updatedStop });
 }

 if (action === "BOARD_EMPLOYEE" || action === "SKIP_STOP") {
 if (stop.status !== "REACHED" && stop.status !== "PENDING") {
 return NextResponse.json({ error: "Invalid status for boarding/skipping" }, { status: 400 });
 }

 const newStatus = action === "BOARD_EMPLOYEE" ? "BOARDED" : "SKIPPED";
 const eventType = action === "BOARD_EMPLOYEE" ? "EMPLOYEE_BOARDED" : "STOP_SKIPPED";

 // Employee Delay only calculated if BOARDED and stop was REACHED
 let employeeDelayMins = stop.employeeDelayMins;
 const actualArrival = stop.actualArrivalTime || now; // If they skipped without hitting reached

 if (action === "BOARD_EMPLOYEE") {
 const diffMs = now.getTime() - actualArrival.getTime();
 employeeDelayMins = Math.max(0, Math.floor(diffMs / 60000));
 }

 const updatedStop = await prisma.$transaction(async (tx) => {
 const s = await tx.routeStop.update({
 where: { id: stopId },
 data: {
 status: newStatus,
 boardedTime: action === "BOARD_EMPLOYEE" ? now : undefined,
 actualArrivalTime: stop.actualArrivalTime ? undefined : now, // set if they didn't explicitly reach
 employeeDelayMins,
 }
 });

 await tx.operationalEvent.create({
 data: {
 type: eventType,
 timestamp: now,
 routeId: stop.routeId,
 routeStopId: stopId,
 cabId: stop.route.cab.id,
 employeeId: stop.employeeId,
 metadata: metadata ? JSON.stringify(metadata) : null,
 }
 });

 return s;
 });

 if (stop.employee.userId) {
 createNotification(
 stop.employee.userId,
 newStatus === "BOARDED" ? "You have boarded" : "You were skipped",
 newStatus === "BOARDED" ? "Have a safe trip!" : "The driver has marked you as skipped.",
 "ROUTE",
 "/dashboard/employee/route"
 ).catch(console.error);
 }

 // If employee was delayed by more than 5 minutes, notify their manager
 if (employeeDelayMins > 5 && stop.employee.managerId) {
 const manager = await prisma.employee.findUnique({ where: { id: stop.employee.managerId } });
 if (manager?.userId) {
 createNotification(
 manager.userId,
 "Team Transportation Delay",
 `${stop.employee.name} delayed boarding by ${employeeDelayMins} minutes.`,
 "SYSTEM",
 "/dashboard/manager"
 ).catch(console.error);
 }
 }

 return NextResponse.json({ success: true, stop: updatedStop });
 }

 return NextResponse.json({ error: "Invalid action" }, { status: 400 });

 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
