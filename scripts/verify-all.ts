/**
 * ETMS Verification Suite
 * Run: npx ts-node --project tsconfig.json scripts/verify-all.ts
 *
 * Pure-function tests — no server, no DB, no Google API needed.
 * Imports only from src/lib/zones.ts (haversine, assignZone, etc.)
 */

import {
  assignZone,
  haversineKm,
  driverZoneMatchScore,
  MIHAN,
} from "../src/lib/zones";

// ──────────────────────────────────────────────────────────────
// Test runner
// ──────────────────────────────────────────────────────────────

type TestResult = { name: string; passed: boolean; reason?: string };
const results: TestResult[] = [];

function test(name: string, fn: () => boolean | string): void {
  try {
    const result = fn();
    if (result === true) {
      results.push({ name, passed: true });
      console.log(`  ✅ PASS  ${name}`);
    } else {
      results.push({ name, passed: false, reason: String(result) });
      console.log(`  ❌ FAIL  ${name}`);
      console.log(`     → ${result}`);
    }
  } catch (err: any) {
    results.push({ name, passed: false, reason: `THREW: ${err.message}` });
    console.log(`  💥 ERROR ${name} — ${err.message}`);
  }
}

function section(title: string): void {
  console.log(`\nSection ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`);
}

function near(actual: number, expected: number, tol: number): boolean | string {
  const ok = Math.abs(actual - expected) <= tol;
  return ok ? true : `expected ~${expected} ±${tol}, got ${actual.toFixed(4)}`;
}

// ──────────────────────────────────────────────────────────────
// Inline pure helpers (independent copies for testing)
// ──────────────────────────────────────────────────────────────

function fleetSize(employees: number, capacity: number): number {
  if (employees <= 0 || capacity <= 0) return 0;
  return Math.ceil(employees / capacity);
}

function nearestFirst(
  start: { x: number; y: number },
  employees: { id: string; x: number; y: number }[]
): { id: string; x: number; y: number }[] {
  if (employees.length === 0) return [];
  const result: typeof employees = [];
  const remaining = [...employees];
  let current = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current.y, current.x, remaining[i].y, remaining[i].x);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    result.push(remaining[bestIdx]);
    current = remaining[bestIdx];
    remaining.splice(bestIdx, 1);
  }
  return result;
}

interface MockStop { employee: { gender: string }; stopOrder: number }
interface MockViolation { type: string; resolved: boolean }

function checkSafetyViolations(
  stops: MockStop[],
  totalStops: number,
  isNightShift: boolean,
  isEarlyMorning: boolean,
  requiresEscort: boolean,
): MockViolation[] {
  const violations: MockViolation[] = [];
  const females = stops.filter(s => s.employee.gender === "F");
  const hasEscort = stops.some(s => s.employee.gender === "F") &&
    stops.filter(s => s.employee.gender === "F").length >= 2;

  for (const stop of stops) {
    if (stop.employee.gender !== "F") continue;
    if (requiresEscort && !hasEscort && stop.stopOrder === 1) {
      violations.push({ type: "FEMALE_FIRST_PICKUP", resolved: false });
    }
    if (requiresEscort && !hasEscort && stop.stopOrder === totalStops) {
      violations.push({ type: "FEMALE_LAST_DROP", resolved: false });
    }
  }

  if ((isNightShift || isEarlyMorning) && females.length === 1 && stops.length > 1) {
    violations.push({ type: "ISOLATED_FEMALE_NIGHT", resolved: false });
  }

  return violations;
}

function classifyShift(timeStr: string): {
  isEarlyMorning: boolean;
  isNight: boolean;
  requiresEscort: boolean;
} {
  const [h, m] = timeStr.split(":").map(Number);
  const totalMin = h * 60 + (m || 0);
  const isEarlyMorning = totalMin >= 4 * 60 && totalMin < 6 * 60;        // 04:00–06:00
  const isNight = totalMin >= 21 * 60 || totalMin < 4 * 60;              // 21:00–04:00
  const requiresEscort = isNight || isEarlyMorning;
  return { isEarlyMorning, isNight, requiresEscort };
}

