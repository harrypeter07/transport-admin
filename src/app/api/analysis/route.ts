import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDistance, DEPOT } from "@/lib/optimization";

export async function GET() {
  try {
    const routes = await prisma.route.findMany({
      include: {
        stops: {
          include: {
            employee: true,
          },
        },
        cab: {
          include: {
            driver: true,
          },
        },
      },
    });

    const UNIT_TO_KM = 1.2;
    const FUEL_PRICE = 100; // ₹100 per liter
    const MILEAGE = 10;     // 10 km per liter

    let totalOptimizedDistance = 0;
    let totalUnoptimizedDistance = 0;
    const routeBreakdowns: any[] = [];

    for (const route of routes) {
      if (route.stops.length === 0) continue;

      totalOptimizedDistance += route.totalDistance;

      // Simulate a naive route (unoptimized) by sorting stops alphabetically by employee name
      // This represents how humans might manually sequence them without an optimization engine
      const naiveStops = [...route.stops].sort((a, b) =>
        a.employee.name.localeCompare(b.employee.name)
      );

      let naiveDist = 0;
      const startPoint = route.cab?.driver?.startY && route.cab?.driver?.startX 
        ? { y: route.cab.driver.startY, x: route.cab.driver.startX }
        : null;

      if (route.isPickup) {
        // DriverStart -> Stop 1 -> Stop 2 -> Depot
        let prevPoint = startPoint || { x: naiveStops[0].employee.x, y: naiveStops[0].employee.y };
        
        // If there's no driver start, the first stop is the start, so distance starts accumulating from Stop 2
        for (let i = (startPoint ? 0 : 1); i < naiveStops.length; i++) {
          const empPoint = { x: naiveStops[i].employee.x, y: naiveStops[i].employee.y };
          naiveDist += getDistance(prevPoint, empPoint);
          prevPoint = empPoint;
        }
        naiveDist += getDistance(prevPoint, DEPOT);
      } else {
        // Drop: DriverStart -> Depot -> Stop 1 -> Stop 2
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

      const routeOptimizedKm = route.totalDistance * UNIT_TO_KM;
      const routeUnoptimizedKm = naiveDist * UNIT_TO_KM;
      const routeKmSaved = routeUnoptimizedKm - routeOptimizedKm;
      const routeFuelSaved = Math.max(0, routeKmSaved) / MILEAGE;
      const routeCostSaved = routeFuelSaved * FUEL_PRICE;

      routeBreakdowns.push({
        routeId: route.id,
        cabPlate: route.cab?.vehicleNumber || "No Cab",
        driverName: route.cab?.driver?.name || "No Driver",
        optimizedKm: Math.round(routeOptimizedKm * 10) / 10,
        unoptimizedKm: Math.round(routeUnoptimizedKm * 10) / 10,
        kmSaved: Math.round(routeKmSaved * 10) / 10,
        costSaved: Math.round(routeCostSaved),
        passengerCount: route.stops.length,
      });
    }

    const optimizedKm = totalOptimizedDistance * UNIT_TO_KM;
    const unoptimizedKm = totalUnoptimizedDistance * UNIT_TO_KM;

    const kmSavedPerDay = unoptimizedKm - optimizedKm;
    const fuelSavedPerDay = kmSavedPerDay / MILEAGE;
    const costSavedPerDay = fuelSavedPerDay * FUEL_PRICE;

    // Projections
    const costSavedPerMonth = costSavedPerDay * 30;
    const costSavedPerYear = costSavedPerDay * 365;

    return NextResponse.json({
      optimizedKm: Math.round(optimizedKm * 10) / 10,
      unoptimizedKm: Math.round(unoptimizedKm * 10) / 10,
      kmSavedPerDay: Math.round(kmSavedPerDay * 10) / 10,
      fuelSavedPerDay: Math.round(fuelSavedPerDay * 10) / 10,
      costSavedPerDay: Math.round(costSavedPerDay),
      costSavedPerMonth: Math.round(costSavedPerMonth),
      costSavedPerYear: Math.round(costSavedPerYear),
      routeBreakdowns,
    });

  } catch (error) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ error: "Failed to calculate analysis metrics" }, { status: 500 });
  }
}
