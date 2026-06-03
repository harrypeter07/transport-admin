import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiRole } from "@/lib/apiAuth";

const AVG_SPEED = 0.5;

function roadKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const R = 6371;
  const dLat = ((b.y - a.y) * Math.PI) / 180;
  const dLon = ((b.x - a.x) * Math.PI) / 180;
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.y * Math.PI) / 180) *
      Math.cos((b.y * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 1.3;
}

const DEPOT: { x: number; y: number } = { x: 79.0526, y: 21.0625 };

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Fetch all routes for this date with their stops, employees, and cabs
    const dbRoutes = await prisma.route.findMany({
      where: { date },
      include: {
        stops: {
          include: { employee: true },
          orderBy: { stopOrder: "asc" },
        },
        cab: true,
        shift: true,
      },
    });

    // Build Route[] objects from DB data
    const routes: any[] = [];
    let routeIndex = 0;

    for (const dbRoute of dbRoutes) {
      if (dbRoute.stops.length === 0) continue;

      const routeId = `current-route-${routeIndex}`;
      const stops: any[] = [];
      let totalDist = 0;
      let totalDuration = 0;
      let prevPoint: { x: number; y: number } | null = null;
      let maxCapacity = dbRoute.cab?.capacity || 4;

      for (const stop of dbRoute.stops) {
        const emp = stop.employee;
        const pt = { x: emp.x, y: emp.y };

        if (prevPoint) {
          const leg = roadKm(prevPoint, pt);
          totalDist += leg;
          totalDuration += leg / AVG_SPEED;
        }
        prevPoint = pt;

        stops.push({
          employeeId: emp.id,
          employee: {
            id: emp.id,
            name: emp.name,
            gender: emp.gender,
            x: emp.x,
            y: emp.y,
            address: emp.address,
            email: emp.email,
            employeeCode: emp.employeeCode,
            phone: emp.phone,
            department: emp.department,
            shiftId: emp.shiftId || "",
            status: emp.status,
          },
          stopOrder: stops.length + 1,
          etaMinutes: Math.max(1, Math.round(totalDuration)),
          status: "PENDING",
          id: `current-stop-${routeId}-${stops.length}`,
          routeId,
        });
      }

      // Add last stop → depot leg
      const lastPt = stops[stops.length - 1].employee;
      const depotLeg = roadKm({ x: lastPt.x, y: lastPt.y }, DEPOT);
      totalDist += depotLeg;
      totalDuration += depotLeg / AVG_SPEED;

      routes.push({
        id: routeId,
        cabId: dbRoute.cabId,
        cab: {
          id: dbRoute.cab.id,
          vehicleNumber: dbRoute.cab.vehicleNumber,
          capacity: maxCapacity,
          vendor: dbRoute.cab.vendor,
          status: dbRoute.cab.status,
          driverName: dbRoute.cab.driverName,
          driverPhone: dbRoute.cab.driverPhone,
        },
        date,
        shiftId: dbRoute.shiftId,
        shift: dbRoute.shift || { id: "default", name: "Default", startTime: "00:00", endTime: "23:59" },
        isPickup: dbRoute.isPickup,
        totalDistance: Math.round(totalDist * 10) / 10,
        totalDuration: Math.round(totalDuration),
        status: "PENDING",
        optimizationScore: 0,
        stops,
        violations: [],
        hasEscort: false,
        tripSequence: dbRoute.tripSequence || 1,
        routeNumber: routeIndex + 1,
      });

      routeIndex++;
    }

    // If no DB routes exist, generate placeholder routes from active employees
    if (routes.length === 0) {
      const employees = await prisma.employee.findMany({
        where: { status: "ACTIVE" },
      });

      const numGroups = Math.max(3, Math.ceil(employees.length / 16));
      const groups: typeof employees[] = Array.from({ length: numGroups }, () => []);

      for (let i = 0; i < employees.length; i++) {
        groups[i % numGroups].push(employees[i]);
      }

      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        if (group.length === 0) continue;

        const routeId = `placeholder-route-${g}`;
        const stops: any[] = [];
        let totalDist = 0;
        let totalDuration = 0;
        let prevPoint: { x: number; y: number } | null = null;

        for (let si = 0; si < group.length; si++) {
          const emp = group[si];
          const pt = { x: emp.x, y: emp.y };

          if (prevPoint) {
            const leg = roadKm(prevPoint, pt);
            totalDist += leg;
            totalDuration += leg / AVG_SPEED;
          }
          prevPoint = pt;

          stops.push({
            employeeId: emp.id,
            employee: {
              id: emp.id,
              name: emp.name,
              gender: emp.gender,
              x: emp.x,
              y: emp.y,
              address: emp.address,
              email: emp.email,
              employeeCode: emp.employeeCode,
              phone: emp.phone,
              department: emp.department,
              shiftId: emp.shiftId || "",
              status: emp.status,
            },
            stopOrder: si + 1,
            etaMinutes: Math.max(1, Math.round(totalDuration)),
            status: "PENDING",
            id: `placeholder-stop-${g}-${si}`,
            routeId,
          });
        }

        const lastPt = stops[stops.length - 1].employee;
        const depotLeg = roadKm({ x: lastPt.x, y: lastPt.y }, DEPOT);
        totalDist += depotLeg;
        totalDuration += depotLeg / AVG_SPEED;

        routes.push({
          id: routeId,
          cabId: `placeholder-cab-${g}`,
          cab: {
            id: `placeholder-cab-${g}`,
            vehicleNumber: `PLACEHOLDER-CAB-${g + 1}`,
            capacity: 4,
            vendor: "Demo",
            status: "ACTIVE",
            driverName: `Driver ${g + 1}`,
            driverPhone: "0000000000",
          },
          date,
          shiftId: "default",
          shift: { id: "default", name: "Default", startTime: "00:00", endTime: "23:59" },
          isPickup: true,
          totalDistance: Math.round(totalDist * 10) / 10,
          totalDuration: Math.round(totalDuration),
          status: "PENDING",
          optimizationScore: 0,
          stops,
          violations: [],
          hasEscort: false,
          tripSequence: 1,
          routeNumber: g + 1,
        });
      }
    }

    const isPlaceholder = dbRoutes.length === 0 && routes.length > 0;

    // Collect dates with route data for the suggestion feature
    const dateCounts = await prisma.route.groupBy({
      by: ["date"],
      _count: { id: true },
      orderBy: { date: "desc" },
      take: 5,
    });
    const availableDates = dateCounts.map((d) => ({ date: d.date, routeCount: d._count.id }));

    return NextResponse.json({
      routes,
      totalRoutes: routes.length,
      placeholder: isPlaceholder,
      availableDates,
      skippedRows: 0,
      skippedStops: 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[api] ❌ GET /api/optimization/excel-routes", e);
    return NextResponse.json({
      error: "Failed to load current routes",
      details: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    }, { status: 500 });
  }
}
