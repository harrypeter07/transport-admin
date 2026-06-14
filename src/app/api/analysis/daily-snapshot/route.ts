export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

type SnapshotSource = "MANUAL_EXCEL" | "OPTIMIZED";

function parseStats(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

function computeMetrics(routes: any[], source: SnapshotSource) {
  const cabIds = new Set<string>();
  let totalEmployees = 0;
  let totalDistance = 0;
  let violationCount = 0;
  let noShowCount = 0;

  for (const route of routes) {
    if (route.cabId) cabIds.add(route.cabId);
    const stops = route.stops || [];
    totalEmployees += stops.filter((s: any) => s.status !== "SKIPPED" && s.status !== "NO SHOW").length;
    noShowCount += stops.filter((s: any) => s.status === "NO SHOW" || s.status === "SKIPPED").length;
    totalDistance += route.totalDistance || 0;
    violationCount += (route.violations || []).length;
  }

  const cabCount = cabIds.size || routes.length;
  const avgFill = cabCount > 0 ? Math.round((totalEmployees / cabCount) * 10) / 10 : 0;

  return {
    source,
    cabCount,
    totalEmployees,
    avgFill,
    violationCount,
    noShowCount,
    totalDistance: Math.round(totalDistance * 10) / 10,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { date, shiftId, source } = body as {
      date: string;
      shiftId?: string;
      source: SnapshotSource;
    };

    if (!date || !source || !["MANUAL_EXCEL", "OPTIMIZED"].includes(source)) {
      return NextResponse.json({ error: "date and source (MANUAL_EXCEL | OPTIMIZED) are required" }, { status: 400 });
    }

    let routes: any[] = [];
    if (source === "MANUAL_EXCEL") {
      const baseline = await prisma.baselineRoute.findFirst({
        where: { date },
        orderBy: { createdAt: "desc" },
      });
      if (!baseline) {
        return NextResponse.json({ error: "No Excel baseline for this date" }, { status: 404 });
      }
      routes =
        typeof baseline.routeData === "string" ? JSON.parse(baseline.routeData) : baseline.routeData;
    } else {
      const where: { date: string; shiftId?: string } = { date };
      const dbRoutes = await prisma.route.findMany({
        where: shiftId ? { date, shiftId } : { date },
        include: {
          stops: { include: { employee: true } },
          violations: true,
          cab: true,
        },
      });
      routes = dbRoutes.map((r) => ({
        cabId: r.cabId,
        vehicleNumber: r.cab?.vehicleNumber,
        totalDistance: r.totalDistance,
        stops: r.stops.map((s) => ({
          employeeId: s.employeeId,
          status: s.status,
          employee: s.employee,
        })),
        violations: r.violations,
      }));
    }

    if (shiftId) {
      routes = routes.filter((r) => !r.shiftId || r.shiftId === shiftId);
    }

    const metrics = computeMetrics(routes, source);

    const snapshot = await prisma.optimizedRouteSnapshot.create({
      data: {
        optimizationId: `${source.toLowerCase()}_${Date.now()}`,
        date,
        routeData: JSON.stringify(routes),
        statistics: JSON.stringify(metrics),
      },
    });

    return NextResponse.json({ success: true, snapshotId: snapshot.id, metrics });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ POST /api/analysis/daily-snapshot", e);
    return NextResponse.json({ error: "Failed to save snapshot", details: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to") || from;

    if (!from) {
      return NextResponse.json({ error: "from date query param is required" }, { status: 400 });
    }

    const snapshots = await prisma.optimizedRouteSnapshot.findMany({
      where: { date: { gte: from, lte: to || from } },
      orderBy: [{ date: "asc" }, { createdAt: "desc" }],
    });

    const byDate = new Map<
      string,
      { date: string; MANUAL_EXCEL?: Record<string, unknown>; OPTIMIZED?: Record<string, unknown> }
    >();

    for (const snap of snapshots) {
      const stats = parseStats(snap.statistics);
      const source = (stats.source as SnapshotSource) || "OPTIMIZED";
      if (!byDate.has(snap.date)) {
        byDate.set(snap.date, { date: snap.date });
      }
      const entry = byDate.get(snap.date)!;
      if (source === "MANUAL_EXCEL" && !entry.MANUAL_EXCEL) {
        entry.MANUAL_EXCEL = { ...stats, snapshotId: snap.id, createdAt: snap.createdAt };
      } else if (source === "OPTIMIZED" && !entry.OPTIMIZED) {
        entry.OPTIMIZED = { ...stats, snapshotId: snap.id, createdAt: snap.createdAt };
      }
    }

    const baselines = await prisma.baselineRoute.findMany({
      where: { date: { gte: from, lte: to || from } },
      orderBy: { createdAt: "desc" },
    });

    for (const baseline of baselines) {
      if (!byDate.has(baseline.date)) {
        byDate.set(baseline.date, { date: baseline.date });
      }
      const entry = byDate.get(baseline.date)!;
      if (!entry.MANUAL_EXCEL) {
        const stats = parseStats(baseline.statistics);
        entry.MANUAL_EXCEL = { ...stats, source: "MANUAL_EXCEL", snapshotId: baseline.snapshotId };
      }
    }

    return NextResponse.json({
      snapshots: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ GET /api/analysis/daily-snapshot", e);
    return NextResponse.json({ error: "Failed to fetch snapshots", details: message }, { status: 500 });
  }
}