// ──────────────────────────────────────────────────────────────
// SECTION 1 — Zone Assignment (14 tests)
// ──────────────────────────────────────────────────────────────

section("1: Zone Assignment");

const zoneTests = [
  { x: 79.08,  y: 21.16,  zone: "N", sub: "NE", name: "Manish Nagar"         },
  { x: 79.02,  y: 21.15,  zone: "N", sub: "NW", name: "Gittikhadan"          },
  { x: 79.18,  y: 21.07,  zone: "E", sub: "NE", name: "Wardha Road"          },
  { x: 78.92,  y: 21.09,  zone: "W", sub: "NW", name: "Koradi"               },
  { x: 79.07,  y: 20.92,  zone: "S", sub: "SE", name: "Butibori"             },
  { x: 78.94,  y: 20.95,  zone: "W", sub: "SW", name: "Amravati Rd S"        },
  { x: 78.89,  y: 21.04,  zone: "W", sub: "SW", name: "Amravati Rd W"        },
  { x: 79.13,  y: 21.10,  zone: "E", sub: "NE", name: "Besa"                 },
  { x: 79.0526 + 0.05, y: 21.0625 + 0.05, zone: "N", sub: "NE", name: "NE diagonal" },
  { x: 79.0526 - 0.05, y: 21.0625 - 0.05, zone: "S", sub: "SW", name: "SW diagonal" },
  { x: 79.0526, y: 21.0625, zone: "N", sub: "NE", name: "At MIHAN"           },
  { x: 79.10,   y: 21.0625, zone: "E", sub: "NE", name: "Due east"           },
  { x: 79.0526, y: 21.10,   zone: "N", sub: "NE", name: "Due north"          },
  { x: 79.15,   y: 21.18,   zone: "N", sub: "NE", name: "Far NE — primary must be N" },
];

