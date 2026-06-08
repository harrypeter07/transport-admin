import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "EMPLOYEE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: session.userId },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });
    }

    return NextResponse.json(employee);
  } catch (error) {
    console.error("[api] ❌ GET /api/employee/profile", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
