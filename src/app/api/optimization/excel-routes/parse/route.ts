export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { parseExcelBufferToRoutes, haversineKm, resolveWorkbookSheetName } from "@/lib/excelParser";
import { geocodePlace, makeDepot } from "@/lib/optimization";
import { invalidateRoutesCache, invalidateMetricsCache } from "@/lib/cache";
import { resolveUploadBuffer } from "@/lib/uploadStorage";
import * as xlsx from "xlsx";

async function readUploadBuffer(
  req: NextRequest,
): Promise<
  | { ok: true; buffer: Buffer; sheetName: string; dateOverride?: string }
  | { ok: false; response: NextResponse }
> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const sheetName = String(formData.get("sheetName") || "");
    const dateOverride = String(formData.get("date") || "").trim() || undefined;
    const fileKey = String(formData.get("fileKey") || "").trim();
    const file = formData.get("file") as File | null;

    if (!sheetName.trim()) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "sheetName is required" },
          { status: 400 },
        ),
      };
    }

    if (file && file.size > 0) {
      return {
        ok: true,
        buffer: Buffer.from(await file.arrayBuffer()),
        sheetName,
        dateOverride,
      };
    }

    if (fileKey) {
      const buffer = resolveUploadBuffer(fileKey);
      if (buffer) {
        return { ok: true, buffer, sheetName, dateOverride };
      }
    }

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Upload file not found",
          details:
            "Re-select the Excel file and save again. Serverless hosts cannot keep uploads between requests.",
        },
        { status: 404 },
      ),
    };
  }

  const body = await req.json();
  const { fileKey, sheetName, date: dateOverride } = body;

  if (!fileKey || !sheetName) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "fileKey and sheetName are required" },
        { status: 400 },
      ),
    };
  }

  const buffer = resolveUploadBuffer(fileKey);
  if (!buffer) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Upload file with key ${fileKey} not found`,
          details:
            "Re-upload the Excel file (multipart) so the server can parse it directly.",
        },
        { status: 404 },
      ),
    };
  }

  return { ok: true, buffer, sheetName, dateOverride };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const upload = await readUploadBuffer(req);
    if (!upload.ok) return upload.response;

    const { buffer, sheetName: requestedSheet, dateOverride } = upload;

    const workbook = xlsx.read(buffer, { type: "buffer" });
    let resolvedSheetName: string;
    try {
      resolvedSheetName = resolveWorkbookSheetName(
        workbook.SheetNames,
        requestedSheet,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: "Invalid sheet", details: message }, { status: 400 });
    }

    const [dbEmployees, dbShifts, settings] = await Promise.all([
      prisma.employee.findMany({ where: { status: "ACTIVE" } }),
      prisma.shift.findMany(),
      prisma.systemSettings.findFirst(),
    ]);

    const depotLat = settings?.defaultDepotLat ?? 21.0625;
    const depotLng = settings?.defaultDepotLng ?? 79.0526;
    const depot = makeDepot(depotLat, depotLng);

    const { routes: parsedRoutes, summary } = await parseExcelBufferToRoutes(
      buffer,
      dbEmployees,
      dbShifts,
      depotLat,
      depotLng,
      async (data) => {
        const existing = await prisma.shift.findFirst({
          where: { startTime: data.startTime },
        });
        if (existing) return existing;
        return prisma.shift.create({
          data,
        });
      },
      { sheetName: resolvedSheetName },
    );

    // Geocoding pass for unmatched employee coordinates (x ≈ 0, y ≈ 0)
    const geocodeCache = new Map<string, { x: number; y: number } | null>();
    const baselineRoutes = [];

    for (const route of parsedRoutes) {
      const stops = [];
      for (const stop of route.stops) {
        const emp = stop.employee;
        if (Math.abs(emp.x) < 0.01 && Math.abs(emp.y) < 0.01) {
          let coords = geocodeCache.get(emp.address);
          if (coords === undefined) {
            try {
              const result = await geocodePlace(emp.address, "Nagpur", "India", depot, 70);
              if (result) {
                coords = { x: result.x, y: result.y };
              } else {
                coords = null;
              }
            } catch (err) {
              console.error(`Geocoding failed for address: ${emp.address}`, err);
              coords = null;
            }
            geocodeCache.set(emp.address, coords);
          }

          if (coords) {
            emp.x = coords.x;
            emp.y = coords.y;
            stop.employee.x = coords.x;
            stop.employee.y = coords.y;
          } else {
            emp.x = depotLng;
            emp.y = depotLat;
            stop.employee.x = depotLng;
            stop.employee.y = depotLat;
          }
        }
        stops.push(stop);
      }
      baselineRoutes.push({
        ...route,
        stops,
      });
    }

    // Recompute totalDistance and totalDuration using haversineKm
    for (const route of baselineRoutes) {
      let cumDist = 0;
      let prevPt = depot;
      for (const stop of route.stops) {
        const pt = { x: stop.employee.x, y: stop.employee.y };
        const leg = haversineKm(prevPt, pt);
        cumDist += leg;
        prevPt = pt;
      }
      const depotLeg = haversineKm(prevPt, depot);
      cumDist += depotLeg;

      route.totalDistance = Math.round(cumDist * 10) / 10;
      route.totalDuration = Math.round(cumDist / 0.5); // speed fallback: 0.5 km/min
    }

    // Compute safety violations and underfilled route indicators
    const safetyViolations: string[] = [];
    const underfilled: Array<{ route: string; count: number }> = [];

    for (const r of baselineRoutes) {
      const activeStops = r.stops.filter((s) => s.status !== "SKIPPED");
      if (activeStops.length === 0) continue;

      if (activeStops.length < 3) {
        underfilled.push({ route: r.routeNo, count: activeStops.length });
      }

      if (!r.hasEscort) {
        const females = activeStops.filter((s) => s.employee.gender === "FEMALE");
        if (females.length > 0) {
          const isSoleFemale = activeStops.length === 1 && activeStops[0].employee.gender === "FEMALE";
          const allFemale = activeStops.every((s) => s.employee.gender === "FEMALE");
          const isFemaleFirst = activeStops[0].employee.gender === "FEMALE" && !allFemale;
          const isFemaleLast = activeStops[activeStops.length - 1].employee.gender === "FEMALE" && !allFemale;

          if (isSoleFemale || (r.isPickup && isFemaleFirst) || (!r.isPickup && isFemaleLast)) {
            safetyViolations.push(r.routeNo);
          }
        }
      }
    }

    const date = dateOverride || new Date().toISOString().split("T")[0];

    const finalSummary = {
      source: "MANUAL_EXCEL",
      sheetName: resolvedSheetName,
      date,
      routeCount: baselineRoutes.length,
      cabsUsed: baselineRoutes.length,
      presentCount: summary.employeeCount,
      presentUniqueCount: summary.employeeCount,
      absentCount: summary.noShowCount,
      noShowCount: summary.noShowCount,
      safetyViolations,
      underfilled,
      absentEmployeeCodes: summary.absentEmployeeCodes || [],
      unmatchedEmployeeCodes: summary.unmatchedEmployeeCodes || [],
    };

    // Persist parsed baseline
    await prisma.baselineRoute.deleteMany({ where: { date } });
    await prisma.baselineRoute.create({
      data: {
        snapshotId: `baseline_parsed_${Date.now()}`,
        date,
        routeData: JSON.stringify(baselineRoutes),
        statistics: JSON.stringify(finalSummary),
      },
    });

    invalidateRoutesCache();
    invalidateMetricsCache();

    return NextResponse.json({
      success: true,
      ...finalSummary,
      routes: baselineRoutes,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ POST /api/optimization/excel-routes/parse", e);
    return NextResponse.json(
      { error: "Failed to parse selected Excel sheet", details: message },
      { status: 500 },
    );
  }
}