for (const tc of zoneTests) {
  test(`${tc.name} → ${tc.zone}/${tc.sub}`, () => {
    const r = assignZone(tc.x, tc.y);
    if (r.zone !== tc.zone) return `zone: expected ${tc.zone}, got ${r.zone}`;
    if (r.subZone !== tc.sub) return `subZone: expected ${tc.sub}, got ${r.subZone}`;
    if (["NE","NW","SE","SW"].includes(r.zone)) return `zone must never be a sub-zone, got ${r.zone}`;
    return true;
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION 2 — Haversine Distance (6 tests)
// ──────────────────────────────────────────────────────────────

section("2: Haversine Distance");

test("Same point → 0 km", () => {
  const d = haversineKm(21.0625, 79.0526, 21.0625, 79.0526);
  return d === 0 ? true : `expected 0, got ${d}`;
});

test("MIHAN → (21.07, 79.12) ≈ 7 km ±1.5", () => near(
  haversineKm(21.0625, 79.0526, 21.07, 79.12), 7, 1.5
));

test("MIHAN → Manish Nagar (21.16, 79.08) ≈ 11.5 km ±1.5", () => near(
  haversineKm(21.0625, 79.0526, 21.16, 79.08), 11.5, 1.5
));

test("Symmetry: A→B === B→A", () => {
  const ab = haversineKm(21.0625, 79.0526, 21.16, 79.08);
  const ba = haversineKm(21.16, 79.08, 21.0625, 79.0526);
  return Math.abs(ab - ba) < 0.001 ? true : `A→B=${ab.toFixed(4)}, B→A=${ba.toFixed(4)}`;
});

test("Always >= 0", () => {
  const cases = [
    [21.0, 79.0, 21.5, 79.5],
    [21.5, 79.5, 21.0, 79.0],
    [0, 0, 0, 0],
  ];
  for (const [a, b, c, d] of cases) {
    if (haversineKm(a, b, c, d) < 0) return `got negative for (${a},${b},${c},${d})`;
  }
  return true;
});

test("No NaN for any input", () => {
  const cases = [
    [0, 0, 0, 0],
    [21.0625, 79.0526, 21.0625, 79.0526],
    [-90, -180, 90, 180],
  ];
  for (const [a, b, c, d] of cases) {
    const v = haversineKm(a, b, c, d);
    if (isNaN(v)) return `got NaN for (${a},${b},${c},${d})`;
  }
  return true;
});

// ──────────────────────────────────────────────────────────────
// SECTION 3 — Distance Ring (6 tests)
// ──────────────────────────────────────────────────────────────

section("3: Distance Ring");

const ringTests = [
  { x: MIHAN.lng,     y: MIHAN.lat,     expected: "NEAR", name: "At MIHAN"         },
  { x: MIHAN.lng + 0.02, y: MIHAN.lat, expected: "NEAR", name: "~2 km away"        },
  { x: MIHAN.lng + 0.06, y: MIHAN.lat, expected: "MID",  name: "~6 km away"        },
  { x: MIHAN.lng + 0.12, y: MIHAN.lat, expected: "MID",  name: "~13 km away"       },
  { x: MIHAN.lng + 0.16, y: MIHAN.lat, expected: "FAR",  name: "~17 km away"     },
  { x: 79.07,         y: 20.92,        expected: "FAR",  name: "Butibori (~20km)"  },
];

for (const tc of ringTests) {
  test(`${tc.name} → ${tc.expected}`, () => {
    const { distanceRing, distanceFromDepotKm } = assignZone(tc.x, tc.y);
    if (distanceRing !== tc.expected)
      return `expected ${tc.expected}, got ${distanceRing} (${distanceFromDepotKm.toFixed(2)} km)`;
    return true;
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION 4 — Corridor Perpendicular Distance (4 tests, pure geometry)
// ──────────────────────────────────────────────────────────────

section("4: Perpendicular Distance (geometry)");

/** Perpendicular distance from point P to line segment A→B, in km */
function perpKm(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby + 1e-12)));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return haversineKm(py, px, closestY, closestX);
}

// NE corridor: MIHAN → Wardha Road (79.18, 21.07)
const corridorAX = MIHAN.lng, corridorAY = MIHAN.lat;
const corridorBX = 79.18,    corridorBY = 21.07;

test("Employee ON corridor → perpendicular < 0.5 km", () => {
  // Midpoint of corridor ≈ on the line
  const mid = perpKm(
    (corridorAX + corridorBX) / 2, (corridorAY + corridorBY) / 2,
    corridorAX, corridorAY, corridorBX, corridorBY
  );
  return mid < 0.5 ? true : `expected < 0.5 km, got ${mid.toFixed(4)}`;
});

test("Koradi (far W, 78.92, 21.09) far from NE corridor → > 10 km", () => {
  const d = perpKm(78.92, 21.09, corridorAX, corridorAY, corridorBX, corridorBY);
  return d > 10 ? true : `expected > 10 km, got ${d.toFixed(4)}`;
});

test("Nearby employee 2km from corridor → < 3 km", () => {
  // Just north of corridor midpoint
  const d = perpKm(79.12, 21.08, corridorAX, corridorAY, corridorBX, corridorBY);
  return d < 3 ? true : `expected < 3 km, got ${d.toFixed(4)}`;
});

test("Perpendicular result always >= 0", () => {
  const cases = [
    [79.0, 21.0], [79.1, 21.1], [78.9, 20.9], [79.3, 21.3],
  ];
  for (const [px, py] of cases) {
    const d = perpKm(px, py, corridorAX, corridorAY, corridorBX, corridorBY);
    if (d < 0) return `got negative: ${d} for (${px},${py})`;
  }
  return true;
});

// ──────────────────────────────────────────────────────────────
// SECTION 5 — Fleet Sizing (8 tests)
// ──────────────────────────────────────────────────────────────

section("5: Fleet Sizing");

const fleetTests: [number, number, number][] = [
  [53, 6, 9],
  [53, 7, 8],
  [45, 6, 8],
  [0,  6, 0],
  [1,  6, 1],
  [6,  6, 1],
  [7,  6, 2],
  [20, 6, 4],
];

for (const [emp, cap, expected] of fleetTests) {
  test(`ceil(${emp}/${cap}) = ${expected}`, () => {
    const got = fleetSize(emp, cap);
    return got === expected ? true : `expected ${expected}, got ${got}`;
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION 6 — Nearest Neighbor Ordering (3 tests)
// ──────────────────────────────────────────────────────────────

section("6: Nearest Neighbor Ordering");

const depot = { x: MIHAN.lng, y: MIHAN.lat };
const empA  = { id: "A", x: 79.06, y: 21.07 }; // ~1.5 km
const empB  = { id: "B", x: 79.10, y: 21.09 }; // ~5 km
const empC  = { id: "C", x: 79.14, y: 21.11 }; // ~9 km

test("3 employees: nearest to depot is first", () => {
  const ordered = nearestFirst(depot, [empC, empA, empB]);
  return ordered[0].id === "A" ? true : `expected A first, got ${ordered[0].id}`;
});

test("1 employee: returns single-item list", () => {
  const ordered = nearestFirst(depot, [empB]);
  return ordered.length === 1 && ordered[0].id === "B" ? true : `got ${JSON.stringify(ordered)}`;
});

test("4 employees: no duplicates, all visited", () => {
  const empD = { id: "D", x: 79.08, y: 21.05 };
  const ordered = nearestFirst(depot, [empA, empB, empC, empD]);
  const ids = ordered.map(e => e.id).sort();
  const expected = ["A", "B", "C", "D"].sort();
  return JSON.stringify(ids) === JSON.stringify(expected)
    ? true
    : `expected all 4 unique, got ${ids}`;
});

// ──────────────────────────────────────────────────────────────
// SECTION 7 — Safety Violations (6 tests)
// ──────────────────────────────────────────────────────────────

section("7: Safety Violations");

const nightShift = { isNight: true, isEarlyMorning: false, requiresEscort: true };
const morningShift = { isNight: false, isEarlyMorning: true, requiresEscort: true };
const dayShift = { isNight: false, isEarlyMorning: false, requiresEscort: false };

test("Female first stop, no escort → FEMALE_FIRST_PICKUP", () => {
  const stops = [
    { employee: { gender: "F" }, stopOrder: 1 },
    { employee: { gender: "M" }, stopOrder: 2 },
    { employee: { gender: "M" }, stopOrder: 3 },
  ];
  const v = checkSafetyViolations(stops, 3, nightShift.isNight, nightShift.isEarlyMorning, nightShift.requiresEscort);
  return v.some(x => x.type === "FEMALE_FIRST_PICKUP") ? true : `no FEMALE_FIRST_PICKUP in ${JSON.stringify(v)}`;
});

test("Female last stop, no escort → FEMALE_LAST_DROP", () => {
  const stops = [
    { employee: { gender: "M" }, stopOrder: 1 },
    { employee: { gender: "M" }, stopOrder: 2 },
    { employee: { gender: "F" }, stopOrder: 3 },
  ];
  const v = checkSafetyViolations(stops, 3, nightShift.isNight, nightShift.isEarlyMorning, nightShift.requiresEscort);
  return v.some(x => x.type === "FEMALE_LAST_DROP") ? true : `no FEMALE_LAST_DROP in ${JSON.stringify(v)}`;
});

test("Sole female, night shift → ISOLATED_FEMALE_NIGHT", () => {
  const stops = [
    { employee: { gender: "F" }, stopOrder: 2 },
    { employee: { gender: "M" }, stopOrder: 1 },
    { employee: { gender: "M" }, stopOrder: 3 },
  ];
  const v = checkSafetyViolations(stops, 3, true, false, true);
  return v.some(x => x.type === "ISOLATED_FEMALE_NIGHT") ? true : `no ISOLATED_FEMALE_NIGHT`;
});

test("Sole female, APAC (05:00) → ISOLATED_FEMALE_NIGHT", () => {
  const stops = [
    { employee: { gender: "F" }, stopOrder: 1 },
    { employee: { gender: "M" }, stopOrder: 2 },
  ];
  const v = checkSafetyViolations(stops, 2, false, true, true);
  return v.some(x => x.type === "ISOLATED_FEMALE_NIGHT") ? true : `no ISOLATED_FEMALE_NIGHT`;
});

test("Two females (escort present): no FIRST_PICKUP even if female is first", () => {
  const stops = [
    { employee: { gender: "F" }, stopOrder: 1 },
    { employee: { gender: "F" }, stopOrder: 2 },
    { employee: { gender: "M" }, stopOrder: 3 },
  ];
  const v = checkSafetyViolations(stops, 3, true, false, true);
  const bad = v.filter(x => x.type === "FEMALE_FIRST_PICKUP" || x.type === "FEMALE_LAST_DROP");
  return bad.length === 0 ? true : `unexpected violations: ${JSON.stringify(bad)}`;
});

test("All male route: zero violations", () => {
  const stops = [
    { employee: { gender: "M" }, stopOrder: 1 },
    { employee: { gender: "M" }, stopOrder: 2 },
    { employee: { gender: "M" }, stopOrder: 3 },
  ];
  const v = checkSafetyViolations(stops, 3, true, false, true);
  return v.length === 0 ? true : `expected 0 violations, got ${v.length}`;
});

// ──────────────────────────────────────────────────────────────
// SECTION 8 — Shift Classification (6 tests)
// ──────────────────────────────────────────────────────────────

section("8: Shift Classification");

const shiftTests: [string, Partial<ReturnType<typeof classifyShift>>][] = [
  ["05:00", { isEarlyMorning: true,  requiresEscort: true,  isNight: false }],
  ["08:00", { isEarlyMorning: false, requiresEscort: false, isNight: false }],
  ["14:00", { isNight: false,        requiresEscort: false                 }],
  ["22:00", { isNight: true,         requiresEscort: true                  }],
  ["00:30", { isNight: true,         requiresEscort: true                  }],
  ["11:30", { isEarlyMorning: false, requiresEscort: false, isNight: false }],
];

for (const [time, expected] of shiftTests) {
  test(`${time} shift classification`, () => {
    const got = classifyShift(time);
    for (const [k, v] of Object.entries(expected)) {
      if ((got as any)[k] !== v)
        return `${k}: expected ${v}, got ${(got as any)[k]}`;
    }
    return true;
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION 9 — Driver Zone Match Score (3 tests)
// ──────────────────────────────────────────────────────────────

section("9: Driver Zone Match Score");

// Driver in N zone (north of MIHAN)
const driverNorth = { x: MIHAN.lng + 0.02, y: MIHAN.lat + 0.05 };
// Driver in S zone (south of MIHAN)
const driverSouth = { x: MIHAN.lng,        y: MIHAN.lat - 0.05 };
// Driver in E zone
const driverEast  = { x: MIHAN.lng + 0.08, y: MIHAN.lat        };

test("Driver N zone, target N → 1.0", () => {
  const score = driverZoneMatchScore(driverNorth.x, driverNorth.y, "N");
  return score === 1.0 ? true : `expected 1.0, got ${score}`;
});

test("Driver N zone, target S → 0", () => {
  const score = driverZoneMatchScore(driverNorth.x, driverNorth.y, "S");
  return score === 0 ? true : `expected 0, got ${score}`;
});

test("Driver E zone, target N → 0.5 (adjacent)", () => {
  const score = driverZoneMatchScore(driverEast.x, driverEast.y, "N");
  return score === 0.5 ? true : `expected 0.5, got ${score}`;
});

// ──────────────────────────────────────────────────────────────
// SECTION 10 — Edge Conditions (7 tests)
// ──────────────────────────────────────────────────────────────

section("10: Edge Conditions");

test("assignZone(0, 0) — ocean point does not throw", () => {
  const r = assignZone(0, 0);
  return typeof r.zone === "string" ? true : "threw or returned non-string zone";
});

test("haversineKm identical points → 0, not NaN", () => {
  const d = haversineKm(21.0625, 79.0526, 21.0625, 79.0526);
  return d === 0 && !isNaN(d) ? true : `got ${d}`;
});

test("Fleet sizing 0 employees → 0 cabs", () => {
  return fleetSize(0, 6) === 0 ? true : `got ${fleetSize(0, 6)}`;
});

test("Zone primary is NEVER NE/NW/SE/SW (20 random points)", () => {
  const badZones = new Set(["NE", "NW", "SE", "SW"]);
  const points = Array.from({ length: 20 }, (_, i) => ({
    x: 78.8 + Math.random() * 0.6,
    y: 20.9 + Math.random() * 0.4,
  }));
  for (const { x, y } of points) {
    const { zone } = assignZone(x, y);
    if (badZones.has(zone)) return `zone was ${zone} (a sub-zone) for x=${x},y=${y}`;
  }
  return true;
});

test("Employee exactly at MIHAN lng → zone is N or S", () => {
  const { zone } = assignZone(MIHAN.lng, MIHAN.lat + 0.05); // due north
  return zone === "N" ? true : `expected N, got ${zone}`;
});

test("Employee exactly at MIHAN lat → zone is E or W", () => {
  const { zone } = assignZone(MIHAN.lng + 0.05, MIHAN.lat); // due east
  return zone === "E" ? true : `expected E, got ${zone}`;
});

test("Overflow absorption: 10 emp, cap 6 → ceil(10/6) = 2 cabs minimum", () => {
  return fleetSize(10, 6) === 2 ? true : `expected 2, got ${fleetSize(10, 6)}`;
});

// ──────────────────────────────────────────────────────────────
// SECTION 11 — Real Data Regression (5 tests from June Excel)
// ──────────────────────────────────────────────────────────────

section("11: Real Data Regression");

const regressionTests = [
  { name: "Geeta Rajput (Wardha Rd)",   x: 79.09, y: 21.12, zone: "N", sub: "NE", ring: "MID" },
  { name: "Azad Bhasme (Madhuban)",      x: 79.10, y: 21.14, zone: "N", sub: "NE", ring: "MID" },
  { name: "Shreya Karale (Hingna)",      x: 78.98, y: 21.01, zone: "W", sub: "SW", ring: "MID" },
  { name: "Kalamna area",                x: 78.95, y: 21.09, zone: "W", sub: "NW", ring: "MID" },
  { name: "Shubhankar Das (Plot 57)",    x: 79.09, y: 20.98, zone: "S", sub: "SE", ring: "MID" },
];

for (const tc of regressionTests) {
  test(`${tc.name} → ${tc.zone}/${tc.sub}/${tc.ring}`, () => {
    const r = assignZone(tc.x, tc.y);
    if (r.zone !== tc.zone)        return `zone: expected ${tc.zone}, got ${r.zone}`;
    if (r.subZone !== tc.sub)      return `subZone: expected ${tc.sub}, got ${r.subZone}`;
    if (r.distanceRing !== tc.ring) return `ring: expected ${tc.ring}, got ${r.distanceRing}`;
    return true;
  });
}

// ──────────────────────────────────────────────────────────────
// Excel parser & nearest-male-first
// ──────────────────────────────────────────────────────────────

section("Excel sheet date inference");
{
  function inferDateFromSheetName(name: string): string | null {
    const MONTH_MAP: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const trimmed = name.trim();
    const iso = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dMonY = trimmed.match(/(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/i);
    if (dMonY) {
      const mm = MONTH_MAP[dMonY[2].toLowerCase().slice(0, 3)];
      if (mm) return `${dMonY[3]}-${mm}-${dMonY[1].padStart(2, "0")}`;
    }
    return null;
  }

  test("inferDateFromSheetName — ISO format", () => {
    return inferDateFromSheetName("2026-06-01") === "2026-06-01" ? true : "expected 2026-06-01";
  });

  test("inferDateFromSheetName — DD-MMM-YYYY", () => {
    return inferDateFromSheetName("01-Jun-2026") === "2026-06-01" ? true : "expected 2026-06-01";
  });
}

section("Nearest male first pickup");
{
  type Emp = { id: string; name: string; gender: "MALE" | "FEMALE"; x: number; y: number };

  function reorderWithNearestMaleFirst(route: Emp[], depot: { x: number; y: number }): Emp[] {
    if (route.length <= 1) return route;
    const males = route.filter((e) => e.gender === "MALE");
    if (males.length === 0) return route;
    let nearestMale = males[0];
    let minDist = haversineKm(depot.y, depot.x, nearestMale.y, nearestMale.x);
    for (const m of males) {
      const d = haversineKm(depot.y, depot.x, m.y, m.x);
      if (d < minDist) { minDist = d; nearestMale = m; }
    }
    const remaining = route.filter((e) => e.id !== nearestMale.id);
    const ordered: Emp[] = [nearestMale];
    let current = nearestMale;
    while (remaining.length > 0) {
      let nearIdx = 0;
      let nearDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(current.y, current.x, remaining[i].y, remaining[i].x);
        if (d < nearDist) { nearDist = d; nearIdx = i; }
      }
      ordered.push(remaining.splice(nearIdx, 1)[0]);
      current = ordered[ordered.length - 1];
    }
    return ordered;
  }

  test("reorderWithNearestMaleFirst — female closest still picks nearest male first", () => {
    const depot = { x: 79.0526, y: 21.0625 };
    const employees: Emp[] = [
      { id: "f1", name: "Female Near", gender: "FEMALE", x: 79.053, y: 21.063 },
      { id: "m1", name: "Male Far", gender: "MALE", x: 79.12, y: 21.14 },
      { id: "m2", name: "Male Near", gender: "MALE", x: 79.054, y: 21.064 },
    ];
    const ordered = reorderWithNearestMaleFirst(employees, depot);
    if (ordered[0].gender !== "MALE") return "first stop must be male";
    if (ordered[0].id !== "m2") return `expected nearest male m2, got ${ordered[0].id}`;
    return true;
  });

  test("reorderWithNearestMaleFirst — all male unchanged length", () => {
    const employees: Emp[] = [
      { id: "m1", name: "M1", gender: "MALE", x: 79.1, y: 21.1 },
      { id: "m2", name: "M2", gender: "MALE", x: 79.2, y: 21.2 },
    ];
    const ordered = reorderWithNearestMaleFirst(employees, { x: 79.05, y: 21.06 });
    return ordered.length === 2 ? true : "expected 2 stops";
  });
}

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────

const failed = results.filter(r => !r.passed);
const total  = results.length;
const passed = total - failed.length;

console.log("\n" + "═".repeat(54));
console.log("  ETMS VERIFICATION SUITE — RESULTS");
console.log("═".repeat(54));
console.log(`  RESULT: ${passed}/${total} tests passed`);

if (failed.length > 0) {
  console.log("\n  FAILED:");
  for (const f of failed) {
    console.log(`  ✗ ${f.name}`);
    if (f.reason) console.log(`    → ${f.reason}`);
  }
}

console.log("═".repeat(54));

process.exit(failed.length > 0 ? 1 : 0);
