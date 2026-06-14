import {
  computeGoogleRoute,
  type MapPoint,
  type RouteGeometryResult,
} from "@/lib/maps/googleMaps";
import { getSessionCache, setSessionCache } from "@/lib/sessionCache";

export type GeocodeOptions = {
  city?: string;
  country?: string;
  depot?: MapPoint;
  maxRadiusKm?: number;
  apiKey?: string;
};

export type GeocodeResult = MapPoint & {
  placeId?: string;
  locationType?: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE";
};

const LOCATION_TYPE_WEIGHTS: Record<string, number> = {
  ROOFTOP: 1000,
  RANGE_INTERPOLATED: 500,
  GEOMETRIC_CENTER: 100,
  APPROXIMATE: 0,
};

export interface MapsProvider {
  computeRouteGeometry(points: MapPoint[], apiKey: string): Promise<RouteGeometryResult | null>;
  geocode(name: string, options?: GeocodeOptions): Promise<GeocodeResult | null>;
  autocomplete(query: string, options?: GeocodeOptions): Promise<{ label: string; point: MapPoint }[]>;
  computeETA(distanceKm: number, speedKmPerMin?: number): number;
}

function normalizePoint(point?: MapPoint | null): MapPoint | null {
  if (!point) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

function haversineDistance(p1: MapPoint, p2: MapPoint): number {
  const R = 6371;
  const dLat = ((p2.y - p1.y) * Math.PI) / 180;
  const dLon = ((p2.x - p1.x) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.y * Math.PI) / 180) *
      Math.cos((p2.y * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * R;
}

async function googleGeocode(name: string, options: GeocodeOptions = {}): Promise<GeocodeResult | null> {
  const apiKey = options.apiKey || process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return null;

  const cleanName = name.toLowerCase().trim();
  if (!cleanName) return null;

  // Check in-memory cache (1 hour TTL)
  const cacheKey = `geocode:${cleanName}:${options.city || "Nagpur"}:${options.country || "India"}`;
  const cached = getSessionCache<GeocodeResult>(cacheKey);
  if (cached) return cached;

  const city = options.city || "Nagpur";
  const country = options.country || "India";
  const depot = normalizePoint(options.depot) || { x: 79.0526, y: 21.0625 };
  const maxRadiusKm = options.maxRadiusKm ?? 70;

  const radiusKm = Math.min(Math.max(maxRadiusKm, 10), 120);
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((depot.y * Math.PI) / 180));
  const southWest = `${depot.y - latDelta},${depot.x - lngDelta}`;
  const northEast = `${depot.y + latDelta},${depot.x + lngDelta}`;
  const countryCode = country.toLowerCase() === "india" ? "IN" : "";
  const components = [
    countryCode ? `country:${countryCode}` : "",
    city ? `locality:${city}` : "",
  ].filter(Boolean).join("|");

  const params = new URLSearchParams({
    address: `${name}, ${city}, ${country}`,
    region: countryCode.toLowerCase() || "in",
    bounds: `${southWest}|${northEast}`,
    key: apiKey,
  });
  if (components) params.set("components", components);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    console.log("[MAPS API] Geocoding API called", { timestamp: new Date().toISOString(), query: cleanName });
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    let best: { point: MapPoint; score: number; placeId?: string; locationType?: GeocodeResult["locationType"] } | null = null;
    let hasHighPrecision = false;

    for (const result of results) {
      const lat = Number(result?.geometry?.location?.lat);
      const lng = Number(result?.geometry?.location?.lng);
      const point = normalizePoint({ x: lng, y: lat });
      if (!point) continue;

      const distFromDepot = haversineDistance(point, depot);
      if (distFromDepot > maxRadiusKm) continue;

      const locationType = String(result?.geometry?.location_type || "APPROXIMATE") as GeocodeResult["locationType"];
      const typeWeight = LOCATION_TYPE_WEIGHTS[locationType ?? "APPROXIMATE"] ?? 0;

      // Skip APPROXIMATE if we already have a higher-precision result
      if (typeWeight === 0 && hasHighPrecision) continue;
      if (typeWeight > 0) hasHighPrecision = true;

      const label = String(result?.formatted_address || "");
      const distanceScore = label ? Math.max(1, 100 - distFromDepot) : 0;
      const score = typeWeight + distanceScore;
      const placeId = String(result?.place_id || "");

      if (label && (!best || score > best.score)) {
        best = { point, score, placeId, locationType };
      }
    }

    if (!best) return null;
    const result: GeocodeResult = { x: best.point.x, y: best.point.y, placeId: best.placeId, locationType: best.locationType };
    setSessionCache(cacheKey, result, 60 * 60 * 1000);
    return result;
  } catch (error) {
    console.error("[maps] ❌ Google geocode failed:", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function googleAutocomplete(query: string, options: GeocodeOptions = {}): Promise<{ label: string; point: MapPoint }[]> {
  const apiKey = options.apiKey || process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) return [];

  const city = options.city || "Nagpur";
  const country = options.country || "India";
  const depot = normalizePoint(options.depot) || { x: 79.0526, y: 21.0625 };
  const radiusKm = options.maxRadiusKm ?? 70;
  const bounds = `${depot.y - radiusKm / 111},${depot.x - radiusKm / 111}|${depot.y + radiusKm / 111},${depot.x + radiusKm / 111}`;

  const params = new URLSearchParams({
    input: query,
    key: apiKey,
    location: `${depot.y},${depot.x}`,
    radius: String(Math.max(1000, radiusKm * 1000)),
    components: `country:${country.toLowerCase() === "india" ? "in" : country.toLowerCase()}`,
    bounds,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    console.log("[MAPS API] Places Autocomplete (REST) called", { timestamp: new Date().toISOString(), query });
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];

    const data = await res.json();
    const predictions: unknown[] = Array.isArray(data?.predictions) ? data.predictions : [];
    return predictions.slice(0, 5).map((prediction) => {
      const typedPrediction = prediction as { description?: unknown };
      return {
        label: String(typedPrediction.description || `${query}, ${city}, ${country}`),
        point: depot,
      };
    });
  } catch (error) {
    console.error("[maps] ❌ Google autocomplete failed:", error);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

class GoogleMapsProvider implements MapsProvider {
  async computeRouteGeometry(points: MapPoint[], apiKey: string) {
    return computeGoogleRoute(points, apiKey);
  }

  async geocode(name: string, options?: GeocodeOptions): Promise<GeocodeResult | null> {
    return googleGeocode(name, options);
  }

  async autocomplete(query: string, options?: GeocodeOptions) {
    return googleAutocomplete(query, options);
  }

  computeETA(distanceKm: number, speedKmPerMin = 0.5) {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
    if (!Number.isFinite(speedKmPerMin) || speedKmPerMin <= 0) return 0;
    return Math.max(1, Math.round(distanceKm / speedKmPerMin));
  }
}

export const mapsProvider: MapsProvider = new GoogleMapsProvider();
