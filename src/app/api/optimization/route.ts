import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { optimizeRoutes, OptimizeEmployee, OptimizeCab } from "@/lib/optimization";

// GET all routes with details
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shiftId = searchParams.get("shiftId");

    const whereClause: any = {};
    if (shiftId) {
      whereClause.shiftId = shiftId;
    }

    const routes = await prisma.route.findMany({
      where: whereClause,
      include: {
        cab: {
          include: {
            driver: true,
          },
        },
        shift: true,
        stops: {
          include: {
            employee: true,
          },
          orderBy: {
            stopOrder: "asc",
          },
        },
        violations: true,
      },
    });

    return NextResponse.json(routes);
  } catch (e) {
    console.error("Error fetching routes:", e);
    return NextResponse.json({ error: "Failed to fetch routes" }, { status: 500 });
  }
}

// POST: Run optimization and save routes
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shiftId, isPickup } = body;

    if (!shiftId) {
      return NextResponse.json({ error: "shiftId is required" }, { status: 400 });
    }

    // 1. Fetch Employees for this shift
    const dbEmployees = await prisma.employee.findMany({
      where: { shiftId, status: "ACTIVE" },
    });

    if (dbEmployees.length === 0) {
      return NextResponse.json({ error: "No active employees found for this shift" }, { status: 400 });
    }

    // 2. Fetch Available Cabs
    const dbCabs = await prisma.cab.findMany({
      where: { status: "AVAILABLE" },
      include: {
        driver: true,
      },
    });

    if (dbCabs.length === 0) {
      return NextResponse.json({ error: "No available cabs found" }, { status: 400 });
    }

    // 3. Map to Optimizer input types
    const optEmployees: OptimizeEmployee[] = dbEmployees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      gender: emp.gender as "MALE" | "FEMALE",
      x: emp.x,
      y: emp.y,
      address: emp.address,
      department: emp.department,
      phone: emp.phone,
    }));

    const optCabs: OptimizeCab[] = dbCabs.map((cab) => ({
      id: cab.id,
      vehicleNumber: cab.vehicleNumber,
      capacity: cab.capacity,
      vendor: cab.vendor,
      driverName: cab.driver?.name || "Unassigned",
      driverPhone: cab.driver?.phone || "N/A",
    }));

    // 4. Run Core Optimizer
    const optimizedRoutes = await optimizeRoutes(optEmployees, optCabs, isPickup);

    const currentDateStr = new Date().toISOString().split("T")[0];

    // 5. Use database transaction to wipe old routes for this shift + date and insert new ones
    await prisma.$transaction(async (tx) => {
      // Find old routes
      const oldRoutes = await tx.route.findMany({
        where: { shiftId, date: currentDateStr },
        select: { id: true },
      });
      const oldRouteIds = oldRoutes.map((r) => r.id);

      if (oldRouteIds.length > 0) {
        // Delete related stops and violations
        await tx.routeStop.deleteMany({ where: { routeId: { in: oldRouteIds } } });
        await tx.violation.deleteMany({ where: { routeId: { in: oldRouteIds } } });
        // Delete routes
        await tx.route.deleteMany({ where: { id: { in: oldRouteIds } } });
      }

      // Insert new routes
      for (const optRoute of optimizedRoutes) {
        const route = await tx.route.create({
          data: {
            cabId: optRoute.cabId,
            date: currentDateStr,
            shiftId,
            isPickup,
            totalDistance: optRoute.totalDistance,
            totalDuration: optRoute.totalDuration,
            status: "PENDING",
            optimizationScore: optRoute.optimizationScore,
          },
        });

        // Insert Stops
        for (const stop of optRoute.stops) {
          await tx.routeStop.create({
            data: {
              routeId: route.id,
              employeeId: stop.employeeId,
              stopOrder: stop.stopOrder,
              etaMinutes: stop.etaMinutes,
              status: "PENDING",
            },
          });
        }

        // Insert Violations
        for (const viol of optRoute.violations) {
          await tx.violation.create({
            data: {
              routeId: route.id,
              type: viol.type,
              severity: viol.severity,
              resolved: false,
              notes: viol.notes,
            },
          });
        }
      }
    });

    return NextResponse.json({ success: true, count: optimizedRoutes.length });
  } catch (e) {
    console.error("Optimization failed:", e);
    return NextResponse.json({ error: "Optimization engine error" }, { status: 500 });
  }
}
