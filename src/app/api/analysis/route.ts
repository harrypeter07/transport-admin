export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDistance, makeDepot } from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";

function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function computeDateRange(date: string | null, startDate: string | null, endDate: string | null, period: string) {
  if (startDate && endDate) {
    return { gte: startDate, lte: endDate };
  }

  const baseDate = date || formatDate(new Date());
  const d = parseDate(baseDate);

  if (period === "DAILY") {
    return { gte: baseDate, lte: baseDate };
  }
  if (period === "WEEKLY") {
    const start = new Date(d);
    start.setDate(start.getDate() - 6);
    return { gte: formatDate(start), lte: baseDate };
  }
  if (period === "MONTHLY") {
    const start = new Date(d);
    start.setDate(start.getDate() - 29);
    return { gte: formatDate(start), lte: baseDate };
  }
  if (period === "ANNUAL" || period === "YEARLY") {
    const start = new Date(d);
    start.setDate(start.getDate() - 364);
    return { gte: formatDate(start), lte: baseDate };
  }
  return { gte: baseDate, lte: baseDate };
}

function normalizeRouteData(routeData: any): any[] {
  if (Array.isArray(routeData)) return routeData;
  if (routeData && !Array.isArray(routeData) && Array.isArray(routeData.routes)) return routeData.routes;
  return [];
}

