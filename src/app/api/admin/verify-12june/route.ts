export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiRole } from "@/lib/apiAuth";
import { parseGtlpFileSheet, gtplWorkbookPath } from "@/lib/gtplParser";

const SEED_DATE = "2026-06-12";
const SHEET_NAME = "12-6-26";

export async function GET() {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const gtpl = parseGtlpFileSheet(SHEET_NAME, gtplWorkbookPath());

    const totalActiveEmployees = await prisma.employee.count({
      where: { status: "ACTIVE" },
    });

    const absentToday = await prisma.leaveRequest.count({
      where: {
        status: "APPROVED",
        startDate: { lte: SEED_DATE },
        endDate: { gte: SEED_DATE },
        applicant: { employee: { status: "ACTIVE" } },
      },
    });

    const presentToday = totalActiveEmployees - absentToday;

    const shiftsConfigured = await prisma.shift.count({
      where: { id: { in: ["shift-0500", "shift-0700", "shift-0900", "shift-1000", "shift-1300"] } },
    });

    const availableCabs = await prisma.cab.count({ where: { status: "AVAILABLE" } });

    const employeesWithCoords = await prisma.employee.count({
      where: { status: "ACTIVE", x: { not: 0 }, y: { not: 0 } },
    });

    const employeesWithZone = await prisma.employee.count({
      where: { status: "ACTIVE", zone: { not: null } },
    });

    const missingGeo = await prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ zone: null }, { x: 0, y: 0 }],
      },
      select: { name: true },
    });

    const warnings: string[] = missingGeo.map((e) => `${e.name} missing geocode/zone`);

    if (totalActiveEmployees !== gtpl.uniqueEmployeeCount) {
      warnings.push(
        `Active DB count (${totalActiveEmployees}) != GTPL unique (${gtpl.uniqueEmployeeCount})`
      );
    }
    if (absentToday !== gtpl.absentUniqueCount) {
      warnings.push(
        `DB absent (${absentToday}) != GTPL absent unique (${gtpl.absentUniqueCount})`
      );
    }
    if (availableCabs < gtpl.cabsUsed) {
      warnings.push(`Available cabs (${availableCabs}) < GTPL routes (${gtpl.cabsUsed})`);
    }

    return NextResponse.json({
      gtplExpected: {
        uniqueEmployees: gtpl.uniqueEmployeeCount,
        presentRows: gtpl.presentRowCount,
        absentRows: gtpl.absentRowCount,
        absentUnique: gtpl.absentUniqueCount,
        cabsUsed: gtpl.cabsUsed,
        safetyViolations: gtpl.safetyViolations.length,
        underfilled: gtpl.underfilled,
      },
      totalActiveEmployees,
      absentToday,
      presentToday,
      shiftsConfigured,
      availableCabs,
      employeesWithCoords,
      employeesWithZone,
      warnings,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ GET /api/admin/verify-12june", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
