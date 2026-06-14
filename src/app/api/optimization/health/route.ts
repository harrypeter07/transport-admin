export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { getExcelFilterForDate } from "@/lib/excelFilter";
import {
  runPreflightChecks,
  makeDepot,
  type OptimizeEmployee,
  type OptimizeCab,
  type PreflightWarning,
} from "@/lib/optimization";

function summarizePreflightWarnings(warnings: PreflightWarning[]): PreflightWarning[] {
  const overlapByZone = new Map<string, Extract<PreflightWarning, { type: "DRIVER_OVERLAP" }> & { pairCount: number }>();
  const summarized: PreflightWarning[] = [];

  for (const w of warnings) {
    if (w.type !== "DRIVER_OVERLAP") {
      summarized.push(w);
      continue;
    }
    const existing = overlapByZone.get(w.zone);
    if (!existing) {
      overlapByZone.set(w.zone, { ...w, pairCount: 1 });
    } else {
      existing.pairCount += 1;
    }
  }

  for (const w of overlapByZone.values()) {
    const vehicles = w.vehicleNumbers?.filter(Boolean).join(", ") || w.driverIds.slice(0, 2).join(", ");
    const extra = w.pairCount > 1 ? ` (+${w.pairCount - 1} more pairs)` : "";
    summarized.push({
      type: "DRIVER_OVERLAP",
      driverIds: w.driverIds,
      vehicleNumbers: w.vehicleNumbers,
      zone: w.zone,
      distanceKm: w.distanceKm,
      suggestion: `${w.suggestion}${extra} — cabs: ${vehicles}`,
    });
  }

  return summarized.slice(0, 12);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const osrmBaseUrl = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
    const provider = process.env.ROUTING_PROVIDER || "auto";
    const googleKey = process.env.GOOGLE_MAPS_API_KEY || "";

    const testPoints = [
      { x: 79.0526, y: 21.0625 },
      { x: 79.0882, y: 21.1458 },
    ];
    const coords = testPoints.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(";");
    const url = `${osrmBaseUrl}/table/v1/driving/${coords}?annotations=duration,distance`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const startTime = Date.now();

    let osrmOk = false;
    let errorMsg = "";
    let testResult = null;

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.code === "Ok" && Array.isArray(data.distances) && Array.isArray(data.durations)) {
          osrmOk = true;
          testResult = {
            distanceKm: Math.round((data.distances[0][1] / 1000) * 10) / 10,
            durationMin: Math.max(1, Math.round(data.durations[0][1] / 60)),
          };
        } else {
          errorMsg = `OSRM returned code: ${data.code}`;
        }
      } else {
        errorMsg = `HTTP ${res.status}`;
      }
    } catch (err) {
      errorMsg =
        err instanceof DOMException && err.name === "AbortError"
          ? "timeout (5s)"
          : err instanceof Error
            ? err.message
            : "Unknown error";
    } finally {
      clearTimeout(timeoutId);
    }

    const elapsedMs = Date.now() - startTime;

    const { searchParams } = new URL(req.url);
    const shiftId = searchParams.get("shiftId");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    let preflightWarnings: ReturnType<typeof runPreflightChecks> = [];

    if (shiftId) {
      const settings = await prisma.systemSettings.findUnique({ where: { id: "default" } });
      const depot = settings
        ? makeDepot(settings.defaultDepotLat, settings.defaultDepotLng)
        : makeDepot(21.0625, 79.0526);

      let dbEmployees = await prisma.employee.findMany({
        where: { status: "ACTIVE", shiftId },
        include: { pickupPoint: true },
      });

      let dbCabs = await prisma.cab.findMany({
        where: { status: "AVAILABLE", shifts: { some: { id: shiftId } } },
      });

      const excelFilter = getExcelFilterForDate(date);
      if (excelFilter) {
        const VARIATION_MAP: Record<string, string> = {
          "devalla kumar": "devalla sudheer kumar",
          "devalla sudheer kumar": "devalla sudheer kumar",
          "meghana u": "meghana b u",
          "meghana b u": "meghana b u",
          "prashanth pathlavath": "prashant pathlavat",
          "prashant pathlavat": "prashant pathlavat",
          "vajja prakash": "vajja bhanu prakash",
          "vajja bhanu prakash": "vajja bhanu prakash"
        };
        const normalizeName = (name: string) => {
          const lower = name.trim().toLowerCase();
          return VARIATION_MAP[lower] || lower;
        };
        dbEmployees = dbEmployees.filter(emp => {
          const normDb = normalizeName(emp.name);
          return excelFilter.employeeNames.has(normDb);
        });
        dbCabs = dbCabs.filter(cab => {
          return excelFilter.cabVehicleNumbers.has(cab.vehicleNumber.trim().toUpperCase());
        });
      }

      const optEmployees: OptimizeEmployee[] = dbEmployees.map((emp) => {
        const usePickup = emp.pickupPointId && emp.pickupPoint;
        return {
          id: emp.id,
          name: emp.name,
          gender: emp.gender as "MALE" | "FEMALE",
          x: usePickup ? emp.pickupPoint!.x : emp.x,
          y: usePickup ? emp.pickupPoint!.y : emp.y,
          address: usePickup ? emp.pickupPoint!.address || emp.pickupPoint!.name : emp.address,
          department: emp.department,
          phone: emp.phone,
          pickupPointId: emp.pickupPointId,
          zone: emp.zone,
          subZone: emp.subZone,
        };
      });

      const optCabs: OptimizeCab[] = dbCabs.map((cab) => ({
        id: cab.id,
        vehicleNumber: cab.vehicleNumber,
        capacity: cab.capacity,
        vendor: cab.vendor,
        driverName: cab.driverName || "Unassigned",
        driverPhone: cab.driverPhone || "N/A",
        startPoint:
          typeof cab.driverX === "number" && typeof cab.driverY === "number"
            ? { x: cab.driverX, y: cab.driverY }
            : depot,
        assignedZone: cab.assignedZone,
      }));

      preflightWarnings = summarizePreflightWarnings(runPreflightChecks(optEmployees, optCabs, depot));
    }

    if (!osrmOk) {
      return NextResponse.json({
        status: "API_ERROR",
        message: `OSRM Table API test failed: ${errorMsg}`,
        elapsedMs,
        provider,
        googleMapsKeyConfigured: !!googleKey,
        date,
        preflightWarnings,
      });
    }

    return NextResponse.json({
      status: "OK",
      message: "OSRM Table API is reachable and returning data",
      elapsedMs,
      provider,
      googleMapsKeyConfigured: !!googleKey,
      testResult,
      date,
      preflightWarnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ status: "ERROR", message }, { status: 500 });
  }
}
