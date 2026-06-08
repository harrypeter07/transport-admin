export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { mapsProvider } from "@/lib/maps";

type LatLng = [number, number];

function isValidLatLng(value: unknown): value is LatLng {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [lat, lng] = value;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function fetchProviderGeometry(coords: LatLng[]) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return null;

  const geometry = await mapsProvider.computeRouteGeometry(
    coords.map(([lat, lng]) => ({ x: lng, y: lat })),
    apiKey
  );

  return geometry && geometry.coordinates.length > coords.length
    ? { coordinates: geometry.coordinates, source: geometry.source }
    : null;
}

async function fetchLegByLegGeometry(coords: LatLng[]) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return { coordinates: coords, source: "fallback" };

  const geometry: LatLng[] = [];
  let providerLegs = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const leg = await mapsProvider.computeRouteGeometry(
      [coords[i], coords[i + 1]].map(([lat, lng]) => ({ x: lng, y: lat })),
      apiKey
    );
    const legGeometry = leg?.coordinates.length ? leg.coordinates : [coords[i], coords[i + 1]];

    if (leg?.coordinates.length && leg.coordinates.length > 2) {
      providerLegs += 1;
    }

    if (geometry.length > 0) {
      geometry.push(...legGeometry.slice(1) as LatLng[]);
    } else {
      geometry.push(...(legGeometry as LatLng[]));
    }
  }

  return {
    coordinates: geometry.length > 0 ? geometry : coords,
    source: providerLegs > 0 ? "google-directions-leg-by-leg" : "fallback",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const coords = body?.coords;

    console.log("[geometry:server] received coords:", JSON.stringify(coords?.slice(0, 2)), "...", coords?.length, "pts");

    if (!Array.isArray(coords) || coords.length < 2 || coords.length > 30) {
      return NextResponse.json(
        { error: "coords must contain 2 to 30 [lat, lng] points" },
        { status: 400 }
      );
    }

    if (!coords.every(isValidLatLng)) {
      console.warn("[geometry:server] REJECTED — coords has invalid format. first:", JSON.stringify(coords[0]));
      return NextResponse.json({ error: "coords contains invalid coordinates" }, { status: 400 });
    }

    const fullGeometry = await fetchProviderGeometry(coords);
    if (fullGeometry) {
      return NextResponse.json(fullGeometry);
    }

    const legGeometry = await fetchLegByLegGeometry(coords);
    return NextResponse.json({
      coordinates: legGeometry.coordinates,
      source: legGeometry.source,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch routing geometry", details },
      { status: 500 }
    );
  }
}
