// ─── CONSTANTS ───────────────────────────────────────────────
export const MIHAN = { lat: 21.0625, lng: 79.0526 }; // y=lat, x=lng

export const ZONE_LABELS: Record<string, string> = {
  N: "North Nagpur",
  S: "South Nagpur",
  E: "East Nagpur",
  W: "West Nagpur",
};

export const SUBZONE_LABELS: Record<string, string> = {
  NE: "Northeast (Besa / Beltarodi)",
  NW: "Northwest (Mankapur / Gittikhadan)",
  SE: "Southeast (Hingna / Wadi)",
  SW: "Southwest (Amravati Road / Nari)",
};

/** Primary zone colours — N/S/E/W only */
export const ZONE_COLORS: Record<string, string> = {
  N: "#3B82F6", // blue
  S: "#EF4444", // red
  E: "#10B981", // green
  W: "#F59E0B", // amber
};

/** Sub-zone colours — NE/NW/SE/SW */
export const SUBZONE_COLORS: Record<string, string> = {
  NE: "#6366F1", // indigo
  NW: "#8B5CF6", // violet
  SE: "#EC4899", // pink
  SW: "#F97316", // orange
};

// ─── CORE ASSIGNMENT ─────────────────────────────────────────
/**
 * Assigns a Nagpur employee to a primary zone (N/S/E/W) and sub-zone (NE/NW/SE/SW).
 * Convention: empX = longitude, empY = latitude.
 *
 * Primary zone: dominant axis wins.
 *   |dLat| >= |dLng|  →  N (north) or S (south)
 *   |dLng|  > |dLat|  →  E (east)  or W (west)
 *
 * Sub-zone: always the 2-letter diagonal (NE/NW/SE/SW).
 */
export function assignZone(empX: number, empY: number): {
  zone: string;       // ONLY: 'N' | 'S' | 'E' | 'W'
  subZone: string;    // ONLY: 'NE' | 'NW' | 'SE' | 'SW'
  distanceRing: string;        // 'NEAR' | 'MID' | 'FAR'
  distanceFromDepotKm: number;
} {
  const dLat = empY - MIHAN.lat; // y = latitude
  const dLng = empX - MIHAN.lng; // x = longitude

  // Primary zone: whichever axis has greater absolute displacement wins
  const zone =
    Math.abs(dLat) >= Math.abs(dLng)
      ? dLat >= 0
        ? "N"
        : "S"
      : dLng >= 0
        ? "E"
        : "W";

  // Sub-zone: always a 2-letter diagonal — never equals primary zone
  const subZone = (dLat >= 0 ? "N" : "S") + (dLng >= 0 ? "E" : "W");

  const distanceFromDepotKm = haversineKm(MIHAN.lat, MIHAN.lng, empY, empX);

  const distanceRing =
    distanceFromDepotKm <= 5 ? "NEAR" : distanceFromDepotKm <= 15 ? "MID" : "FAR";

  return { zone, subZone, distanceRing, distanceFromDepotKm };
}

// ─── HAVERSINE (lat/lng order — standard) ────────────────────
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── ZONE BOUNDARY BOX (for map rendering) ───────────────────
export function getZoneBounds(zone: string): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  const { lat, lng } = MIHAN;
  switch (zone) {
    case "N":
      return { north: lat + 0.25, south: lat, east: lng + 0.25, west: lng - 0.25 };
    case "S":
      return { north: lat, south: lat - 0.25, east: lng + 0.25, west: lng - 0.25 };
    case "E":
      return { north: lat + 0.25, south: lat - 0.25, east: lng + 0.25, west: lng };
    case "W":
      return { north: lat + 0.25, south: lat - 0.25, east: lng, west: lng - 0.25 };
    default:
      return { north: lat + 0.25, south: lat - 0.25, east: lng + 0.25, west: lng - 0.25 };
  }
}

// ─── SUBZONE BOUNDARY BOX ────────────────────────────────────
export function getSubZoneBounds(subZone: string): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  const { lat, lng } = MIHAN;
  switch (subZone) {
    case "NE":
      return { north: lat + 0.25, south: lat, east: lng + 0.25, west: lng };
    case "NW":
      return { north: lat + 0.25, south: lat, east: lng, west: lng - 0.25 };
    case "SE":
      return { north: lat, south: lat - 0.25, east: lng + 0.25, west: lng };
    case "SW":
      return { north: lat, south: lat - 0.25, east: lng, west: lng - 0.25 };
    default:
      return { north: lat + 0.25, south: lat - 0.25, east: lng + 0.25, west: lng - 0.25 };
  }
}

// ─── DRIVER ZONE MATCH SCORE ─────────────────────────────────
/**
 * Returns how well a driver's home zone matches a target zone.
 * 1.0 = exact match, 0.5 = adjacent primary zone, 0 = opposite.
 */
export function driverZoneMatchScore(
  driverX: number,
  driverY: number,
  targetZone: string
): number {
  const { zone } = assignZone(driverX, driverY);
  if (zone === targetZone) return 1.0;
  // Adjacent primary zones (share a boundary)
  const adjacent: Record<string, string[]> = {
    N: ["E", "W"],
    S: ["E", "W"],
    E: ["N", "S"],
    W: ["N", "S"],
  };
  if (adjacent[targetZone]?.includes(zone)) return 0.5;
  return 0;
}
