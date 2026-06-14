export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assignZone } from "@/lib/zones";
import { requireApiRole } from "@/lib/apiAuth";

function reqIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const employees = await prisma.employee.findMany({
      where: {
        x: { not: undefined },
        y: { not: undefined },
      },
      select: { id: true, x: true, y: true },
    });

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const emp of employees) {
      if (!Number.isFinite(emp.x) || !Number.isFinite(emp.y)) {
        skipped++;
        continue;
      }
      try {
        const zoneData = assignZone(emp.x, emp.y);
        await prisma.employee.update({
          where: { id: emp.id },
          data: {
            zone: zoneData.zone,
            subZone: zoneData.subZone,
            distanceRing: zoneData.distanceRing,
            distanceFromDepotKm: zoneData.distanceFromDepotKm,
          },
        });
        updated++;
      } catch (e: any) {
        errors.push(`${emp.id}: ${e?.message || "update failed"}`);
      }
    }

    console.info("[api] ✅ POST /api/admin/backfill-zones — OK", { updated, skipped, userId: auth.session.userId, ip });
    return NextResponse.json({ updated, skipped, errors });
  } catch (e) {
    console.error("[api] ❌ POST /api/admin/backfill-zones — Failed", { ip }, e);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