function computeMetrics(routes: any[], depot: { x: number; y: number }, settings: any) {
  const UNIT_TO_KM = 1.2;
  const FUEL_PRICE = settings.fuelPricePerLitre;
  const MILEAGE = settings.avgFuelMileageKmL;
  const AVG_SPEED = 0.5;

  let totalOptimizedDistance = 0;
  let totalUnoptimizedDistance = 0;
  let totalOptimizedDuration = 0;
  let totalUnoptimizedDuration = 0;
  let totalPassengersCount = 0;
  const cabCapacityMap = new Map<string, number>();
  const routeBreakdowns: any[] = [];

  for (const route of routes) {
    const stops = route.stops || [];
    if (stops.length === 0) continue;

    const cabId = route.cabId || route.cab?.id || "";
    const cabCapacity = route.cab?.capacity || route.capacity || 4;

    if (cabId) {
      if (!cabCapacityMap.has(cabId)) {
        cabCapacityMap.set(cabId, cabCapacity);
      }
    } else {
      // No cabId — treat each route as its own cab
      cabCapacityMap.set(`__noroute_${route.id || Math.random()}`, cabCapacity);
    }

    totalOptimizedDistance += route.totalDistance || 0;
    totalOptimizedDuration += route.totalDuration || 0;
    totalPassengersCount += stops.length;

    // Naive sequence: alphabetical
    const naiveStops = [...stops].sort((a: any, b: any) =>
      (a.employee?.name || a.employeeName || "").localeCompare(b.employee?.name || b.employeeName || "")
    );

    let naiveDist = 0;
    const isPickup = route.isPickup !== false;

    if (isPickup) {
      let prevPoint = { x: naiveStops[0].employee?.x ?? naiveStops[0].x ?? 0, y: naiveStops[0].employee?.y ?? naiveStops[0].y ?? 0 };
      for (let i = 1; i < naiveStops.length; i++) {
        const empPoint = { x: naiveStops[i].employee?.x ?? naiveStops[i].x ?? 0, y: naiveStops[i].employee?.y ?? naiveStops[i].y ?? 0 };
        naiveDist += getDistance(prevPoint, empPoint);
        prevPoint = empPoint;
      }
      naiveDist += getDistance(prevPoint, depot);
    } else {
      let prevPoint = depot;
      for (let i = 0; i < naiveStops.length; i++) {
        const empPoint = { x: naiveStops[i].employee?.x ?? naiveStops[i].x ?? 0, y: naiveStops[i].employee?.y ?? naiveStops[i].y ?? 0 };
        naiveDist += getDistance(prevPoint, empPoint);
        prevPoint = empPoint;
      }
    }

    totalUnoptimizedDistance += naiveDist;
    const naiveDuration = Math.round(naiveDist / AVG_SPEED) + (isPickup ? 10 : 0);
    totalUnoptimizedDuration += naiveDuration;

    const routeOptimizedKm = (route.totalDistance || 0) * UNIT_TO_KM;
    const routeUnoptimizedKm = naiveDist * UNIT_TO_KM;
    const routeKmSaved = routeUnoptimizedKm - routeOptimizedKm;
    const routeFuelSaved = Math.max(0, routeKmSaved) / MILEAGE;
    const routeCostSaved = routeFuelSaved * FUEL_PRICE;
    const routeTimeSaved = Math.max(0, naiveDuration - (route.totalDuration || 0));

    routeBreakdowns.push({
      routeId: route.id || "",
      cabPlate: route.vehicleNumber || route.cab?.vehicleNumber || "No Cab",
      driverName: route.driverName || route.cab?.driverName || "No Driver",
      optimizedKm: Math.round(routeOptimizedKm * 10) / 10,
      unoptimizedKm: Math.round(routeUnoptimizedKm * 10) / 10,
      kmSaved: Math.round(routeKmSaved * 10) / 10,
      costSaved: Math.round(routeCostSaved),
      timeSavedMins: routeTimeSaved,
      passengerCount: stops.length,
    });
  }

  const optimizedKm = totalOptimizedDistance * UNIT_TO_KM;
  const unoptimizedKm = totalUnoptimizedDistance * UNIT_TO_KM;

  const kmSavedPerDay = Math.max(0, unoptimizedKm - optimizedKm);
  const fuelSavedPerDay = kmSavedPerDay / MILEAGE;
  const costSavedPerDay = fuelSavedPerDay * FUEL_PRICE;
  const timeSavedMinsPerDay = Math.max(0, totalUnoptimizedDuration - totalOptimizedDuration);

  const naiveCabsNeeded = Math.ceil(totalPassengersCount / 2.2);
  const optimizedCabsNeeded = routes.length;
  const cabsSavedPerDay = Math.max(0, naiveCabsNeeded - optimizedCabsNeeded);

  const totalCapacity = Array.from(cabCapacityMap.values()).reduce((sum, c) => sum + c, 0);
  const cabUtilization = totalCapacity > 0
    ? Math.round((totalPassengersCount / totalCapacity) * 100)
    : 0;

  return {
    optimizedKm: Math.round(optimizedKm * 10) / 10,
    unoptimizedKm: Math.round(unoptimizedKm * 10) / 10,
    kmSaved: Math.round(kmSavedPerDay * 10) / 10,
    fuelSaved: Math.round(fuelSavedPerDay * 10) / 10,
    costSaved: Math.round(costSavedPerDay),
    timeSavedHours: Math.round(timeSavedMinsPerDay / 60),
    cabReduction: cabsSavedPerDay,
    cabUtilization,
    totalRoutes: routes.length,
    totalPassengers: totalPassengersCount,
    totalCabs: cabCapacityMap.size,
    routeBreakdowns,
  };
}

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) {
      console.warn("[api] 🔒 GET /analysis — UNAUTHORIZED", { role: auth.session.role, ip });
      return auth.response;
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const period = searchParams.get("period") || "DAILY";

    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" }, update: {}, create: { id: "default" }
    });
    const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);

    // 1) Compute the actual date range this period covers
    const dateFilter = computeDateRange(date, startDate, endDate, period);
    console.debug(`[api] GET /analysis — period=${period} dateFilter=${JSON.stringify(dateFilter)}`);

    // 2) Try live Route table with status filter
    let routes = await prisma.route.findMany({
      where: {
        date: dateFilter,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "COMPLETED"] },
      },
      include: {
        stops: { include: { employee: { include: { pickupPoint: true } } } },
        cab: true,
      },
    });

    // 3) Fallback to OptimizedRouteSnapshot if Route table has no data
    if (routes.length === 0) {
      console.debug(`[api] GET /analysis — No live routes, trying OptimizedRouteSnapshot`);
      const snapshot = await prisma.optimizedRouteSnapshot.findFirst({
        where: { date: { gte: dateFilter.gte, lte: dateFilter.lte } },
        orderBy: { createdAt: "desc" },
      });
      if (snapshot) {
        const routeData = normalizeRouteData(snapshot.routeData);
        routes = routeData.filter((r: any) => r.shiftId).map((r: any) => ({
          ...r,
          id: r.id || r.cabId,
        }));
        console.debug(`[api] GET /analysis — Using OptimizedRouteSnapshot with ${routes.length} routes`);
      }
    }

    // 4) Fallback to BaselineRoute
    if (routes.length === 0) {
      console.debug(`[api] GET /analysis — No snapshot, trying BaselineRoute`);
      const baseline = await prisma.baselineRoute.findFirst({
        where: { date: { gte: dateFilter.gte, lte: dateFilter.lte } },
        orderBy: { createdAt: "desc" },
      });
      if (baseline) {
        const routeData = normalizeRouteData(baseline.routeData);
        routes = routeData.filter((r: any) => r.shiftId).map((r: any) => ({
          ...r,
          id: r.id || r.cabId,
        }));
        console.debug(`[api] GET /analysis — Using BaselineRoute with ${routes.length} routes`);
      }
    }

    // 5) Compute metrics
    const metrics = computeMetrics(routes, depot, settings);

    const totalCabsInSystem = await prisma.cab.count({ where: { status: { not: "INACTIVE" } } });
    const totalDriversInSystem = totalCabsInSystem;
    const driverUtilization = totalDriversInSystem > 0
      ? Math.round((metrics.totalCabs / totalDriversInSystem) * 100)
      : 0;

    return NextResponse.json({
      ...metrics,
      driverUtilization,
      totalCabsInSystem,
      totalDriversInSystem,
      currencySymbol: settings.currencySymbol,
      depotName: settings.depotName,
    });

  } catch (error) {
    console.error("[api] ❌ GET /analysis", { ip }, error);
    return NextResponse.json({ error: "Failed to calculate analysis metrics" }, { status: 500 });
  }
}
