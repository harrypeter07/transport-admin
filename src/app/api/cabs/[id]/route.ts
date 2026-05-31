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
 const { vehicleNumber, capacity, vendor, status, driverName, driverPhone, licenseNumber, shiftId } = body;

 const updated = await prisma.cab.update({
 where: { id },
 data: {
 vehicleNumber,
 ...(capacity !== undefined && { capacity: parseInt(capacity) }),
 vendor,
 status,
 ...(driverName !== undefined && { driverName }),
 ...(driverPhone !== undefined && { driverPhone }),
 ...(licenseNumber !== undefined && { licenseNumber }),
 shiftId: shiftId || null
 },
 include: { shift: true }
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
 const routeReferences = await prisma.route.count({
 where: { cabId: id },
 });

 if (routeReferences > 0) {
 return NextResponse.json(
 { error: "Cab is assigned to existing routes. Reassign or archive those routes before deleting it." },
 { status: 409 }
 );
 }

 await prisma.cab.delete({ where: { id } });
 return NextResponse.json({ success: true });
 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
