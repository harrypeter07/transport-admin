import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
 const session = await verifySession();
 if (session.role !== "ADMIN") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const { id } = await params;
 const body = await req.json();
 const { name, startTime, endTime } = body;

 const updated = await prisma.shift.update({
 where: { id },
 data: { name, startTime, endTime },
 });
 return NextResponse.json(updated);
 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
 const session = await verifySession();
 if (session.role !== "ADMIN") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const { id } = await params;
 
 const routeCount = await prisma.route.count({ where: { shiftId: id } });
 if (routeCount > 0) {
 return NextResponse.json(
 { error: "This shift is used in existing routes. Archive or reassign those routes first." },
 { status: 409 }
 );
 }

 // Unassign from employees and cabs
 await prisma.employee.updateMany({
 where: { shiftId: id },
 data: { shiftId: null },
 });
 await prisma.cab.updateMany({
 where: { shiftId: id },
 data: { shiftId: null },
 });

 await prisma.shift.delete({ where: { id } });
 return NextResponse.json({ success: true });
 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
