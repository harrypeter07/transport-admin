export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { listGtlpSheets } from "@/lib/gtplParser";
import { saveUploadBuffer } from "@/lib/uploadStorage";

import { getCachedOptimizationMetrics } from "@/lib/cache";

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
        error: `No baseline found for date ${date}. Upload GTPL sheet for this date first.`,
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

    const optimizationRuns = await getCachedOptimizationMetrics(date);

    return NextResponse.json({
      routes: parsedRoutes,
      optimizedRoutes: parsedOptimized,
      totalRoutes: parsedRoutes.length,
      snapshotId: baseline.snapshotId,
      createdAt: baseline.createdAt,
      summary: statistics,
      dbLeaveCount,
      optimizationRuns,
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

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const fileKey = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const savedPath = saveUploadBuffer(fileKey, buffer);

    const sheets = listGtlpSheets(buffer);

    return NextResponse.json({
      sheets,
      fileKey,
      persisted: !!savedPath,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ POST /api/optimization/excel-routes", e);
    return NextResponse.json({ error: "Failed to upload Excel workbook", details: message }, { status: 500 });
  }
}
