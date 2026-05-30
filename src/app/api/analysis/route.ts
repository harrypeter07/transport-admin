import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDistance, DEPOT } from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";

export async function GET(req: Request) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const period = searchParams.get("period") || "DAILY"; // DAILY, WEEKLY, MONTHLY, ANNUAL

    const whereClause: any = {};
    if (date) whereClause.date = date;

    const routes = await prisma.route.findMany({
      where: whereClause,
      include: {
        stops: {
          include: { employee: true },
        },
        cab: true,
      },
    });

    const totalCabsInSystem = await prisma.cab.count();
    const totalDriversInSystem = totalCabsInSystem;

    const UNIT_TO_KM = 1.2;
    const FUEL_PRICE = 100; // ₹100 per liter
    const MILEAGE = 10;     // 10 km per liter
    const AVG_SPEED = 0.5;  // 30 km/h (0.5 km/min)

    let totalOptimizedDistance = 0;
    let totalUnoptimizedDistance = 0;
    let totalOptimizedDuration = 0;
    let totalUnoptimizedDuration = 0;
    
    let totalCapacityUsed = 0;
    let totalPassengersCount = 0;
    const routeBreakdowns: any[] = [];

    for (const route of routes) {
      if (route.stops.length === 0) continue;

      totalOptimizedDistance += route.totalDistance;
      totalOptimizedDuration += route.totalDuration;
      totalCapacityUsed += route.cab?.capacity || 4;
      totalPassengersCount += route.stops.length;

      // Naive sequence: alphabetical
      const naiveStops = [...route.stops].sort((a, b) =>
        a.employee.name.localeCompare(b.employee.name)
      );

      let naiveDist = 0;
      const startPoint = null;

      if (route.isPickup) {
        let prevPoint = startPoint || { x: naiveStops[0].employee.x, y: naiveStops[0].employee.y };
        for (let i = (startPoint ? 0 : 1); i < naiveStops.length; i++) {
          const empPoint = { x: naiveStops[i].employee.x, y: naiveStops[i].employee.y };
          naiveDist += getDistance(prevPoint, empPoint);
          prevPoint = empPoint;
        }
        naiveDist += getDistance(prevPoint, DEPOT);
      } else {
        if (startPoint) {
          naiveDist += getDistance(startPoint, DEPOT);
        }
        let prevPoint = DEPOT;
        for (let i = 0; i < naiveStops.length; i++) {
          const empPoint = { x: naiveStops[i].employee.x, y: naiveStops[i].employee.y };
          naiveDist += getDistance(prevPoint, empPoint);
          prevPoint = empPoint;
        }
      }

      totalUnoptimizedDistance += naiveDist;
      
      const naiveDuration = Math.round(naiveDist / AVG_SPEED) + (route.isPickup ? 10 : 0);
      totalUnoptimizedDuration += naiveDuration;

      const routeOptimizedKm = route.totalDistance * UNIT_TO_KM;
      const routeUnoptimizedKm = naiveDist * UNIT_TO_KM;
      const routeKmSaved = routeUnoptimizedKm - routeOptimizedKm;
      const routeFuelSaved = Math.max(0, routeKmSaved) / MILEAGE;
      const routeCostSaved = routeFuelSaved * FUEL_PRICE;
      const routeTimeSaved = Math.max(0, naiveDuration - route.totalDuration);

      routeBreakdowns.push({
        routeId: route.id,
        cabPlate: route.cab?.vehicleNumber || "No Cab",
        driverName: route.cab?.driverName || "No Driver",
        optimizedKm: Math.round(routeOptimizedKm * 10) / 10,
        unoptimizedKm: Math.round(routeUnoptimizedKm * 10) / 10,
        kmSaved: Math.round(routeKmSaved * 10) / 10,
        costSaved: Math.round(routeCostSaved),
        timeSavedMins: routeTimeSaved,
        passengerCount: route.stops.length,
      });
    }

    const optimizedKm = totalOptimizedDistance * UNIT_TO_KM;
    const unoptimizedKm = totalUnoptimizedDistance * UNIT_TO_KM;

    const kmSavedPerDay = Math.max(0, unoptimizedKm - optimizedKm);
    const fuelSavedPerDay = kmSavedPerDay / MILEAGE;
    const costSavedPerDay = fuelSavedPerDay * FUEL_PRICE;
    const timeSavedMinsPerDay = Math.max(0, totalUnoptimizedDuration - totalOptimizedDuration);

    // Cab Reduction Metric
    // Naive packings average 2.2 passengers per cab due to detours, optimized packs closer to 3.8
    const naiveCabsNeeded = Math.ceil(totalPassengersCount / 2.2);
    const optimizedCabsNeeded = routes.length;
    const cabsSavedPerDay = Math.max(0, naiveCabsNeeded - optimizedCabsNeeded);

    // Utilization
    const cabUtilization = totalCapacityUsed > 0 
      ? Math.round((totalPassengersCount / totalCapacityUsed) * 100) 
      : 0;

    const driverUtilization = totalDriversInSystem > 0 
      ? Math.round((routes.length / totalDriversInSystem) * 100) 
      : 0;

    // Period multiplier
    let multiplier = 1;
    if (period === "WEEKLY") multiplier = 7;
    else if (period === "MONTHLY") multiplier = 30;
    else if (period === "ANNUAL" || period === "YEARLY") multiplier = 365;

    return NextResponse.json({
      optimizedKm: Math.round(optimizedKm * multiplier * 10) / 10,
      unoptimizedKm: Math.round(unoptimizedKm * multiplier * 10) / 10,
      kmSaved: Math.round(kmSavedPerDay * multiplier * 10) / 10,
      fuelSaved: Math.round(fuelSavedPerDay * multiplier * 10) / 10,
      costSaved: Math.round(costSavedPerDay * multiplier),
      timeSavedHours: Math.round((timeSavedMinsPerDay * multiplier) / 60),
      cabReduction: cabsSavedPerDay,
      cabUtilization,
      driverUtilization,
      totalCabsInSystem,
      totalDriversInSystem,
      routeBreakdowns,
    });

  } catch (error) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ error: "Failed to calculate analysis metrics" }, { status: 500 });
  }
}
