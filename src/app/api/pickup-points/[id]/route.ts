export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { verifySession } from "@/lib/dal";

import prisma from "@/lib/db";

import { assignZone } from "@/lib/zones";

import { audit } from "@/lib/audit";



function reqIp(req: NextRequest | Request): string {

  return (req as any).headers?.get?.("x-forwarded-for") || (req as any).headers?.get?.("x-real-ip") || "unknown";

}



export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const session = await verifySession();

  const ip = reqIp(_req);

  if (session.role !== "ADMIN" && session.role !== "MANAGER") {

    console.warn("[api] 🔒 GET /api/pickup-points/[id] — UNAUTHORIZED", { role: session.role, ip });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  try {

    const { id } = await params;

    const pickupPoint = await prisma.pickupPoint.findUnique({

      where: { id },

      include: {

        employees: {

          where: { status: "ACTIVE" },

          select: {

            id: true,

            name: true,

            employeeCode: true,

            phone: true,

            zone: true,

            subZone: true,

          },

        },

      },

    });



    if (!pickupPoint) {

      return NextResponse.json({ error: "Pickup point not found" }, { status: 404 });

    }



    return NextResponse.json(pickupPoint);

  } catch (e) {

    console.error("[api] ❌ GET /api/pickup-points/[id] — Failed", { ip }, e);

    return NextResponse.json({ error: "Failed to fetch pickup point" }, { status: 500 });

  }

}



export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const session = await verifySession();

  const ip = reqIp(req);

  if (session.role !== "ADMIN") {

    console.warn("[api] 🔒 PATCH /api/pickup-points/[id] — UNAUTHORIZED", { role: session.role, ip });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  try {

    const { id } = await params;

    const before = await prisma.pickupPoint.findUnique({ where: { id } });

    if (!before) {

      return NextResponse.json({ error: "Pickup point not found" }, { status: 404 });

    }



    const body = await req.json();

    const { name, x, y, address, landmark } = body;



    let nextX = before.x;

    let nextY = before.y;

    let zoneData = {

      zone: before.zone,

      subZone: before.subZone,

      distanceRing: before.distanceRing,

    };



    if (x !== undefined && y !== undefined && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {

      nextX = Number(x);

      nextY = Number(y);

      zoneData = assignZone(nextX, nextY);

    }



    const updated = await prisma.pickupPoint.update({

      where: { id },

      data: {

        ...(name !== undefined && { name: String(name).trim() }),

        ...(x !== undefined && y !== undefined && { x: nextX, y: nextY }),

        ...(x !== undefined && y !== undefined

          ? {

              zone: zoneData.zone,

              subZone: zoneData.subZone,

              distanceRing: zoneData.distanceRing,

            }

          : {}),

        ...(address !== undefined && { address: address ? String(address).trim() : null }),

        ...(landmark !== undefined && { landmark: landmark ? String(landmark).trim() : null }),

      },

    });



    await audit({

      userId: session.userId,

      role: session.role,

      action: "UPDATE",

      entity: "PickupPoint",

      entityId: id,

      before,

      after: updated,

      ip,

    });

    console.info("[api] ✅ PATCH /api/pickup-points/[id] — OK", { id, userId: session.userId, ip });



    return NextResponse.json(updated);

  } catch (error: any) {

    console.error("[api] ❌ PATCH /api/pickup-points/[id] — Failed", { ip }, error);

    return NextResponse.json({ error: error.message }, { status: 500 });

  }

}



export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

  const session = await verifySession();

  const ip = reqIp(_req);

  if (session.role !== "ADMIN") {

    console.warn("[api] 🔒 DELETE /api/pickup-points/[id] — UNAUTHORIZED", { role: session.role, ip });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  try {

    const { id } = await params;

    const before = await prisma.pickupPoint.findUnique({

      where: { id },

      include: { _count: { select: { employees: true } } },

    });



    if (!before) {

      return NextResponse.json({ error: "Pickup point not found" }, { status: 404 });

    }



    if (before._count.employees > 0) {

      return NextResponse.json(

        {

          error: "PICKUP_POINT_OCCUPIED",

          message: `Reassign ${before._count.employees} employees before deleting this pickup point`,

        },

        { status: 400 }

      );

    }



    await prisma.pickupPoint.delete({ where: { id } });



    await audit({

      userId: session.userId,

      role: session.role,

      action: "DELETE",

      entity: "PickupPoint",

      entityId: id,

      before,

      ip,

    });

    console.info("[api] ✅ DELETE /api/pickup-points/[id] — OK", { id, userId: session.userId, ip });



    return NextResponse.json({ success: true });

  } catch (error: any) {

    console.error("[api] ❌ DELETE /api/pickup-points/[id] — Failed", { ip }, error);

    return NextResponse.json({ error: error.message }, { status: 500 });

  }

}


