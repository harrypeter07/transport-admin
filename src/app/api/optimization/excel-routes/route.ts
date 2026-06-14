export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { inferDateFromSheetName, parseExcelBufferToRoutes } from "@/lib/excelParser";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (!date) {
      return NextResponse.json({ error: "date query parameter is required" }, { status: 400 });
    }

    const baseline = await prisma.baselineRoute.findFirst({
      where: { date },
      orderBy: { createdAt: "desc" },
    });

    if (!baseline) {
      return NextResponse.json({
        routes: [],
        optimizedRoutes: [],
        totalRoutes: 0,
        error: `No baseline found for date ${date}. Upload an Excel sheet for this date first.`,
      });
    }

    const parsedRoutes =
      typeof baseline.routeData === "string" ? JSON.parse(baseline.routeData) : baseline.routeData;
    const statistics =
      typeof baseline.statistics === "string" ? JSON.parse(baseline.statistics) : baseline.statistics;

    const optimizedSnapshot = await prisma.optimizedRouteSnapshot.findFirst({
      where: { date },
      orderBy: { createdAt: "desc" },
    });

    let parsedOptimized: unknown[] = [];
    if (optimizedSnapshot) {
      parsedOptimized =
        typeof optimizedSnapshot.routeData === "string"
          ? JSON.parse(optimizedSnapshot.routeData)
          : optimizedSnapshot.routeData;
    }

    const dbLeaveCount = await prisma.leaveRequest.count({
      where: {
        status: "APPROVED",
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });

    return NextResponse.json({
      routes: parsedRoutes,
      optimizedRoutes: parsedOptimized,
      totalRoutes: parsedRoutes.length,
      snapshotId: baseline.snapshotId,
      createdAt: baseline.createdAt,
      summary: statistics,
      dbLeaveCount,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ GET /api/optimization/excel-routes", e);
    return NextResponse.json({ error: "Failed to fetch baseline routes", details: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sheetName = (formData.get("sheetName") as string) || "";
    let date = (formData.get("date") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!sheetName) {
      return NextResponse.json({ error: "sheetName is required" }, { status: 400 });
    }

    if (!date) {
      date = inferDateFromSheetName(sheetName) || new Date().toISOString().split("T")[0];
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const employees = await prisma.employee.findMany();
    const dbShifts = await prisma.shift.findMany();
    const settings = await prisma.systemSettings.findUnique({ where: { id: "default" } });
    const depotLat = settings?.defaultDepotLat ?? 21.0625;
    const depotLng = settings?.defaultDepotLng ?? 79.0526;

    const { routes, summary } = await parseExcelBufferToRoutes(
      buffer,
      employees,
      dbShifts,
      depotLat,
      depotLng,
      (data) => prisma.shift.create({ data }),
      { sheetName }
    );

    await prisma.baselineRoute.deleteMany({ where: { date } });

    const baseline = await prisma.baselineRoute.create({
      data: {
        snapshotId: `baseline_uploaded_${Date.now()}`,
        date,
        routeData: JSON.stringify(routes),
        statistics: JSON.stringify({
          ...summary,
          source: "MANUAL_EXCEL",
          sheetName,
          date,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      routes,
      date,
      totalRoutes: routes.length,
      snapshotId: baseline.snapshotId,
      routeCount: summary.routeCount,
      employeeCount: summary.employeeCount,
      noShowCount: summary.noShowCount,
      absentEmployeeCodes: summary.absentEmployeeCodes,
      unmatchedEmployeeCodes: summary.unmatchedEmployeeCodes,
      sharedStopCount: summary.sharedStopCount,
      sheetName: summary.sheetName,
      message: "Baseline updated successfully",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ POST /api/optimization/excel-routes", e);
    return NextResponse.json({ error: "Failed to parse and save Excel routes", details: message }, { status: 500 });
  }
}
