import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "MANAGER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the employee record for this manager
    const managerEmployee = await prisma.employee.findFirst({
      where: { userId: session.userId }
    });

    if (!managerEmployee) {
      return NextResponse.json({ leaves: [], timingChanges: [] });
    }

    // Get all subordinates
    const subordinates = await prisma.employee.findMany({
      where: { managerId: managerEmployee.id },
      include: { user: true }
    });
    
    const subordinateUserIds = subordinates
      .filter(s => s.userId)
      .map(s => s.userId as string);

    // Fetch Leaves
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        applicantId: { in: subordinateUserIds },
        status: "PENDING"
      },
      include: {
        applicant: true
      },
      orderBy: { startDate: "asc" }
    });

    // Fetch Timing Changes
    const timingChanges = await prisma.timingChangeRequest.findMany({
      where: {
        employeeId: { in: subordinates.map(s => s.id) },
        status: "PENDING"
      },
      include: {
        employee: true
      }
    });

    return NextResponse.json({ leaves, timingChanges });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "MANAGER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, type, status, comments } = await req.json();
    
    if (type === "LEAVE") {
      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: { status, comments, approverId: session.userId }
      });
      return NextResponse.json({ success: true, updated });
    } else if (type === "TIMING") {
      const updated = await prisma.timingChangeRequest.update({
        where: { id },
        data: { status, comments, approverId: session.userId }
      });
      return NextResponse.json({ success: true, updated });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
