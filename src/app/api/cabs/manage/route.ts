import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapsProvider } from "@/lib/maps";
import { requireApiRole } from "@/lib/apiAuth";

// POST: Manually create a Cab and its Driver
export async function POST(req: NextRequest) {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 const body = await req.json();
 const { vehicleNumber, capacity, vendor, driverName, driverPhone, licenseNumber, driverAddress } = body;

 if (!vehicleNumber || !capacity || !driverName) {
 return NextResponse.json({ error: "Missing required fields (vehicleNumber, capacity, driverName)" }, { status: 400 });
 }

 let driverX = null;
 let driverY = null;
 if (driverAddress) {
  const coords = await mapsProvider.geocode(driverAddress);
  if (coords) {
  driverX = coords.x;
  driverY = coords.y;
 }
 }

 const cab = await prisma.cab.create({
 data: {
 vehicleNumber,
 capacity: parseInt(capacity),
 vendor: vendor || "Manual Registry",
 status: "AVAILABLE",
 driverName: driverName,
 driverPhone: driverPhone || "+91 99000 00000",
 licenseNumber: licenseNumber || `DL-MANUAL-${Math.floor(1000 + Math.random() * 9000)}`,
 driverAddress: driverAddress || null,
 driverX,
 driverY,
 },
 });

 return NextResponse.json(cab);
 } catch (e) {
 console.error("Error creating cab manually:", e);
 return NextResponse.json({ error: "Failed to create cab record" }, { status: 500 });
 }
}

// DELETE: Delete a Cab and its associated Driver
export async function DELETE(req: NextRequest) {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");

 if (!id) {
 return NextResponse.json({ error: "Cab ID is required" }, { status: 400 });
 }

 const cab = await prisma.cab.findUnique({
 where: { id },
 });

 if (!cab) {
 return NextResponse.json({ error: "Cab not found" }, { status: 404 });
 }

 const routeReferences = await prisma.route.count({
 where: { cabId: id },
 });

 if (routeReferences > 0) {
 return NextResponse.json(
 { error: "Cab is assigned to existing routes. Reassign or archive those routes before deleting it." },
 { status: 409 }
 );
 }

 await prisma.cab.delete({
 where: { id },
 });

 return NextResponse.json({ success: true });
 } catch (e) {
 console.error("Error deleting cab:", e);
 return NextResponse.json({ error: "Failed to delete cab record" }, { status: 500 });
 }
}

// PATCH: Edit Cab and associated Driver details
export async function PATCH(req: NextRequest) {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 const body = await req.json();
 const { id, vehicleNumber, capacity, vendor, driverName, driverPhone, licenseNumber, driverAddress, driverStartAddress, status } = body;

 if (!id) {
 return NextResponse.json({ error: "Cab ID is required" }, { status: 400 });
 }

 const cab = await prisma.cab.findUnique({
 where: { id },
 });

 if (!cab) {
 return NextResponse.json({ error: "Cab not found" }, { status: 404 });
 }

  const nextDriverAddress = driverAddress !== undefined ? driverAddress : driverStartAddress;
  let driverX: number | null | undefined;
  let driverY: number | null | undefined;
  if (nextDriverAddress !== undefined) {
  if (nextDriverAddress) {
  const coords = await mapsProvider.geocode(nextDriverAddress);
  if (coords) {
  driverX = coords.x;
  driverY = coords.y;
 } else {
 driverX = null;
 driverY = null;
 }
 } else {
 driverX = null;
 driverY = null;
 }
 }

 const updatedCab = await prisma.cab.update({
 where: { id },
 data: {
 vehicleNumber: vehicleNumber !== undefined ? vehicleNumber : undefined,
 capacity: capacity !== undefined ? parseInt(capacity) : undefined,
 vendor: vendor !== undefined ? vendor : undefined,
 status: status !== undefined ? status : undefined,
 driverName: driverName !== undefined ? driverName : undefined,
 driverPhone: driverPhone !== undefined ? driverPhone : undefined,
 licenseNumber: licenseNumber !== undefined ? licenseNumber : undefined,
 driverAddress: nextDriverAddress !== undefined ? (nextDriverAddress || null) : undefined,
 driverX,
 driverY,
 },
 });

 return NextResponse.json(updatedCab);
 } catch (e) {
 console.error("Error updating cab details:", e);
 return NextResponse.json({ error: "Failed to update cab details" }, { status: 500 });
 }
}
