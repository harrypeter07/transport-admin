import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapsProvider } from "@/lib/maps";
import { requireApiRole } from "@/lib/apiAuth";
import { audit } from "@/lib/audit";

function reqIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
}

// POST: Manually create a Cab and its Driver
export async function POST(req: NextRequest) {
  const ip = reqIp(req);
  try {
  const auth = await requireApiRole(["ADMIN"]);
  if (auth.response) return auth.response;

  const body = await req.json();
  const { vehicleNumber, capacity, vendor, driverName, driverPhone, licenseNumber, driverAddress } = body;
  const formattedAddress = body.formattedAddress || driverAddress;
  const placeId = body.placeId || null;
  const autoLat = body.lat ? Number(body.lat) : null;
  const autoLon = body.lon ? Number(body.lon) : null;

  if (!vehicleNumber || !capacity || !driverName) {
  return NextResponse.json({ error: "Missing required fields (vehicleNumber, capacity, driverName)" }, { status: 400 });
  }

  let driverX = null;
  let driverY = null;
  let driverPlaceId = null;
  if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
    driverX = autoLon;
    driverY = autoLat;
    driverPlaceId = placeId;
  } else if (driverAddress) {
    const coords = await mapsProvider.geocode(driverAddress);
    if (coords) {
    driverX = coords.x;
    driverY = coords.y;
    driverPlaceId = coords.placeId || null;
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
  formattedAddress,
  driverX,
  driverY,
  placeId: driverPlaceId,
  },
  });

  await audit({ userId: auth.session.userId, role: auth.session.role, action: "CREATE", entity: "Cab", entityId: cab.id, after: { vehicleNumber: cab.vehicleNumber }, ip });
  console.info("[api] ✅ POST /api/cabs/manage — OK", { vehicleNumber: cab.vehicleNumber, id: cab.id, userId: auth.session.userId, ip });
  return NextResponse.json(cab);
  } catch (e) {
  console.error("[api] ❌ POST /api/cabs/manage — Failed", { ip }, e);
  return NextResponse.json({ error: "Failed to create cab record" }, { status: 500 });
  }
}

// DELETE: Delete a Cab and its associated Driver
export async function DELETE(req: NextRequest) {
  const ip = reqIp(req);
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

  await audit({ userId: auth.session.userId, role: auth.session.role, action: "DELETE", entity: "Cab", entityId: id, ip });
  console.info("[api] ✅ DELETE /api/cabs/manage — OK", { id, userId: auth.session.userId, ip });
  return NextResponse.json({ success: true });
  } catch (e) {
  console.error("[api] ❌ DELETE /api/cabs/manage — Failed", { ip }, e);
  return NextResponse.json({ error: "Failed to delete cab record" }, { status: 500 });
  }
}

// PATCH: Edit Cab and associated Driver details
export async function PATCH(req: NextRequest) {
  const ip = reqIp(req);
  try {
  const auth = await requireApiRole(["ADMIN"]);
  if (auth.response) return auth.response;

  const body = await req.json();
  const { id, vehicleNumber, capacity, vendor, driverName, driverPhone, licenseNumber, driverAddress, driverStartAddress, status } = body;
  const formattedAddress = body.formattedAddress;
  const placeId = body.placeId;
  const autoLat = body.lat ? Number(body.lat) : null;
  const autoLon = body.lon ? Number(body.lon) : null;

  if (!id) {
  return NextResponse.json({ error: "Cab ID is required" }, { status: 400 });
  }

  const cab = await prisma.cab.findUnique({
  where: { id },
  });

  if (!cab) {
  return NextResponse.json({ error: "Cab not found" }, { status: 404 });
  }

  const cabBefore = { ...cab };
  const nextDriverAddress = driverAddress !== undefined ? driverAddress : driverStartAddress;
  let driverX: number | null | undefined;
  let driverY: number | null | undefined;
  let driverPlaceId: string | null | undefined;
  if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
    driverX = autoLon;
    driverY = autoLat;
    driverPlaceId = placeId || null;
  } else if (nextDriverAddress !== undefined) {
    if (nextDriverAddress) {
    const coords = await mapsProvider.geocode(nextDriverAddress);
    if (coords) {
    driverX = coords.x;
    driverY = coords.y;
    driverPlaceId = coords.placeId || null;
   } else {
   driverX = null;
   driverY = null;
   driverPlaceId = null;
   }
   } else {
   driverX = null;
   driverY = null;
   driverPlaceId = null;
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
  formattedAddress: formattedAddress !== undefined ? formattedAddress : undefined,
  driverX,
  driverY,
  placeId: driverPlaceId !== undefined ? driverPlaceId : undefined,
  },
  });

  await audit({ userId: auth.session.userId, role: auth.session.role, action: "UPDATE", entity: "Cab", entityId: id, before: cabBefore, after: { vehicleNumber: updatedCab.vehicleNumber, driverName: updatedCab.driverName }, ip });
  console.info("[api] ✅ PATCH /api/cabs/manage — OK", { vehicleNumber: updatedCab.vehicleNumber, id, userId: auth.session.userId, ip });
  return NextResponse.json(updatedCab);
  } catch (e) {
  console.error("[api] ❌ PATCH /api/cabs/manage — Failed", { ip }, e);
  return NextResponse.json({ error: "Failed to update cab details" }, { status: 500 });
  }
}
