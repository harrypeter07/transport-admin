import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

// GET: Retrieve all requests for the logged-in employee
export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "EMPLOYEE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employee = await prisma.employee.findFirst({
      where: { userId: session.userId },
      include: { shift: true }
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee record not found" }, { status: 404 });
    }

    const leaves = await prisma.leaveRequest.findMany({
      where: { applicantId: session.userId },
      orderBy: { startDate: "desc" }
    });

    const timingChanges = await prisma.timingChangeRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { id: "desc" }
    });

    return NextResponse.json({ leaves, timingChanges, employee });
  } catch (error: any) {
    console.error("GET employee requests error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create a new request (LEAVE or TIMING)
export async function POST(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "EMPLOYEE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, startDate, endDate, requestType, requestedTime, comments } = body;

    const employee = await prisma.employee.findFirst({
      where: { userId: session.userId },
      include: { shift: true }
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee record not found" }, { status: 404 });
    }

    if (type === "LEAVE") {
      if (!startDate || !endDate) {
        return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 });
      }

      const newLeave = await prisma.leaveRequest.create({
        data: {
          applicantId: session.userId,
          startDate,
          endDate,
          status: "PENDING",
          comments: comments || ""
        }
      });
      return NextResponse.json({ success: true, request: newLeave });
    } 
    
    if (type === "TIMING") {
      if (!requestType || !requestedTime) {
        return NextResponse.json({ error: "Request type and requested time are required" }, { status: 400 });
      }

      const currentTime = requestType === "PICKUP" 
        ? (employee.shift?.startTime || "09:00")
        : (employee.shift?.endTime || "18:00");

      const newTiming = await prisma.timingChangeRequest.create({
        data: {
          employeeId: employee.id,
          requestType,
          requestedTime,
          currentTime,
          status: "PENDING",
          comments: comments || ""
        }
      });
      return NextResponse.json({ success: true, request: newTiming });
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
  } catch (error: any) {
    console.error("POST employee request error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Cancel a pending request
export async function PATCH(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "EMPLOYEE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId, type } = await req.json();

    const employee = await prisma.employee.findFirst({
      where: { userId: session.userId }
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee record not found" }, { status: 404 });
    }

    if (type === "LEAVE") {
      const leave = await prisma.leaveRequest.findUnique({
        where: { id: requestId }
      });

      if (!leave || leave.applicantId !== session.userId) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }

      if (leave.status !== "PENDING") {
        return NextResponse.json({ error: "Only pending requests can be cancelled" }, { status: 400 });
      }

      const updated = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" }
      });
      return NextResponse.json({ success: true, request: updated });
    }

    if (type === "TIMING") {
      const timing = await prisma.timingChangeRequest.findUnique({
        where: { id: requestId }
      });

      if (!timing || timing.employeeId !== employee.id) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }

      if (timing.status !== "PENDING") {
        return NextResponse.json({ error: "Only pending requests can be cancelled" }, { status: 400 });
      }

      const updated = await prisma.timingChangeRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" }
      });
      return NextResponse.json({ success: true, request: updated });
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
  } catch (error: any) {
    console.error("PATCH employee request error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
