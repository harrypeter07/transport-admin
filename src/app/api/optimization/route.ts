import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { optimizeRoutes, OptimizeEmployee, OptimizeCab } from "@/lib/optimization";

// GET all routes with details
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shiftId = searchParams.get("shiftId");
    const date = searchParams.get("date");

    const whereClause: any = {};
    whereClause.date = date || new Date().toISOString().split("T")[0];

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
    const { shiftId, isPickup, date, mode = "FASTEST_TRAVEL" } = body;

    const currentDateStr = date || new Date().toISOString().split("T")[0];

    // 1. Fetch Employees for this shift and exclude those on leave
    const dbEmployees = await prisma.employee.findMany({
      where: { 
        status: "ACTIVE",
        ...(shiftId ? { shiftId } : {})
      },
      include: {
        user: {
          include: {
            ApplicantLeaves: {
              where: {
                status: "APPROVED",
                startDate: { lte: currentDateStr },
                endDate: { gte: currentDateStr }
              }
            }
          }
        }
      }
    });

    // Filter out employees with active approved leaves
    const availableEmployees = dbEmployees.filter(emp => {
      const leaves = emp.user?.ApplicantLeaves || [];
      return leaves.length === 0;
    });

    if (availableEmployees.length === 0) {
      return NextResponse.json({ error: "No active employees found for this shift" }, { status: 400 });
    }
    
    // Fallback shiftId for route creation
    const fallbackShiftId = availableEmployees[0]?.shiftId || shiftId || "";

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
    const optEmployees: OptimizeEmployee[] = availableEmployees.map((emp) => ({
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
    const apiKeyHeader = req.headers.get("x-google-maps-key") || "";
    const apiKey = apiKeyHeader || process.env.GOOGLE_MAPS_API_KEY || "";
    const optimizedRoutes = await optimizeRoutes(optEmployees, optCabs, isPickup, apiKey, mode);

    // 5. Use database transaction to wipe old routes for this date and insert new ones
    await prisma.$transaction(async (tx) => {
      // Find old routes
      const oldRoutes = await tx.route.findMany({
        where: { date: currentDateStr, shiftId: fallbackShiftId },
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
            shiftId: fallbackShiftId,
            isPickup,
            totalDistance: optRoute.totalDistance,
            totalDuration: optRoute.totalDuration,
            status: "PENDING",
            optimizationScore: optRoute.optimizationScore,
            optimizationMode: mode,
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
