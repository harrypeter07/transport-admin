export type MapPoint = {
  x: number;
  y: number;
};

export type RouteGeometryResult = {
  distance: number;
  duration: number;
  coordinates: [number, number][];
  source: "google-routes";
};

export type RouteMatrixResult = {
  distanceMatrix: number[][];
  durationMatrix: number[][];
};

const GOOGLE_ROUTES_BASE_URL = "https://routes.googleapis.com";

function pointToLatLng(point: MapPoint) {
  return {
    latitude: point.y,
    longitude: point.x,
  };
}

function pointToWaypoint(point: MapPoint) {
  return {
    location: {
      latLng: pointToLatLng(point),
    },
  };
}

function parseGoogleDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  return Number(match[1]);
}

export function decodeGooglePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
}

export async function computeGoogleRoute(
  points: MapPoint[],
  apiKey: string
): Promise<RouteGeometryResult | null> {
  if (!apiKey || points.length < 2 || points.length > 25) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const body = {
      origin: pointToWaypoint(points[0]),
      destination: pointToWaypoint(points[points.length - 1]),
      intermediates: points.slice(1, -1).map(pointToWaypoint),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "ENCODED_POLYLINE",
      units: "METRIC",
    };

    const res = await fetch(`${GOOGLE_ROUTES_BASE_URL}/directions/v2:computeRoutes`, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const route = data?.routes?.[0];
    const distanceMeters = Number(route?.distanceMeters);
    const durationSeconds = parseGoogleDurationSeconds(route?.duration);
    const encodedPolyline = route?.polyline?.encodedPolyline;

    if (
      !Number.isFinite(distanceMeters) ||
      durationSeconds === null ||
      typeof encodedPolyline !== "string"
    ) {
      return null;
    }

    const coordinates = decodeGooglePolyline(encodedPolyline);
    return {
      distance: Math.round((distanceMeters / 1000) * 10) / 10,
      duration: Math.max(1, Math.round(durationSeconds / 60)),
      coordinates,
      source: "google-routes",
    };
  } catch (e) {
    console.error("Google Routes computeRoutes failed:", e);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function computeGoogleRouteMatrix(
  points: MapPoint[],
  apiKey: string
): Promise<RouteMatrixResult | null> {
  const n = points.length;
  if (!apiKey || n === 0) return null;

  const elementCount = n * n;
  if (elementCount > 625) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const body = {
      origins: points.map((point) => ({ waypoint: pointToWaypoint(point) })),
      destinations: points.map((point) => ({ waypoint: pointToWaypoint(point) })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      units: "METRIC",
    };

    const res = await fetch(`${GOOGLE_ROUTES_BASE_URL}/distanceMatrix/v2:computeRouteMatrix`, {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "originIndex,destinationIndex,status,condition,distanceMeters,duration",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data)) return null;

    const distanceMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const durationMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    let resolvedElements = 0;

    for (const element of data) {
      const originIndex = Number(element?.originIndex);
      const destinationIndex = Number(element?.destinationIndex);
      const distanceMeters = Number(element?.distanceMeters);
      const durationSeconds = parseGoogleDurationSeconds(element?.duration);
      const condition = element?.condition;

      if (
        originIndex < 0 ||
        originIndex >= n ||
        destinationIndex < 0 ||
        destinationIndex >= n ||
        originIndex === destinationIndex
      ) {
        continue;
      }

      if (
        condition === "ROUTE_EXISTS" &&
        Number.isFinite(distanceMeters) &&
        durationSeconds !== null
      ) {
        distanceMatrix[originIndex][destinationIndex] = Math.round((distanceMeters / 1000) * 10) / 10;
        durationMatrix[originIndex][destinationIndex] = Math.max(1, Math.round(durationSeconds / 60));
        resolvedElements += 1;
      }
    }

    const expectedElements = n * n - n;
    return expectedElements === 0 || resolvedElements >= expectedElements
      ? { distanceMatrix, durationMatrix }
      : null;
  } catch (e) {
    console.error("Google Routes computeRouteMatrix failed:", e);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
