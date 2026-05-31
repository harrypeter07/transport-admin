import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
 try {
 const session = await verifySession();
 if (session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const managerEmployee = await prisma.employee.findFirst({
 where: { userId: session.userId }
 });

 if (!managerEmployee) {
 return NextResponse.json({ team: [] });
 }

 const team = await prisma.employee.findMany({
 where: { managerId: managerEmployee.id },
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
 console.error("GET manager team error:", error);
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
