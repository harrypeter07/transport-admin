import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";
import { mapsProvider } from "@/lib/maps";
import { audit } from "@/lib/audit";

function reqIp(req: NextRequest | Request): string {
  if (req instanceof NextRequest) {
    return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  }
  return (req as any).headers?.get?.("x-forwarded-for") || (req as any).headers?.get?.("x-real-ip") || "unknown";
}

export async function GET(req: NextRequest) {
  const session = await verifySession();
  const ip = reqIp(req);
  if (session.role !== "ADMIN" && session.role !== "MANAGER") {
    console.warn("[api] 🔒 GET /api/cabs — UNAUTHORIZED", { role: session.role, ip });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const shiftId = searchParams.get("shiftId");

  try {
    const cabs = await prisma.cab.findMany({
      where: {
        status: { not: "INACTIVE" },
        ...(search && {
          OR: [
            { vehicleNumber: { contains: search, mode: "insensitive" } },
            { vendor: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(shiftId && { shifts: { some: { id: shiftId } } }),
      },
      include: {
        shifts: true,
      },
      orderBy: { vehicleNumber: "asc" },
    });
    return NextResponse.json(cabs);
  } catch (e) {
    console.error("[api] ❌ GET /api/cabs — Failed to fetch", { ip, search: search || undefined }, e);
    return NextResponse.json({ error: "Failed to fetch cabs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifySession();
  const ip = reqIp(req);
  if (session.role !== "ADMIN") {
    console.warn("[api] 🔒 POST /api/cabs — UNAUTHORIZED", { role: session.role, ip });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { vehicleNumber, capacity, vendor, status, driverName, driverPhone, licenseNumber, driverAddress, shiftIds } = body;
    const formattedAddress = body.formattedAddress || driverAddress;
    const placeId = body.placeId || null;
    const autoLat = body.lat ? Number(body.lat) : null;
    const autoLon = body.lon ? Number(body.lon) : null;

    let finalDriverX = null;
    let finalDriverY = null;
    let finalDriverPlaceId = null;
    if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
      finalDriverX = autoLon;
      finalDriverY = autoLat;
      finalDriverPlaceId = placeId;
    } else if (driverAddress) {
      const coords = await mapsProvider.geocode(driverAddress);
      if (coords) {
        finalDriverX = coords.x;
        finalDriverY = coords.y;
        finalDriverPlaceId = coords.placeId || null;
      }
    }

    const newCab = await prisma.$transaction(async (tx) => {
      let userId: string | null = null;
      
      const finalDriverName = driverName && driverName !== "Unassigned" ? driverName : `Driver ${vehicleNumber}`;
      const sanitizedName = finalDriverName.toLowerCase().replace(/[^a-z0-9]/g, "");
      let generatedEmail = `${sanitizedName}@transitadmin.com`;
      
      let existingUser = await tx.user.findUnique({ where: { email: generatedEmail } });
      if (existingUser) {
          generatedEmail = `${sanitizedName}_${vehicleNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@transitadmin.com`;
      }
      
      // We must dynamically import bcrypt in API route, or better, we can assume it's imported at the top.
      // Wait, bcrypt is not imported at the top of cabs/route.ts! I should add the import!
      // I will do that in a separate replacement or modify this.
      // Actually I should just use `require("bcryptjs")` inline or import it.
      const bcrypt = require("bcryptjs");
      const defaultPassword = await bcrypt.hash("Welcome@123", 10);

      const user = await tx.user.create({
        data: {
          email: generatedEmail,
          password: defaultPassword,
          name: finalDriverName,
          role: "DRIVER",
          requiresPasswordChange: true,
        },
      });
      userId = user.id;

      return await tx.cab.create({
        data: {
          vehicleNumber,
          capacity: parseInt(capacity),
          vendor,
          status,
          driverName: finalDriverName,
          driverPhone: driverPhone || "",
          licenseNumber: licenseNumber || "",
          driverAddress: driverAddress || null,
          formattedAddress,
          driverX: finalDriverX,
          driverY: finalDriverY,
          placeId: finalDriverPlaceId,
          userId,
          shifts: shiftIds && shiftIds.length > 0 ? {
            connect: shiftIds.map((id: string) => ({ id }))
          } : undefined
        },
        include: { shifts: true }
      });
    });

    await audit({ userId: session.userId, role: session.role, action: "CREATE", entity: "Cab", entityId: newCab.id, after: { vehicleNumber: newCab.vehicleNumber }, ip });
    console.info("[api] ✅ POST /api/cabs — OK", { vehicleNumber: newCab.vehicleNumber, id: newCab.id, userId: session.userId, ip });
    return NextResponse.json(newCab);
  } catch (error: any) {
    console.error("[api] ❌ POST /api/cabs — Failed", { ip }, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
