import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await verifySession();
    
    // Fetch global holidays
    const holidays = await prisma.holiday.findMany();

    // Fetch leaves relevant to the user
    let leaves: any[] = [];
    
    if (session.role === "EMPLOYEE") {
      leaves = await prisma.leaveRequest.findMany({
        where: { applicantId: session.userId, status: "APPROVED" }
      });
    } else if (session.role === "MANAGER") {
      const managerEmp = await prisma.employee.findFirst({ where: { userId: session.userId } });
      if (managerEmp) {
        const subs = await prisma.employee.findMany({ where: { managerId: managerEmp.id } });
        const subIds = subs.filter(s => s.userId).map(s => s.userId as string);
        leaves = await prisma.leaveRequest.findMany({
          where: { applicantId: { in: subIds }, status: "APPROVED" },
          include: { applicant: true }
        });
      }
    }

    return NextResponse.json({ holidays, leaves });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
