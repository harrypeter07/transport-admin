export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { verifySession } from "@/lib/dal";

import prisma from "@/lib/db";

import { assignZone, haversineKm } from "@/lib/zones";

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

    console.warn("[api] 🔒 GET /api/pickup-points — UNAUTHORIZED", { role: session.role, ip });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  try {

    const { searchParams } = new URL(req.url);
    const nearX = searchParams.get("nearX");
    const nearY = searchParams.get("nearY");
    const radiusKm = Number(searchParams.get("radiusKm") || "3");

    const pickupPoints = await prisma.pickupPoint.findMany({

      include: {

        employees: {

          where: { status: "ACTIVE" },

          select: { id: true, name: true, zone: true, subZone: true },

        },

      },

      orderBy: { name: "asc" },

    });



    let result = pickupPoints.map(({ employees, ...point }) => ({

      ...point,

      employeeCount: employees.length,

      employees,

    }));

    if (nearX && nearY && Number.isFinite(Number(nearX)) && Number.isFinite(Number(nearY))) {
      const nx = Number(nearX);
      const ny = Number(nearY);
      result = result
        .map((pp) => ({
          ...pp,
          distanceKm: haversineKm(ny, nx, pp.y, pp.x).toFixed(1),
          _dist: haversineKm(ny, nx, pp.y, pp.x),
        }))
        .filter((pp) => pp._dist <= radiusKm)
        .sort((a, b) => a._dist - b._dist)
        .map(({ _dist, ...pp }) => pp);
    }



    return NextResponse.json(result);

  } catch (e) {

    console.error("[api] ❌ GET /api/pickup-points — Failed to fetch", { ip }, e);

    return NextResponse.json({ error: "Failed to fetch pickup points" }, { status: 500 });

  }

}



export async function POST(req: NextRequest) {

  const session = await verifySession();

  const ip = reqIp(req);

  if (session.role !== "ADMIN") {

    console.warn("[api] 🔒 POST /api/pickup-points — UNAUTHORIZED", { role: session.role, ip });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  try {

    const body = await req.json();

    const { name, x, y, address, landmark } = body;



    if (!name || typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {

      return NextResponse.json({ error: "name, x (longitude), and y (latitude) are required" }, { status: 400 });

    }



    const zoneData = assignZone(x, y);



    const pickupPoint = await prisma.pickupPoint.create({

      data: {

        name: String(name).trim(),

        x,

        y,

        zone: zoneData.zone,

        subZone: zoneData.subZone,

        distanceRing: zoneData.distanceRing,

        address: address ? String(address).trim() : null,

        landmark: landmark ? String(landmark).trim() : null,

      },

    });



    await audit({

      userId: session.userId,

      role: session.role,

      action: "CREATE",

      entity: "PickupPoint",

      entityId: pickupPoint.id,

      after: { name: pickupPoint.name, zone: pickupPoint.zone },

      ip,

    });

    console.info("[api] ✅ POST /api/pickup-points — OK", { id: pickupPoint.id, userId: session.userId, ip });



    return NextResponse.json(pickupPoint);

  } catch (error: any) {

    console.error("[api] ❌ POST /api/pickup-points — Failed", { ip }, error);

    return NextResponse.json({ error: error.message }, { status: 500 });

  }

}


