import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { requireApiRole } from "@/lib/apiAuth";

// GET all leaves (Admin sees all, Manager sees team)
export async function GET(req: NextRequest) {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { searchParams } = new URL(req.url);
 const status = searchParams.get("status");

 try {
 let whereClause: any = {};
 if (status && status !== "ALL") {
 whereClause.status = status;
 }

 if (session.role === "MANAGER") {
 // Manager sees only subordinates' leaves
 const managerEmp = await prisma.employee.findFirst({ where: { userId: session.userId } });
 if (managerEmp) {
 const subordinates = await prisma.employee.findMany({
 where: { managerId: managerEmp.id },
 select: { userId: true },
 });
 const subUserIds = subordinates.map(s => s.userId).filter(Boolean);
 whereClause.applicantId = { in: subUserIds };
 } else {
 return NextResponse.json([]); // Manager has no employee record
 }
 }

 const leaves = await prisma.leaveRequest.findMany({
 where: whereClause,
 include: {
 applicant: { select: { id: true, name: true, email: true } },
 approver: { select: { id: true, name: true } },
 },
 orderBy: { startDate: "desc" },
 });

 return NextResponse.json(leaves);
 } catch (error: any) {
 console.error("Error fetching leaves:", error);
 return NextResponse.json({ error: "Failed to fetch leaves" }, { status: 500 });
 }
}

// POST: Manually add a leave request (Admin/Manager on behalf of employee)
export async function POST(req: NextRequest) {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const body = await req.json();
 const { applicantId, startDate, endDate, status, comments } = body;

 if (!applicantId || !startDate || !endDate) {
 return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
 }

 const newLeave = await prisma.leaveRequest.create({
 data: {
 applicantId,
 startDate,
 endDate,
 status: status || "PENDING",
 comments: comments || "Added manually by management",
 approverId: status === "APPROVED" ? session.userId : null,
 },
 include: {
 applicant: { select: { id: true, name: true, email: true } },
 approver: { select: { id: true, name: true } },
 },
 });

 return NextResponse.json(newLeave);
 } catch (error: any) {
 console.error("Error adding leave:", error);
 return NextResponse.json({ error: "Failed to add leave" }, { status: 500 });
 }
}

// PATCH: Approve / Reject leave
export async function PATCH(req: NextRequest) {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const body = await req.json();
 const { id, action, comments } = body; // action = "APPROVE" or "REJECT"

 if (!id || !action) {
 return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
 }

 let status = "PENDING";
 if (action === "APPROVE") status = "APPROVED";
 if (action === "REJECT") status = "REJECTED";

 const updatedLeave = await prisma.leaveRequest.update({
 where: { id },
 data: {
 status,
 approverId: session.userId,
 ...(comments ? { comments } : {}),
 },
 include: {
 applicant: { select: { id: true, name: true, email: true } },
 approver: { select: { id: true, name: true } },
 },
 });

 return NextResponse.json(updatedLeave);
 } catch (error: any) {
 console.error("Error updating leave status:", error);
 return NextResponse.json({ error: "Failed to update leave" }, { status: 500 });
 }
}
