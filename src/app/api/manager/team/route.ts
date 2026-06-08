export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
  const session = await verifySession();
 if (session.role !== "MANAGER") {
  console.warn("[api] 🔒 GET /manager/team — UNAUTHORIZED", { role: session.role, ip });
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const managerEmployee = await prisma.employee.findFirst({
 where: { userId: session.userId }
 });

 if (!managerEmployee) {
 return NextResponse.json({ team: [] });
 }

  const team = await prisma.employee.findMany({
  where: { managerId: managerEmployee.id, status: "ACTIVE" },
  include: {
  shift: true,
  user: {
  include: {
  leaves: {
  orderBy: { startDate: "desc" }
  }
  }
  }
  },
  orderBy: { name: "asc" }
  });

 return NextResponse.json({ team });
  } catch (error: any) {
  console.error("[api] ❌ GET /manager/team", { ip }, error);
  return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
