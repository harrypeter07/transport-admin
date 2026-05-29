import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

// Haversine formula
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET(req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  try {
    const session = await verifySession();
    const routeId = (await params).routeId;

    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        stops: { 
          include: { employee: true },
          orderBy: { stopOrder: "asc" } 
        },
        cab: { include: { driver: true } }
      }
    });

    if (!route) return NextResponse.json({ error: "Route not found" }, { status: 404 });

    const currentLat = route.currentLat;
    const currentLng = route.currentLng;
    const lastLocationAt = route.lastLocationAt;

    let liveETA = null;
    let distanceKm = null;
    let nextStop = route.stops.find(s => s.status === "PENDING" || s.status === "REACHED");

    if (currentLat && currentLng && nextStop && nextStop.employee) {
      // Calculate straight-line distance to next stop
      const straightLineDist = getDistanceFromLatLonInKm(currentLat, currentLng, nextStop.employee.x, nextStop.employee.y);
      // Rough road multiplier (urban) = ~1.4x straight line
      distanceKm = straightLineDist * 1.4;
      
      // Assume 25 km/h average speed in city
      const speedKmh = 25;
      const hoursToStop = distanceKm / speedKmh;
      const minutesToStop = Math.ceil(hoursToStop * 60);

      const now = new Date();
      liveETA = new Date(now.getTime() + minutesToStop * 60000);
    }

    return NextResponse.json({ 
      routeId,
      status: route.status,
      currentLat,
      currentLng,
      lastLocationAt,
      nextStopId: nextStop?.id || null,
      distanceToNextStopKm: distanceKm,
      liveETA
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
