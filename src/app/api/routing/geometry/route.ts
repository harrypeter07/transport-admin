import { NextRequest, NextResponse } from "next/server";

type LatLng = [number, number];

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const GOOGLE_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

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

function buildOsrmUrl(coords: LatLng[]) {
 const coordsStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(";");
 const radiuses = coords.map(() => "1000").join(";");
 return `${OSRM_BASE_URL}/${coordsStr}?overview=full&geometries=geojson&steps=false&continue_straight=false&radiuses=${radiuses}`;
}

function formatGoogleLatLng([lat, lng]: LatLng) {
 return `${lat},${lng}`;
}

function decodeGooglePolyline(encoded: string): LatLng[] {
 const coordinates: LatLng[] = [];
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

async function fetchGoogleDirectionsGeometry(coords: LatLng[]): Promise<LatLng[] | null> {
 const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
 if (!apiKey || coords.length < 2) return null;

 // Legacy Directions supports practical waypoint limits; longer routes are handled leg-by-leg below.
 if (coords.length > 25) return null;

 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), 6000);

 try {
 const params = new URLSearchParams({
 origin: formatGoogleLatLng(coords[0]),
 destination: formatGoogleLatLng(coords[coords.length - 1]),
 mode: "driving",
 alternatives: "false",
 key: apiKey,
 });

 const waypoints = coords.slice(1, -1).map(formatGoogleLatLng);
 if (waypoints.length > 0) {
 params.set("waypoints", waypoints.join("|"));
 }

 const res = await fetch(`${GOOGLE_DIRECTIONS_URL}?${params.toString()}`, {
 signal: controller.signal,
 cache: "no-store",
 });

 if (!res.ok) return null;

 const data = await res.json();
 const encodedPolyline = data?.routes?.[0]?.overview_polyline?.points;
 if (data?.status !== "OK" || typeof encodedPolyline !== "string") {
 return null;
 }

 const decoded = decodeGooglePolyline(encodedPolyline);
 return decoded.length > coords.length ? decoded : null;
 } catch {
 return null;
 } finally {
 clearTimeout(timeoutId);
 }
}

async function fetchOsrmGeometry(coords: LatLng[]): Promise<LatLng[] | null> {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), 6000);

 try {
 const res = await fetch(buildOsrmUrl(coords), {
 signal: controller.signal,
 cache: "no-store",
 headers: {
 "User-Agent": "TransitAdminPOC/1.0",
 },
 });

 if (!res.ok) return null;

 const data = await res.json();
 if (data?.code !== "Ok" || !data?.routes?.[0]?.geometry?.coordinates) {
 return null;
 }

 return data.routes[0].geometry.coordinates.map((coord: [number, number]) => [
 coord[1],
 coord[0],
 ]);
 } catch {
 return null;
 } finally {
 clearTimeout(timeoutId);
 }
}

async function fetchBestProviderGeometry(coords: LatLng[]) {
 const googleGeometry = await fetchGoogleDirectionsGeometry(coords);
 if (googleGeometry && googleGeometry.length > coords.length) {
 return { coordinates: googleGeometry, source: "google-directions" };
 }

 const osrmGeometry = await fetchOsrmGeometry(coords);
 if (osrmGeometry && osrmGeometry.length > coords.length) {
 return { coordinates: osrmGeometry, source: "osrm" };
 }

 return null;
}

async function fetchLegByLegGeometry(coords: LatLng[]) {
 const geometry: LatLng[] = [];
 let googleLegs = 0;
 let osrmLegs = 0;

 for (let i = 0; i < coords.length - 1; i++) {
 const googleLeg = await fetchGoogleDirectionsGeometry([coords[i], coords[i + 1]]);
 if (googleLeg && googleLeg.length > 2) {
 googleLegs += 1;
 }

 const osrmLeg = googleLeg ? null : await fetchOsrmGeometry([coords[i], coords[i + 1]]);
 if (!googleLeg && osrmLeg && osrmLeg.length > 2) {
 osrmLegs += 1;
 }

 const leg = googleLeg || osrmLeg;
 const legGeometry = leg && leg.length > 0 ? leg : [coords[i], coords[i + 1]];

 if (geometry.length > 0) {
 geometry.push(...legGeometry.slice(1));
 } else {
 geometry.push(...legGeometry);
 }
 }

 const source =
 googleLegs > 0
 ? "google-directions-leg-by-leg"
 : osrmLegs > 0
 ? "osrm-leg-by-leg"
 : "fallback";

 return { coordinates: geometry.length > 0 ? geometry : coords, source };
}

export async function POST(req: NextRequest) {
 try {
 const body = await req.json();
 const coords = body?.coords;

 if (!Array.isArray(coords) || coords.length < 2 || coords.length > 30) {
 return NextResponse.json(
 { error: "coords must contain 2 to 30 [lat, lng] points" },
 { status: 400 }
 );
 }

 if (!coords.every(isValidLatLng)) {
 return NextResponse.json({ error: "coords contains invalid coordinates" }, { status: 400 });
 }

 const fullGeometry = await fetchBestProviderGeometry(coords);
 if (fullGeometry) {
 return NextResponse.json(fullGeometry);
 }

 const legGeometry = await fetchLegByLegGeometry(coords);
 return NextResponse.json({
 coordinates: legGeometry.coordinates,
 source: legGeometry.source,
 });
 } catch (e: any) {
 return NextResponse.json(
 { error: "Failed to fetch routing geometry", details: e?.message || "Unknown error" },
 { status: 500 }
 );
 }
}
