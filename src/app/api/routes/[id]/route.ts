import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDistance, checkSafetyViolations, DEPOT, fetchOSRMRoute } from "@/lib/optimization";

const AVG_SPEED = 0.5; // units per minute (30 km/h)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routeId } = await params;
    const body = await req.json();
    const { action } = body;

    // Fetch the target route
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        stops: {
          include: { employee: true },
          orderBy: { stopOrder: "asc" },
        },
        violations: true,
      },
    });

    if (!route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    if (action === "UPDATE_STATUS") {
      const { stopId, status } = body;
      await prisma.routeStop.update({
        where: { id: stopId },
        data: { status },
      });

      // Fetch all stops to check if route is completed
      const allStops = await prisma.routeStop.findMany({
        where: { routeId },
      });
      const allCompletedOrMissed = allStops.every(
        (s) => s.status === "PICKED_UP" || s.status === "MISSED" || s.status === "COMPLETED"
      );

      const routeStatus = allCompletedOrMissed ? "COMPLETED" : "IN_PROGRESS";
      await prisma.route.update({
        where: { id: routeId },
        data: { status: routeStatus },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "REORDER") {
      const { stopId, direction } = body;
      const stops = [...route.stops];

      const targetIdx = stops.findIndex((s) => s.id === stopId);
      if (targetIdx === -1) {
        return NextResponse.json({ error: "Stop not found" }, { status: 404 });
      }

      // Reorder stops in array
      if (direction === "up" && targetIdx > 0) {
        const temp = stops[targetIdx];
        stops[targetIdx] = stops[targetIdx - 1];
        stops[targetIdx - 1] = temp;
      } else if (direction === "down" && targetIdx < stops.length - 1) {
        const temp = stops[targetIdx];
        stops[targetIdx] = stops[targetIdx + 1];
        stops[targetIdx + 1] = temp;
      } else {
        return NextResponse.json({ error: "Invalid swap direction" }, { status: 400 });
      }

      // Re-assign stopOrder indexes (1-indexed)
      stops.forEach((stop, idx) => {
        stop.stopOrder = idx + 1;
      });

      // Recalculate distance and ETAs
      const isPickup = route.isPickup;
      let currentDistance = 0;

      if (isPickup) {
        for (let j = 0; j < stops.length; j++) {
          const s = stops[j];
          if (j > 0) {
            const prev = stops[j - 1];
            currentDistance += getDistance(
              { x: prev.employee.x, y: prev.employee.y },
              { x: s.employee.x, y: s.employee.y }
            );
          }
          s.etaMinutes = Math.round(currentDistance / AVG_SPEED) + 10;
        }
      } else {
        for (let j = 0; j < stops.length; j++) {
          const s = stops[j];
          if (j > 0) {
            const prev = stops[j - 1];
            currentDistance += getDistance(
              { x: prev.employee.x, y: prev.employee.y },
              { x: s.employee.x, y: s.employee.y }
            );
          }
          s.etaMinutes = Math.round(currentDistance / AVG_SPEED);
        }
      }

      // Fetch actual OSRM road distance and duration for the new stop order
      const osrmResult = await fetchOSRMRoute(
        stops.map(s => ({ x: s.employee.x, y: s.employee.y })),
        isPickup
      );

      // Re-evaluate safety violations
      const finalViolations = checkSafetyViolations(
        stops.map((s) => ({ name: s.employee.name, gender: s.employee.gender as "MALE" | "FEMALE" })),
        isPickup,
        false // escort starts as false on re-evaluation
      );

      // Perform DB updates in transaction
      await prisma.$transaction(async (tx) => {
        // Update each stop order and ETA
        for (const stop of stops) {
          await tx.routeStop.update({
            where: { id: stop.id },
            data: { stopOrder: stop.stopOrder, etaMinutes: stop.etaMinutes },
          });
        }

        // Delete old violations
        await tx.violation.deleteMany({ where: { routeId } });

        // Insert new violations
        for (const viol of finalViolations) {
          await tx.violation.create({
            data: {
              routeId,
              type: viol.type,
              severity: viol.severity,
              resolved: false,
              notes: viol.notes,
            },
          });
        }

        // Update Route parameters
        const penalty = finalViolations.length * 30;
        const score = Math.max(30, Math.round(100 - osrmResult.distance * 0.8 - penalty));

        await tx.route.update({
          where: { id: routeId },
          data: {
            totalDistance: osrmResult.distance,
            totalDuration: osrmResult.duration,
            optimizationScore: score,
          },
        });
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Failed route edit:", e);
    return NextResponse.json({ error: "Failed to update route" }, { status: 500 });
  }
}
