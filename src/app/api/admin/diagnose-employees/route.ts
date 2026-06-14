export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiRole } from "@/lib/apiAuth";
import { assignZone } from "@/lib/zones";

const NAGPUR_BOUNDS = { latMin: 20.7, latMax: 21.5, lngMin: 78.7, lngMax: 79.5 };

function isSuspicious(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  if (x === 0 || y === 0) return true;
  if (y < NAGPUR_BOUNDS.latMin || y > NAGPUR_BOUNDS.latMax) return true;
  if (x < NAGPUR_BOUNDS.lngMin || x > NAGPUR_BOUNDS.lngMax) return true;
  if (x > 20 && x < 22 && y > 78 && y < 80) return true;
  return false;
}

function looksSwapped(x: number, y: number): boolean {
  return x > 20 && x < 22 && y > 78 && y < 80;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    let fixedCount = 0;
    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        x: true,
        y: true,
        address: true,
      },
    });

    for (const emp of employees) {
      if (looksSwapped(emp.x, emp.y)) {
        const zoneData = assignZone(emp.y, emp.x);
        await prisma.employee.update({
          where: { id: emp.id },
          data: {
            x: emp.y,
            y: emp.x,
            zone: zoneData.zone,
            subZone: zoneData.subZone,
            distanceRing: zoneData.distanceRing,
            distanceFromDepotKm: zoneData.distanceFromDepotKm,
          },
        });
        fixedCount++;
      }
    }

    const refreshed = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        x: true,
        y: true,
        address: true,
      },
    });

    const withCoords = refreshed.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y)).length;
    const withZeroCoords = refreshed.filter((e) => e.x === 0 || e.y === 0).length;
    const withNullCoords = refreshed.filter(
      (e) => e.x == null || e.y == null || !Number.isFinite(e.x) || !Number.isFinite(e.y)
    ).length;

    const stillSuspicious = refreshed
      .filter((e) => isSuspicious(e.x, e.y))
      .map((e) => ({
        id: e.id,
        name: e.name,
        employeeCode: e.employeeCode,
        x: e.x,
        y: e.y,
        address: e.address,
      }));

    return NextResponse.json({
      total: refreshed.length,
      withCoords,
      withZeroCoords,
      withNullCoords,
      suspiciousCoords: stillSuspicious,
      fixedCount,
      stillSuspicious,
    });
  } catch (e) {
    console.error("[api] ❌ GET /api/admin/diagnose-employees — Failed", e);
    return NextResponse.json({ error: "Diagnosis failed" }, { status: 500 });
  }
}
