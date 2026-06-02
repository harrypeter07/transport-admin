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

const MAX_BATCH_SIZE = 25;

export async function computeGoogleRouteMatrix(
  points: MapPoint[],
  apiKey: string
): Promise<RouteMatrixResult | null> {
  const n = points.length;
  if (!apiKey || n === 0) return null;

  const distanceMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const durationMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  let totalResolvedElements = 0;
  let totalExpectedElements = 0;

  // Partition points into fixed-size chunks (the API has a 25-point limit per call)
  const chunks: MapPoint[][] = [];
  for (let i = 0; i < n; i += MAX_BATCH_SIZE) {
    chunks.push(points.slice(i, i + MAX_BATCH_SIZE));
  }

  async function fetchChunkPair(
    origins: MapPoint[], originOffset: number,
    destinations: MapPoint[], destOffset: number,
  ): Promise<boolean> {
    const oLen = origins.length;
    const dLen = destinations.length;
    const isSelf = originOffset === destOffset;
    const expected = isSelf ? oLen * dLen - oLen : oLen * dLen;
    totalExpectedElements += expected;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const body = {
        origins: origins.map(p => ({ waypoint: pointToWaypoint(p) })),
        destinations: destinations.map(p => ({ waypoint: pointToWaypoint(p) })),
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

      if (!res.ok) return false;

      const data = await res.json();
      if (!Array.isArray(data)) return false;

      for (const element of data) {
        const originIndex = Number(element?.originIndex);
        const destinationIndex = Number(element?.destinationIndex);

        if (originIndex < 0 || originIndex >= oLen || destinationIndex < 0 || destinationIndex >= dLen) continue;

        const gi = originOffset + originIndex;
        const gj = destOffset + destinationIndex;
        if (gi === gj) continue;

        const condition = element?.condition;
        if (condition !== "ROUTE_EXISTS") continue;

        const distanceMeters = Number(element?.distanceMeters);
        const durationSeconds = parseGoogleDurationSeconds(element?.duration);
        if (!Number.isFinite(distanceMeters) || durationSeconds === null) continue;

        distanceMatrix[gi][gj] = Math.round((distanceMeters / 1000) * 10) / 10;
        durationMatrix[gi][gj] = Math.max(1, Math.round(durationSeconds / 60));
        totalResolvedElements++;
      }

      return true;
    } catch (e) {
      console.error("Google Routes computeRouteMatrix chunk failed:", e);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const requests: Promise<boolean>[] = [];
  for (let oi = 0; oi < chunks.length; oi++) {
    for (let dj = 0; dj < chunks.length; dj++) {
      requests.push(fetchChunkPair(
        chunks[oi], oi * MAX_BATCH_SIZE,
        chunks[dj], dj * MAX_BATCH_SIZE,
      ));
    }
  }

  const results = await Promise.all(requests);
  if (results.some(r => !r)) return null;

  return totalExpectedElements === 0 || totalResolvedElements >= totalExpectedElements
    ? { distanceMatrix, durationMatrix }
    : null;
}
