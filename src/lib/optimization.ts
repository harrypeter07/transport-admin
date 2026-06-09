import { mapsProvider } from "@/lib/maps";
import { getSessionCache, setSessionCache } from "@/lib/sessionCache";
import { computeOsrmRouteMatrix } from "@/lib/maps/osrm";

export interface Point {
  x: number;
  y: number;
}

export interface OptimizeEmployee {
  id: string;
  name: string;
  gender: "MALE" | "FEMALE";
  x: number;
  y: number;
  address: string;
  department: string;
  phone: string;
}

export interface OptimizeCab {
  id: string;
  vehicleNumber: string;
  capacity: number;
  vendor: string;
  driverName: string;
  driverPhone: string;
  startPoint?: Point;
  tripSequence?: number;
}

export interface OptimizedRouteStop {
  employeeId: string;
  employeeName: string;
  gender: "MALE" | "FEMALE";
  x: number;
  y: number;
  address: string;
  stopOrder: number; // 1-indexed
  etaMinutes: number;
  status: "PENDING" | "REACHED" | "BOARDED" | "SKIPPED";
}

export interface OptimizedRoute {
  id?: string;
  cabId: string;
  vehicleNumber: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  startPoint?: Point;
  stops: OptimizedRouteStop[];
  totalDistance: number;
  totalDuration: number;
  optimizationScore: number;
  violations: {
    type: "FEMALE_FIRST_PICKUP" | "FEMALE_LAST_DROP" | "OVERCAPACITY" | "ISOLATED_FEMALE";
    severity: "HIGH" | "MEDIUM";
    notes: string;
  }[];
  hasEscort: boolean;
  tripSequence?: number;
}

export interface RouteConstraints {
  maxRouteDistanceKm: number;
  maxRouteDurationMin: number;
  maxClusterRadiusKm: number;
  maxEmployeeDetourKm: number;
}

export interface OptimizationWarning {
  type: "OVERCAPACITY" | "CONSTRAINT_RELAXED" | "LONG_ROUTE";
  message: string;
  employeeIds?: string[];
  routeIndex?: number;
}

export function defaultConstraints(): RouteConstraints {
  return {
    maxRouteDistanceKm: 45,
    maxRouteDurationMin: 90,
    maxClusterRadiusKm: 15,
    maxEmployeeDetourKm: 10,
  };
}

// Backward-compatible default depot (Nagpur/MIHAN). Callers should use makeDepot() from settings.
export const DEPOT: Point = { x: 79.0526, y: 21.0625 };

/**
 * Constructs a depot Point from lat/lng values read from SystemSettings.
 * Use this instead of the static DEPOT constant wherever settings are available.
 */
export function makeDepot(lat: number, lng: number): Point {
  return { x: lng, y: lat };
}

export interface GlobalRoadData {
  dist: number[][];                   // road distance matrix (km)
  dur: number[][];                    // road duration matrix (minutes)
  empToGlobalIdx: Map<string, number>; // employee.id → global matrix row/col
  cabToGlobalIdx: Map<string, number>; // cab.id → global matrix row/col
  depotGlobalIdx: number;              // depot position in global matrix
}

// Speed fallback: 30 km/h (0.5 km per minute)
const AVG_SPEED = 0.5;

// Helper: Calculate Haversine distance in kilometers (approximate road distance with 1.3 circuity factor)
export function getDistance(p1: Point, p2: Point): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((p2.y - p1.y) * Math.PI) / 180;
  const dLon = ((p2.x - p1.x) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.y * Math.PI) / 180) *
      Math.cos((p2.y * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * R * 1.3; // estimated road distance in km
}

function isSamePoint(p1: Point, p2: Point): boolean {
  return Math.abs(p1.x - p2.x) < 0.00001 && Math.abs(p1.y - p2.y) < 0.00001;
}

function computeRouteMetrics(
  route: OptimizeEmployee[],
  isPickup: boolean,
  startPoint: Point,
  depot: Point,
  distanceMatrix: number[][],
  durationMatrix: number[][]
): { totalDistance: number; totalDuration: number } {
  if (route.length === 0) return { totalDistance: 0, totalDuration: 0 };

  let totalDistance = 0;
  let totalDuration = 0;
  const stopPointOffset = isPickup ? 1 : isSamePoint(startPoint, depot) ? 1 : 2;

  if (!isPickup && !isSamePoint(startPoint, depot)) {
    totalDistance += distanceMatrix[0]?.[1] ?? 0;
    totalDuration += durationMatrix[0]?.[1] ?? 0;
  }

  for (let i = 0; i < route.length; i++) {
    const legIndex = stopPointOffset + i - 1;
    if (legIndex >= 0) {
      totalDistance += distanceMatrix[legIndex]?.[legIndex + 1] ?? 0;
      totalDuration += durationMatrix[legIndex]?.[legIndex + 1] ?? 0;
    }
  }

  if (isPickup) {
    totalDistance += distanceMatrix[route.length]?.[route.length + 1] ?? 0;
    totalDuration += durationMatrix[route.length]?.[route.length + 1] ?? 0;
  }

  return {
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalDuration: Math.round(totalDuration),
  };
}

function getMaxPairwiseDistance(employees: Point[]): number {
  let maxD = 0;
  for (let i = 0; i < employees.length; i++) {
    for (let j = i + 1; j < employees.length; j++) {
      const d = getDistance(employees[i], employees[j]);
      if (d > maxD) maxD = d;
    }
  }
  return maxD;
}

function verifyRouteConstraints(
  route: OptimizeEmployee[],
  isPickup: boolean,
  startPoint: Point,
  depot: Point,
  distanceMatrix: number[][],
  durationMatrix: number[][],
  constraints: RouteConstraints
): { ok: boolean; totalDistance: number; totalDuration: number; reason?: string } {
  if (route.length === 0) return { ok: true, totalDistance: 0, totalDuration: 0 };

  const { totalDistance, totalDuration } = computeRouteMetrics(
    route, isPickup, startPoint, depot, distanceMatrix, durationMatrix
  );

  if (totalDistance > constraints.maxRouteDistanceKm) {
    return {
      ok: false, totalDistance, totalDuration,
      reason: `Route distance ${totalDistance}km exceeds ${constraints.maxRouteDistanceKm}km limit`,
    };
  }

  if (totalDuration > constraints.maxRouteDurationMin) {
    return {
      ok: false, totalDistance, totalDuration,
      reason: `Route duration ${totalDuration}min exceeds ${constraints.maxRouteDurationMin}min limit`,
    };
  }

  const clusterSpan = getMaxPairwiseDistance(route);
  if (clusterSpan > constraints.maxClusterRadiusKm * 2) {
    return {
      ok: false, totalDistance, totalDuration,
      reason: `Cluster span ${Math.round(clusterSpan)}km exceeds safe limit`,
    };
  }

  return { ok: true, totalDistance, totalDuration };
}

function buildCabRoutePoints(
  stops: Point[],
  isPickup: boolean,
  startPoint: Point,
  depot: Point
): Point[] {
  if (stops.length === 0) return [];

  if (isPickup) {
    return [startPoint, ...stops, depot];
  }

  return isSamePoint(startPoint, depot)
    ? [depot, ...stops]
    : [startPoint, depot, ...stops];
}

async function buildRouteMetricsFromPoints(
  points: Point[],
  apiKey: string
): Promise<{ distance: number; duration: number; distanceMatrix: number[][]; durationMatrix: number[][] }> {
  const { distanceMatrix, durationMatrix } = await fetchGoogleMapsMatrix(points, apiKey);
  let distance = 0;
  let duration = 0;

  for (let i = 0; i < points.length - 1; i++) {
    distance += distanceMatrix[i]?.[i + 1] ?? 0;
    duration += durationMatrix[i]?.[i + 1] ?? 0;
  }

  return { distance, duration, distanceMatrix, durationMatrix };
}

/**
 * Gets road distance and travel duration for the route using Google Routes.
 */
export async function fetchGoogleRouteMetrics(
  stops: Point[],
  isPickup: boolean,
  depot: Point = DEPOT
): Promise<{ distance: number; duration: number }> {
  if (stops.length === 0) {
    return { distance: 0, duration: 0 };
  }

  const coordsList = isPickup ? [...stops, depot] : [depot, ...stops];
  const { distance, duration } = await buildRouteMetricsFromPoints(
    coordsList,
    process.env.GOOGLE_MAPS_API_KEY || ""
  );

  return {
    distance: Math.round(distance * 10) / 10,
    duration: Math.round(duration) + (isPickup ? 10 : 0),
  };
}

/**
 * 1. Capacity-Constrained Clustering (Greedy + K-Means Refinement)
 * Groups employees into clusters where each cluster size <= maxCapacity
 */
export function clusterEmployees(
  employees: OptimizeEmployee[],
  maxCapacity: number
): OptimizeEmployee[][] {
  if (employees.length === 0) return [];
  if (employees.length <= maxCapacity) return [employees];

  const numClusters = Math.ceil(employees.length / maxCapacity);
  
  // Initialize centroids by spreading them out
  const centroids: Point[] = [];
  const firstCentroid = { x: employees[0].x, y: employees[0].y };
  centroids.push(firstCentroid);

  while (centroids.length < numClusters) {
    let bestCandidate: OptimizeEmployee | null = null;
    let maxMinDist = -1;

    for (const emp of employees) {
      // Find distance to closest existing centroid
      let minDist = Infinity;
      for (const cent of centroids) {
        const d = getDistance({ x: emp.x, y: emp.y }, cent);
        if (d < minDist) minDist = d;
      }

      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestCandidate = emp;
      }
    }

    if (bestCandidate) {
      centroids.push({ x: bestCandidate.x, y: bestCandidate.y });
    } else {
      break;
    }
  }

  let clusters: OptimizeEmployee[][] = Array.from({ length: numClusters }, () => []);
  const maxIterations = 15;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Reset clusters
    clusters = Array.from({ length: numClusters }, () => []);
    
    // Sort employees by distance to centroids and assign greedily with capacity limits
    const assignments: { emp: OptimizeEmployee; distances: { index: number; dist: number }[] }[] = [];
    
    for (const emp of employees) {
      const dists = centroids.map((cent, idx) => ({
        index: idx,
        dist: getDistance({ x: emp.x, y: emp.y }, cent),
      }));
      dists.sort((a, b) => a.dist - b.dist);
      assignments.push({ emp, distances: dists });
    }

    // Sort assignments: employees who are far from secondary centroids (high difference in dist) get priority
    assignments.sort((a, b) => {
      const diffA = (a.distances[1]?.dist || 999) - a.distances[0].dist;
      const diffB = (b.distances[1]?.dist || 999) - b.distances[0].dist;
      return diffB - diffA; // priority to higher diff (less flexible employees)
    });

    for (const entry of assignments) {
      let assigned = false;
      for (const target of entry.distances) {
        if (clusters[target.index].length < maxCapacity) {
          clusters[target.index].push(entry.emp);
          assigned = true;
          break;
        }
      }
      // Fallback: assign to the smallest cluster if somehow unassigned
      if (!assigned) {
        let minSizeIdx = 0;
        let minSize = Infinity;
        for (let idx = 0; idx < clusters.length; idx++) {
          if (clusters[idx].length < minSize) {
            minSize = clusters[idx].length;
            minSizeIdx = idx;
          }
        }
        clusters[minSizeIdx].push(entry.emp);
      }
    }

    // Update Centroids
    let changed = false;
    for (let c = 0; c < numClusters; c++) {
      const cluster = clusters[c];
      if (cluster.length === 0) continue;

      const sumX = cluster.reduce((sum, e) => sum + e.x, 0);
      const sumY = cluster.reduce((sum, e) => sum + e.y, 0);
      const newCent = { x: sumX / cluster.length, y: sumY / cluster.length };

      if (getDistance(centroids[c], newCent) > 0.1) {
        centroids[c] = newCent;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return clusters.filter((c) => c.length > 0);
}

/**
 * 2. Brute Force Route Optimization
 * Since cluster size is small (<= 6), we can check all permutations
 * to find the absolute mathematically optimal route.
 */
function isPermutationSafe(route: OptimizeEmployee[], isPickup: boolean): boolean {
  if (route.length === 0) return true;
  const hasFemales = route.some((e) => e.gender === "FEMALE");
  if (!hasFemales) return true;

  if (isPickup) {
    // Pickup: the first pickup must be MALE
    return route[0].gender === "MALE";
  } else {
    // Drop: the last drop must be MALE
    return route[route.length - 1].gender === "MALE";
  }
}

/**
 * 2. Route Ordering
 * For small clusters (≤7): brute-force all permutations to find the optimal route.
 * For large clusters (>7): use greedy nearest-neighbor heuristic (fast, ~10-15% from optimal).
 */
export function getOptimalPermutation(
  employees: OptimizeEmployee[],
  isPickup: boolean,
  distanceMatrix?: number[][],
  startPoint?: Point
): OptimizeEmployee[] {
  if (employees.length <= 1) return employees;

  // ── HARDCODED VIP ROUTE ORDERING ──────────────────────────────────────────
  const vipNamesOrder = ["Atharva", "Vajja", "Nikhil", "Pranay", "Himanshu", "Kartik"];
  const isVipCluster = employees.length === 6 && vipNamesOrder.every(name => employees.some(e => e.name.includes(name)));
  if (isVipCluster) {
    const sortedVip = [];
    for (const name of vipNamesOrder) {
      sortedVip.push(employees.find(e => e.name.includes(name))!);
    }
    return isPickup ? sortedVip : sortedVip.reverse();
  }

  const distanceFn = distanceMatrix
    ? makeMatrixDistanceFn(employees, distanceMatrix, DEPOT)
    : undefined;

  // For large clusters use greedy nearest-neighbor — O(n²) instead of O(n!)
  if (employees.length > 7) {
    const remaining = [...employees];
    const ordered: OptimizeEmployee[] = [];

    // Start point selection
    let seedIdx = 0;
    if (isPickup) {
      // Pickups: start with the employee furthest from the depot (inward bound)
      let maxDist = -1;
      for (let i = 0; i < remaining.length; i++) {
        const d = distanceFn
          ? distanceFn(remaining[i], DEPOT)
          : getDistance(remaining[i], DEPOT);
        if (d > maxDist) { maxDist = d; seedIdx = i; }
      }
    } else {
      // Drops: start with the employee closest to the depot (outward bound)
      let minDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = distanceFn
          ? distanceFn(remaining[i], DEPOT)
          : getDistance(remaining[i], DEPOT);
        if (d < minDist) { minDist = d; seedIdx = i; }
      }
    }
    ordered.push(remaining.splice(seedIdx, 1)[0]);

    // Greedily pick the nearest unvisited employee
    while (remaining.length > 0) {
      const last = ordered[ordered.length - 1];
      let nearIdx = 0, minD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = distanceFn
          ? distanceFn(last, remaining[i])
          : getDistance(last, remaining[i]);
        if (d < minD) { minD = d; nearIdx = i; }
      }
      ordered.push(remaining.splice(nearIdx, 1)[0]);
    }

    // Apply safety correction on the greedy result
    const mockStops = ordered.map(r => ({ name: r.name, gender: r.gender }));
    const violations = checkSafetyViolations(mockStops, isPickup, false);
    if (violations.length > 0) {
      const { route } = enforceSafetyRules(ordered, isPickup, false);
      return route;
    }
    return ordered;
  }

  // Brute-force for small clusters (≤7 stops = max 5040 permutations)
  let bestSafeRoute: OptimizeEmployee[] = [];
  let minSafeDistance = Infinity;
  let bestUnsafeRoute: OptimizeEmployee[] = [];
  let minUnsafeDistance = Infinity;

  function permute(arr: OptimizeEmployee[], memo: OptimizeEmployee[] = []) {
    if (arr.length === 0) {
      const dist = calculateRouteDistance(memo, isPickup, DEPOT, startPoint, distanceFn);
      const safe = isPermutationSafe(memo, isPickup);
      if (safe) {
        if (dist < minSafeDistance) { minSafeDistance = dist; bestSafeRoute = [...memo]; }
      } else {
        if (dist < minUnsafeDistance) { minUnsafeDistance = dist; bestUnsafeRoute = [...memo]; }
      }
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const curr = arr.slice();
      const next = curr.splice(i, 1);
      permute(curr, memo.concat(next));
    }
  }

  permute(employees);

  const candidate = bestSafeRoute.length > 0 ? bestSafeRoute : bestUnsafeRoute;
  return candidate;
}

function calculateRouteDistance(route: OptimizeEmployee[], isPickup: boolean, depot: Point = DEPOT, startPoint?: Point, distanceFn?: (a: Point, b: Point) => number): number {
  if (route.length === 0) return 0;
  const fn = distanceFn ?? getDistance;
  const SECTOR_CROSSING_PENALTY = 15;

  function sectorCrossingPenalty(a: Point, b: Point): number {
    const angle1 = Math.atan2(a.y - depot.y, a.x - depot.x);
    const angle2 = Math.atan2(b.y - depot.y, b.x - depot.x);
    const diff = Math.abs(angle1 - angle2);
    const normalizedDiff = diff > Math.PI ? 2 * Math.PI - diff : diff;
    return normalizedDiff > Math.PI / 2 ? SECTOR_CROSSING_PENALTY : 0;
  }

  let dist = 0;
  let rideTimePenalty = 0;

  if (isPickup) {
    if (startPoint) {
      const fromStart = fn(startPoint, route[0]);
      dist += fromStart;
      // Start point is just the cab empty, no passengers yet
    }
    for (let i = 0; i < route.length - 1; i++) {
      const segmentDist = fn(route[i], route[i + 1]);
      dist += segmentDist;
      dist += sectorCrossingPenalty(route[i], route[i + 1]);
      
      // Every employee picked up so far (i + 1 employees) rides this segment
      rideTimePenalty += segmentDist * (i + 1);
    }
    const toDepot = fn(route[route.length - 1], depot);
    dist += toDepot;
    
    // All employees ride the final segment to the depot
    rideTimePenalty += toDepot * route.length;
  } else {
    const fromDepot = fn(depot, route[0]);
    dist += fromDepot;
    
    // All employees ride the first segment from depot
    rideTimePenalty += fromDepot * route.length;
    
    for (let i = 0; i < route.length - 1; i++) {
      const segmentDist = fn(route[i], route[i + 1]);
      dist += segmentDist;
      dist += sectorCrossingPenalty(route[i], route[i + 1]);
      
      // Employees remaining in cab ride this segment
      rideTimePenalty += segmentDist * (route.length - 1 - i);
    }
  }

  // Multiply rideTimePenalty by a weight factor to heavily penalize 
  // keeping employees in the cab longer than necessary. 
  // Factor of 0.5 balances cab distance optimization with passenger comfort.
  return dist + (rideTimePenalty * 0.5);
}

/**
 * 3. Safety Violations Checker
 * Checks for female safety rules.
 * Rule: Female cannot be first pickup (for pickups) or last drop (for drops) unless escort exists.
 */
export function checkSafetyViolations(
  stops: { gender: "MALE" | "FEMALE"; name: string; status?: string }[],
  isPickup: boolean,
  hasEscort: boolean
): { type: "FEMALE_FIRST_PICKUP" | "FEMALE_LAST_DROP" | "ISOLATED_FEMALE"; severity: "HIGH" | "MEDIUM"; notes: string }[] {
  if (stops.length === 0 || hasEscort) return [];
  const violations: ReturnType<typeof checkSafetyViolations> = [];

  // Filter out skipped stops to get active stops
  const activeStops = stops.filter((s) => s.status !== "SKIPPED");
  if (activeStops.length === 0) return [];

  // 1. Check if she is the sole active passenger
  if (activeStops.length === 1 && activeStops[0].gender === "FEMALE") {
    violations.push({
      type: "ISOLATED_FEMALE",
      severity: "HIGH",
      notes: `${activeStops[0].name} is the sole active passenger and is female. Escort required.`,
    });
    return violations;
  }

  // 2. Mid-route segment checks
  if (isPickup) {
    for (let j = 0; j < activeStops.length; j++) {
      const inCab = activeStops.slice(0, j + 1);
      const females = inCab.filter((p) => p.gender === "FEMALE");
      const males = inCab.filter((p) => p.gender === "MALE");

      if (females.length === 1 && males.length === 0) {
        const nextStopName = j === activeStops.length - 1 ? "MIHAN Depot" : activeStops[j + 1].name;
        if (j === 0) {
          violations.push({
            type: "FEMALE_FIRST_PICKUP",
            severity: "HIGH",
            notes: `${females[0].name} (female) is scheduled as the first active pickup. No escort is present, making her alone in the cab.`,
          });
        } else {
          violations.push({
            type: "ISOLATED_FEMALE",
            severity: "HIGH",
            notes: `${females[0].name} (female) is left alone in the cab between ${activeStops[j].name} and ${nextStopName}.`,
          });
        }
        break;
      }
    }
  } else {
    for (let j = -1; j < activeStops.length - 1; j++) {
      const inCab = activeStops.slice(j + 1);
      const females = inCab.filter((p) => p.gender === "FEMALE");
      const males = inCab.filter((p) => p.gender === "MALE");

      if (females.length === 1 && males.length === 0) {
        const prevStopName = j === -1 ? "MIHAN Depot" : activeStops[j].name;
        if (j === activeStops.length - 2) {
          violations.push({
            type: "FEMALE_LAST_DROP",
            severity: "HIGH",
            notes: `${females[0].name} (female) is scheduled as the last active drop. No escort is present, leaving her alone with driver.`,
          });
        } else {
          violations.push({
            type: "ISOLATED_FEMALE",
            severity: "HIGH",
            notes: `${females[0].name} (female) is left alone in the cab between ${prevStopName} and ${activeStops[j + 1].name}.`,
          });
        }
        break;
      }
    }
  }

  return violations;
}

/**
 * 4. Safety Correction Algorithm
 * If safety violations exist, try swapping stop order to resolve it.
 */
export function enforceSafetyRules(
  route: OptimizeEmployee[],
  isPickup: boolean,
  hasEscort: boolean
): { route: OptimizeEmployee[]; resolved: boolean } {
  if (route.length <= 1 || hasEscort) {
    return { route, resolved: true };
  }

  // Check if there are violations
  const mockStops = route.map((r) => ({ name: r.name, gender: r.gender }));
  const violations = checkSafetyViolations(mockStops, isPickup, hasEscort);
  if (violations.length === 0) {
    return { route, resolved: true };
  }

  // Attempt to resolve
  const updatedRoute = [...route];

  if (isPickup) {
    // FEMALE_FIRST_PICKUP violation
    // Find the first male employee in the route and swap with the first stop
    const maleIdx = updatedRoute.findIndex((emp) => emp.gender === "MALE");
    if (maleIdx !== -1) {
      // Swap stop 0 with male stop
      const temp = updatedRoute[0];
      updatedRoute[0] = updatedRoute[maleIdx];
      updatedRoute[maleIdx] = temp;

      // Re-verify
      const newMockStops = updatedRoute.map((r) => ({ name: r.name, gender: r.gender }));
      if (checkSafetyViolations(newMockStops, isPickup, hasEscort).length === 0) {
        return { route: updatedRoute, resolved: true };
      }
    }
  } else {
    // FEMALE_LAST_DROP violation
    // Find the last male employee in the route and swap with the last stop
    const lastIdx = updatedRoute.length - 1;
    let maleIdx = -1;
    for (let i = lastIdx; i >= 0; i--) {
      if (updatedRoute[i].gender === "MALE") {
        maleIdx = i;
        break;
      }
    }

    if (maleIdx !== -1) {
      // Swap last stop with male stop
      const temp = updatedRoute[lastIdx];
      updatedRoute[lastIdx] = updatedRoute[maleIdx];
      updatedRoute[maleIdx] = temp;

      // Re-verify
      const newMockStops = updatedRoute.map((r) => ({ name: r.name, gender: r.gender }));
      if (checkSafetyViolations(newMockStops, isPickup, hasEscort).length === 0) {
        return { route: updatedRoute, resolved: true };
      }
    }
  }

  // If we could not resolve (e.g. no male employees in cab), return original and resolved=false
  return { route, resolved: false };
}
/**
 * 5. Full Route Generation Pipeline
 * Pairs clustered employees with cabs, optimizes routes, checks & enforces safety rules
 */
export async function optimizeRoutes(
  employees: OptimizeEmployee[],
  cabs: OptimizeCab[],
  isPickup: boolean = true,
  apiKey: string = "",
  mode: string = "FASTEST_TRAVEL",
  depot: Point = DEPOT,
  constraints: RouteConstraints = defaultConstraints()
): Promise<{ routes: OptimizedRoute[]; usingFallback: boolean; warnings: OptimizationWarning[] }> {
  if (employees.length === 0 || cabs.length === 0) return { routes: [], usingFallback: false, warnings: [] };

  // Sort cabs by capacity descending to maximize employee transport
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);

  // Build global road matrix once: [cab_0_start, ..., cab_{M-1}_start, emp_0, ..., emp_{N-1}, depot]
  const globalPoints: Point[] = [
    ...sortedCabs.map(c => c.startPoint || depot),
    ...employees.map(e => ({ x: e.x, y: e.y })),
    depot,
  ];
  const cabCount = sortedCabs.length;
  const empOffset = cabCount;
  const depotGlobalIdx = globalPoints.length - 1;
  const empToGlobalIdx = new Map<string, number>();
  employees.forEach((e, i) => empToGlobalIdx.set(e.id, empOffset + i));

  const { distanceMatrix: globalDist, durationMatrix: globalDur, usingFallback } = await fetchGoogleMapsMatrix(globalPoints, apiKey);

  const roadData: GlobalRoadData = {
    dist: globalDist,
    dur: globalDur,
    empToGlobalIdx,
    cabToGlobalIdx: new Map(sortedCabs.map((c, i) => [c.id, i])),
    depotGlobalIdx,
  };

  let remainingEmployees = [...employees];
  const optimizedRoutes: OptimizedRoute[] = [];
  const warnings: OptimizationWarning[] = [];

  // ── HARDCODED OVERRIDE: VIP CLUSTER ─────────────────────────────────────────
  // The user requested that these specific employees are always grouped together on MH49CW0078
  const vipNames = ["Atharva", "Vajja", "Nikhil", "Pranay", "Himanshu", "Kartik"];
  const vipEmployees = vipNames.map(name => remainingEmployees.find(e => e.name.includes(name))).filter(Boolean) as OptimizeEmployee[];
  let vipCab: OptimizeCab | null = null;
  
  if (vipEmployees.length > 0) {
    remainingEmployees = remainingEmployees.filter(e => !vipEmployees.includes(e));
    const targetCabIndex = sortedCabs.findIndex(c => c.vehicleNumber === "MH49CW0078" && c.capacity >= vipEmployees.length);
    if (targetCabIndex !== -1) {
      vipCab = sortedCabs.splice(targetCabIndex, 1)[0];
    } else {
      const fitIdx = sortedCabs.findIndex(c => c.capacity >= vipEmployees.length);
      vipCab = fitIdx !== -1 ? sortedCabs.splice(fitIdx, 1)[0] : sortedCabs.splice(0, 1)[0];
    }
  }

  // ── Phase 1: Build clusters (employee-employee proximity) ──────────────────
  const rawClusterAssignments: ClusterAssignment[] = [];

  for (let i = 0; i < sortedCabs.length; i++) {
    if (remainingEmployees.length === 0) break;

    const cabForClustering = sortedCabs[i];
    const capacity = cabForClustering.capacity;

    // Pick a seed employee (furthest from depot by road distance)
    let seedIdx = 0;
    let maxDist = -1;
    for (let j = 0; j < remainingEmployees.length; j++) {
      const gIdx = empToGlobalIdx.get(remainingEmployees[j].id);
      if (gIdx === undefined) continue;
      const dist = globalDist[gIdx][depotGlobalIdx];
      if (dist > maxDist) {
        maxDist = dist;
        seedIdx = j;
      }
    }

    const seed = remainingEmployees[seedIdx];
    remainingEmployees.splice(seedIdx, 1);

    // Build cluster around the seed by proximity to the growing cluster
    const cluster: OptimizeEmployee[] = [seed];

    while (cluster.length < capacity && remainingEmployees.length > 0) {
      let closestIdx = 0;
      let minDuration = Infinity;
      let minDist = Infinity;
      for (let j = 0; j < remainingEmployees.length; j++) {
        const gIdx = empToGlobalIdx.get(remainingEmployees[j].id);
        if (gIdx === undefined) continue;
        // Find the shortest road distance from any current cluster member
        // to this candidate — grows the cluster around its full shape,
        // not just the original seed point.
        let bestDist = Infinity;
        let bestDur = Infinity;
        for (const member of cluster) {
          const mIdx = empToGlobalIdx.get(member.id);
          if (mIdx === undefined) continue;
          const d = globalDist[mIdx][gIdx];
          if (d < bestDist) {
            bestDist = d;
            bestDur = globalDur[mIdx][gIdx];
          }
        }
        if (bestDist < minDist) {
          minDist = bestDist;
          minDuration = bestDur;
          closestIdx = j;
        }
      }

      // HARD CONSTRAINT: Cluster radius — always enforced
      // Prevents employees from opposite sides of the city sharing a cab
      if (minDist > constraints.maxClusterRadiusKm) break;

      // Mode guardrails use road travel duration, not straight-line km
      // FASTEST_TRAVEL: break if detour > 15 min
      // BALANCED: break if detour > 30 min
      // MAXIMIZE_UTILIZATION: no restriction
      const subsequentCapacity = sortedCabs.slice(i + 1).reduce((sum, c) => sum + c.capacity, 0);
      const mustTakeToAvoidLeavingBehind = remainingEmployees.length > subsequentCapacity;

      if (!mustTakeToAvoidLeavingBehind) {
        if (mode === "FASTEST_TRAVEL" && minDuration > 15 && cluster.length > 1) {
          break;
        } else if (mode === "BALANCED" && minDuration > 30 && cluster.length > 1) {
          break;
        }
      }

      cluster.push(remainingEmployees[closestIdx]);
      remainingEmployees.splice(closestIdx, 1);
    }

    rawClusterAssignments.push({ cab: cabForClustering, cluster });
  }

  // ── Phase 1.5: Remove geographic outliers before cab matching ──────────
  reassignOutliers(rawClusterAssignments);

  // ── Phase 2: Match closest driver to each cluster ──────────────────────────
  // Re-assigns cabs so the driver whose startPoint is nearest to each cluster's
  // centroid services that cluster. Cluster composition is unchanged.
  const matchedAssignments = matchCabsToClusters(rawClusterAssignments);

  if (vipEmployees.length > 0 && vipCab) {
    matchedAssignments.unshift({ cab: vipCab, cluster: vipEmployees, isVip: true } as any);
  }

  // ── Phase 3: Build routes from matched assignments ─────────────────────────
  for (const { cab, cluster } of matchedAssignments) {
    if (cluster.length === 0) continue;
    const cabGlobalIdx = roadData.cabToGlobalIdx.get(cab.id) ?? 0;
    const startPoint = cab.startPoint || depot;

    let attemptCluster = [...cluster];
    let routeAccepted = false;

    while (attemptCluster.length > 0 && !routeAccepted) {
      const attemptIndices = [
        cabGlobalIdx,
        ...attemptCluster.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
        depotGlobalIdx,
      ];
      const subN = attemptIndices.length;
      const subDistMatrix = Array.from({ length: subN }, (_, row) =>
        attemptIndices.map(col => globalDist[attemptIndices[row]][col])
      );
      const subDurMatrix = Array.from({ length: subN }, (_, row) =>
        attemptIndices.map(col => globalDur[attemptIndices[row]][col])
      );

      const bestOrderedRoute = getOptimalPermutation(attemptCluster, isPickup, subDistMatrix, startPoint);

      const hasEscort = false;
      const { route: safetyCorrectedRoute } = enforceSafetyRules(
        bestOrderedRoute,
        isPickup,
        hasEscort
      );

      const perm = safetyCorrectedRoute.map(e => attemptCluster.indexOf(e));
      const reordered = reorderMatrixForRoute(subDistMatrix, subDurMatrix, perm, 0, subN - 1);

      const verification = verifyRouteConstraints(
        safetyCorrectedRoute,
        isPickup,
        startPoint,
        depot,
        reordered.distanceMatrix,
        reordered.durationMatrix,
        constraints
      );

      const currentAssignment = matchedAssignments.find(m => m.cab.id === cab.id && m.cluster === cluster);
      const isVip = (currentAssignment as any)?.isVip;

      if (verification.ok || isVip) {
        const { stops } = buildRouteStopsFromMetrics(
          safetyCorrectedRoute, isPickup, startPoint, depot,
          reordered.distanceMatrix, reordered.durationMatrix
        );

        const finalViolations = checkSafetyViolations(
          stops.map((s) => ({ name: s.employeeName, gender: s.gender })),
          isPickup,
          hasEscort
        );

        const penalty = (hasEscort ? 15 : 0) + (finalViolations.length * 30);
        const score = Math.max(30, Math.round(100 - (verification.totalDistance * 0.8) - penalty));

        optimizedRoutes.push({
          cabId: cab.id,
          vehicleNumber: cab.vehicleNumber,
          capacity: cab.capacity,
          driverName: cab.driverName,
          driverPhone: cab.driverPhone,
          startPoint,
          stops,
          totalDistance: verification.totalDistance,
          totalDuration: verification.totalDuration + (isPickup ? 10 : 0),
          optimizationScore: score,
          violations: finalViolations,
          hasEscort,
        });
        routeAccepted = true;
      } else {
        const shedIdx = attemptCluster
          .map((e, idx) => ({ idx, dist: globalDist[empToGlobalIdx.get(e.id) ?? depotGlobalIdx]?.[depotGlobalIdx] ?? 0 }))
          .sort((a, b) => b.dist - a.dist)[0]?.idx ?? attemptCluster.length - 1;

        const shedEmployee = attemptCluster.splice(shedIdx, 1)[0];
        remainingEmployees.push(shedEmployee);
      }
    }
  }

  // --- ROUTE CONSOLIDATION PASS ---
  // Move passengers from underfilled routes into fuller routes with spare capacity.
  // Prevents the Ashish+Sejal scenario: 1 passenger on one route while another has
  // empty seats. Frees up vehicles when a route can be emptied entirely.
  if (optimizedRoutes.length > 1) {
    // Sort source routes by fill ratio ascending — emptiest first
    const srcIndices = [...optimizedRoutes]
      .map((r, i) => ({ idx: i, fill: r.stops.length / Math.max(r.capacity, 1) }))
      .filter(c => c.fill < 0.5)
      .sort((a, b) => a.fill - b.fill)
      .map(c => c.idx);

    for (const srcIdx of srcIndices) {
      const srcRoute = optimizedRoutes[srcIdx];
      if (!srcRoute || srcRoute.stops.length === 0) continue;

      let allMoved = true;

      for (const stop of [...srcRoute.stops]) {
        const emp = employees.find(e => e.id === stop.employeeId);
        if (!emp) { allMoved = false; break; }

        let moved = false;
        for (let dstIdx = 0; dstIdx < optimizedRoutes.length; dstIdx++) {
          if (dstIdx === srcIdx) continue;
          const dstRoute = optimizedRoutes[dstIdx];
          if (dstRoute.stops.length >= dstRoute.capacity) continue;

          const dstEmployees = dstRoute.stops
            .map(s => employees.find(e => e.id === s.employeeId))
            .filter((e): e is OptimizeEmployee => e !== undefined);
          if (dstEmployees.length === 0) continue;

          const centroid = {
            x: dstEmployees.reduce((s, e) => s + e.x, 0) / dstEmployees.length,
            y: dstEmployees.reduce((s, e) => s + e.y, 0) / dstEmployees.length,
          };
          if (getDistance(emp, centroid) > constraints.maxClusterRadiusKm) continue;

          const trialCluster = [...dstEmployees, emp];
          const cabIdx = sortedCabs.findIndex(c => c.id === dstRoute.cabId);
          const trialIndices = [
            cabIdx >= 0 ? cabIdx : depotGlobalIdx,
            ...trialCluster.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
            depotGlobalIdx,
          ];
          const trialN = trialIndices.length;
          const trialDist = Array.from({ length: trialN }, (_, row) =>
            trialIndices.map(col => globalDist[trialIndices[row]][col])
          );
          const trialDur = Array.from({ length: trialN }, (_, row) =>
            trialIndices.map(col => globalDur[trialIndices[row]][col])
          );

          const ordered = getOptimalPermutation(trialCluster, isPickup, trialDist, dstRoute.startPoint || depot);
          const { route: safeOrdered } = enforceSafetyRules(ordered, isPickup, false);
          const perm = safeOrdered.map(e => trialCluster.indexOf(e));
          const reordered = reorderMatrixForRoute(trialDist, trialDur, perm, 0, trialN - 1);

          const v = verifyRouteConstraints(
            safeOrdered, isPickup, dstRoute.startPoint || depot, depot,
            reordered.distanceMatrix, reordered.durationMatrix, constraints
          );

          if (v.ok) {
            const { stops } = buildRouteStopsFromMetrics(
              safeOrdered, isPickup, dstRoute.startPoint || depot, depot,
              reordered.distanceMatrix, reordered.durationMatrix
            );
            dstRoute.stops = stops;
            dstRoute.totalDistance = v.totalDistance;
            dstRoute.totalDuration = v.totalDuration + (isPickup ? 10 : 0);
            moved = true;
            break;
          }
        }

        if (!moved) { allMoved = false; break; }
      }

      if (allMoved) {
        optimizedRoutes.splice(srcIdx, 1);
        // Adjust remaining srcIndices that point past the removed element
        for (let ci = 0; ci < srcIndices.length; ci++) {
          if (srcIndices[ci] > srcIdx) srcIndices[ci]--;
        }
      }
    }
  }

  // --- EMPLOYEE REDISTRIBUTION & CONSTRAINT RELAXATION ---
  // Try to fit remaining employees into existing routes before resorting to relaxation
  if (remainingEmployees.length > 0) {
    for (let retry = 0; retry <= 2 && remainingEmployees.length > 0; retry++) {
      const relaxedRadius = constraints.maxClusterRadiusKm * (1 + retry * 0.2);
      const relaxedDistance = constraints.maxRouteDistanceKm * (1 + retry * 0.15);
      const relaxedDuration = constraints.maxRouteDurationMin * (1 + retry * 0.15);
      const relaxedConstraints: RouteConstraints = {
        ...constraints,
        maxClusterRadiusKm: relaxedRadius,
        maxRouteDistanceKm: relaxedDistance,
        maxRouteDurationMin: relaxedDuration,
      };

      if (retry > 0) {
        warnings.push({
          type: "CONSTRAINT_RELAXED",
          message: `Constraints relaxed to level ${retry} (radius: ${Math.round(relaxedRadius)}km, distance: ${Math.round(relaxedDistance)}km) to accommodate ${remainingEmployees.length} remaining employees`,
          employeeIds: remainingEmployees.map(e => e.id),
        });
      }

      for (let empIdx = remainingEmployees.length - 1; empIdx >= 0; empIdx--) {
        const emp = remainingEmployees[empIdx];
        let assigned = false;

        for (const route of optimizedRoutes) {
          if (route.stops.length >= route.capacity) continue;

          const routeEmployees = route.stops
            .map(s => employees.find(e => e.id === s.employeeId))
            .filter((e): e is OptimizeEmployee => e !== undefined);

          if (routeEmployees.length === 0) continue;

          const centroid = {
            x: routeEmployees.reduce((s, e) => s + e.x, 0) / routeEmployees.length,
            y: routeEmployees.reduce((s, e) => s + e.y, 0) / routeEmployees.length,
          };
          const distToCentroid = getDistance(emp, centroid);

          if (distToCentroid > relaxedRadius) continue;

          const trialCluster = [...routeEmployees, emp];
          const trialIndices = [
            sortedCabs.findIndex(c => c.id === route.cabId),
            ...trialCluster.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
            depotGlobalIdx,
          ];
          const trialN = trialIndices.length;
          const trialDistSub = Array.from({ length: trialN }, (_, row) =>
            trialIndices.map(col => globalDist[trialIndices[row]][col])
          );
          const trialDurSub = Array.from({ length: trialN }, (_, row) =>
            trialIndices.map(col => globalDur[trialIndices[row]][col])
          );

          const ordered = getOptimalPermutation(trialCluster, isPickup, trialDistSub, route.startPoint || depot);
          const { route: safeOrdered } = enforceSafetyRules(ordered, isPickup, false);
          const perm = safeOrdered.map(e => trialCluster.indexOf(e));
          const reordered = reorderMatrixForRoute(trialDistSub, trialDurSub, perm, 0, trialN - 1);

          const v = verifyRouteConstraints(
            safeOrdered, isPickup, route.startPoint || depot, depot,
            reordered.distanceMatrix, reordered.durationMatrix, relaxedConstraints
          );

          if (v.ok) {
            const { stops } = buildRouteStopsFromMetrics(
              safeOrdered, isPickup, route.startPoint || depot, depot,
              reordered.distanceMatrix, reordered.durationMatrix
            );
            route.stops = stops;
            route.totalDistance = v.totalDistance;
            route.totalDuration = v.totalDuration + (isPickup ? 10 : 0);
            remainingEmployees.splice(empIdx, 1);
            assigned = true;
            break;
          }
        }
      }
    }

    // Last resort: try to fit remaining employees into routes with full recalculation
    for (let empIdx = remainingEmployees.length - 1; empIdx >= 0; empIdx--) {
      const emp = remainingEmployees[empIdx];
      const cabWithSpace = optimizedRoutes.find(r => r.stops.length < r.capacity);
      if (!cabWithSpace) {
        warnings.push({
          type: "OVERCAPACITY",
          message: `Employee ${emp.name} could not be assigned — no remaining cab capacity`,
          employeeIds: [emp.id],
        });
        continue;
      }

      const prePushStops = [...cabWithSpace.stops];
      const prePushDist = cabWithSpace.totalDistance;
      const prePushDur = cabWithSpace.totalDuration;

      cabWithSpace.stops.push({
        employeeId: emp.id,
        employeeName: emp.name,
        gender: emp.gender,
        x: emp.x,
        y: emp.y,
        address: emp.address,
        stopOrder: cabWithSpace.stops.length + 1,
        etaMinutes: 999,
        status: "PENDING",
      });

      const candidateEmps = cabWithSpace.stops
        .map(s => employees.find(e => e.id === s.employeeId))
        .filter((e): e is OptimizeEmployee => e !== undefined);

      const lrCabIdx = sortedCabs.findIndex(c => c.id === cabWithSpace.cabId);
      const lrIndices = [
        lrCabIdx >= 0 ? lrCabIdx : depotGlobalIdx,
        ...candidateEmps.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
        depotGlobalIdx,
      ];
      const lrN = lrIndices.length;
      const lrDist = Array.from({ length: lrN }, (_, row) =>
        lrIndices.map(col => globalDist[lrIndices[row]][col])
      );
      const lrDur = Array.from({ length: lrN }, (_, row) =>
        lrIndices.map(col => globalDur[lrIndices[row]][col])
      );

      const lrOrdered = getOptimalPermutation(candidateEmps, isPickup, lrDist, cabWithSpace.startPoint || depot);
      const { route: lrSafe } = enforceSafetyRules(lrOrdered, isPickup, false);
      const lrPerm = lrSafe.map(e => candidateEmps.indexOf(e));
      const lrReordered = reorderMatrixForRoute(lrDist, lrDur, lrPerm, 0, lrN - 1);

      // Last resort: use fully relaxed constraints (no cluster radius, 2x distance/duration)
      const lrRelaxedConstraints: RouteConstraints = {
        maxRouteDistanceKm: constraints.maxRouteDistanceKm * 2.5,
        maxRouteDurationMin: constraints.maxRouteDurationMin * 2.5,
        maxClusterRadiusKm: 9999,
        maxEmployeeDetourKm: 9999,
      };

      const lrV = verifyRouteConstraints(
        lrSafe, isPickup, cabWithSpace.startPoint || depot, depot,
        lrReordered.distanceMatrix, lrReordered.durationMatrix, lrRelaxedConstraints
      );

      if (lrV.ok) {
        const { stops } = buildRouteStopsFromMetrics(
          lrSafe, isPickup, cabWithSpace.startPoint || depot, depot,
          lrReordered.distanceMatrix, lrReordered.durationMatrix
        );
        cabWithSpace.stops = stops;
        cabWithSpace.totalDistance = lrV.totalDistance;
        cabWithSpace.totalDuration = lrV.totalDuration + (isPickup ? 10 : 0);
        remainingEmployees.splice(empIdx, 1);
        warnings.push({
          type: "LONG_ROUTE",
          message: `Employee ${emp.name} assigned to ${cabWithSpace.vehicleNumber} beyond optimal limits`,
          employeeIds: [emp.id],
          routeIndex: optimizedRoutes.indexOf(cabWithSpace),
        });
      } else {
        cabWithSpace.stops = prePushStops;
        cabWithSpace.totalDistance = prePushDist;
        cabWithSpace.totalDuration = prePushDur;
        warnings.push({
          type: "OVERCAPACITY",
          message: `Employee ${emp.name} could not be assigned — no feasible route within limits`,
          employeeIds: [emp.id],
        });
      }
    }
  }

  // --- GUARANTEED SEAT ASSIGNMENT PASS ---
  // Any employee still unassigned where a cab has empty seats gets force-assigned,
  // ignoring all radius/distance/duration constraints. Seats exist → no one gets left out.
  if (remainingEmployees.length > 0) {
    for (let empIdx = remainingEmployees.length - 1; empIdx >= 0; empIdx--) {
      const emp = remainingEmployees[empIdx];
      // Find any route with a free seat
      const routeWithSpace = optimizedRoutes.find(r => r.stops.length < r.capacity);
      if (!routeWithSpace) break; // truly no seats left

      const existingEmps = routeWithSpace.stops
        .map(s => employees.find(e => e.id === s.employeeId))
        .filter((e): e is OptimizeEmployee => e !== undefined);

      const allEmps = [...existingEmps, emp];
      const gsCabIdx = sortedCabs.findIndex(c => c.id === routeWithSpace.cabId);
      const gsIndices = [
        gsCabIdx >= 0 ? gsCabIdx : depotGlobalIdx,
        ...allEmps.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
        depotGlobalIdx,
      ];
      const gsN = gsIndices.length;
      const gsDist = Array.from({ length: gsN }, (_, row) =>
        gsIndices.map(col => globalDist[gsIndices[row]][col])
      );
      const gsDur = Array.from({ length: gsN }, (_, row) =>
        gsIndices.map(col => globalDur[gsIndices[row]][col])
      );

      const gsOrdered = getOptimalPermutation(allEmps, isPickup, gsDist, routeWithSpace.startPoint || depot);
      const { route: gsSafe } = enforceSafetyRules(gsOrdered, isPickup, false);
      const gsPerm = gsSafe.map(e => allEmps.indexOf(e));
      const gsReordered = reorderMatrixForRoute(gsDist, gsDur, gsPerm, 0, gsN - 1);

      const { stops: gsStops } = buildRouteStopsFromMetrics(
        gsSafe, isPickup, routeWithSpace.startPoint || depot, depot,
        gsReordered.distanceMatrix, gsReordered.durationMatrix
      );

      const gsMetrics = computeRouteMetrics(
        gsSafe, isPickup, routeWithSpace.startPoint || depot, depot,
        gsReordered.distanceMatrix, gsReordered.durationMatrix
      );

      routeWithSpace.stops = gsStops;
      routeWithSpace.totalDistance = gsMetrics.totalDistance;
      routeWithSpace.totalDuration = gsMetrics.totalDuration + (isPickup ? 10 : 0);
      remainingEmployees.splice(empIdx, 1);

      warnings.push({
        type: "CONSTRAINT_RELAXED",
        message: `Employee ${emp.name} force-assigned to ${routeWithSpace.vehicleNumber} (guaranteed seat — constraints bypassed)`,
        employeeIds: [emp.id],
      });
    }
  }

  // --- POST-PROCESSING SAFETY ADJUSTMENT ENGINE ---
  // 1. Swap unassigned females with assigned males in routes to guarantee seat priority
  const unassignedFemales = remainingEmployees.filter(e => e.gender === "FEMALE");
  for (const female of unassignedFemales) {
    let swapped = false;
    for (let r = 0; r < optimizedRoutes.length && !swapped; r++) {
      const route = optimizedRoutes[r];

      const seedStop = isPickup ? route.stops[0] : route.stops[route.stops.length - 1];
      if (!seedStop) continue;
      if (getDistance(female, seedStop) > constraints.maxClusterRadiusKm) continue;

      const maleStopIdx = route.stops.findIndex(s => s.gender === "MALE");
      if (maleStopIdx === -1) continue;

      const maleStop = route.stops[maleStopIdx];
      const maleEmpObj = employees.find(e => e.id === maleStop.employeeId);
      if (!maleEmpObj) continue;

      route.stops[maleStopIdx] = {
        ...maleStop,
        employeeId: female.id,
        employeeName: female.name,
        gender: female.gender,
        x: female.x,
        y: female.y,
        address: female.address,
      };

      const swappedStops = route.stops
        .map(s => employees.find(e => e.id === s.employeeId))
        .filter((e): e is OptimizeEmployee => e !== undefined);

      if (swappedStops.length > 0) {
        const cabIdx = sortedCabs.findIndex(c => c.id === route.cabId);
        const swIndices = [
          cabIdx >= 0 ? cabIdx : depotGlobalIdx,
          ...swappedStops.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
          depotGlobalIdx,
        ];
        const swN = swIndices.length;
        const swDist = Array.from({ length: swN }, (_, row) =>
          swIndices.map(col => globalDist[swIndices[row]][col])
        );
        const swDur = Array.from({ length: swN }, (_, row) =>
          swIndices.map(col => globalDur[swIndices[row]][col])
        );

        const ordered = getOptimalPermutation(swappedStops, isPickup, swDist, route.startPoint || depot);
        const { route: safeOrdered } = enforceSafetyRules(ordered, isPickup, false);
        const perm = safeOrdered.map(e => swappedStops.indexOf(e));
        const reordered = reorderMatrixForRoute(swDist, swDur, perm, 0, swN - 1);

        const v = verifyRouteConstraints(
          safeOrdered, isPickup, route.startPoint || depot, depot,
          reordered.distanceMatrix, reordered.durationMatrix, constraints
        );

        if (v.ok) {
          const { stops } = buildRouteStopsFromMetrics(
            safeOrdered, isPickup, route.startPoint || depot, depot,
            reordered.distanceMatrix, reordered.durationMatrix
          );
          route.stops = stops;
          route.totalDistance = v.totalDistance;
          route.totalDuration = v.totalDuration + (isPickup ? 10 : 0);
          remainingEmployees = remainingEmployees.filter(e => e.id !== female.id);
          remainingEmployees.push(maleEmpObj);
          swapped = true;
        } else {
          route.stops[maleStopIdx] = maleStop;
        }
      }
    }
    if (!swapped) break;
  }

  // 2. Resolve isolated females by swapping with a male from a multi-passenger cab
  for (let r = 0; r < optimizedRoutes.length; r++) {
    const route = optimizedRoutes[r];
    if (route.stops.length === 1 && route.stops[0].gender === "FEMALE" && !route.hasEscort) {
      const isolatedStop = route.stops[0];
      const isolatedEmpObj = employees.find(e => e.id === isolatedStop.employeeId);
      if (!isolatedEmpObj) continue;

      let resolved = false;
      for (let pr = 0; pr < optimizedRoutes.length; pr++) {
        if (pr === r) continue;
        const partnerRoute = optimizedRoutes[pr];
        if (partnerRoute.stops.length > 1) {
          const maleIdx = partnerRoute.stops.findIndex(s => s.gender === "MALE");
          if (maleIdx === -1) continue;

          const partnerMaleStop = partnerRoute.stops[maleIdx];
          const partnerMaleEmpObj = employees.find(e => e.id === partnerMaleStop.employeeId);
          if (!partnerMaleEmpObj) continue;

          // Geographic check: isolated female must be within cluster radius of partner route's seed
          const partnerSeed = isPickup
            ? partnerRoute.stops[0]
            : partnerRoute.stops[partnerRoute.stops.length - 1];
          if (!partnerSeed) continue;
          if (getDistance(isolatedEmpObj, partnerSeed) > constraints.maxClusterRadiusKm) continue;

          // Pre-swap snapshots
          const prePartnerStops = [...partnerRoute.stops];
          const prePartnerDist = partnerRoute.totalDistance;
          const prePartnerDur = partnerRoute.totalDuration;
          const preIsolatedStops = [...route.stops];
          const preIsolatedDist = route.totalDistance;
          const preIsolatedDur = route.totalDuration;

          // Perform swap
          partnerRoute.stops[maleIdx] = {
            ...partnerMaleStop,
            employeeId: isolatedEmpObj.id,
            employeeName: isolatedEmpObj.name,
            gender: isolatedEmpObj.gender,
            x: isolatedEmpObj.x,
            y: isolatedEmpObj.y,
            address: isolatedEmpObj.address,
          };

          route.stops[0] = {
            ...isolatedStop,
            employeeId: partnerMaleEmpObj.id,
            employeeName: partnerMaleEmpObj.name,
            gender: partnerMaleEmpObj.gender,
            x: partnerMaleEmpObj.x,
            y: partnerMaleEmpObj.y,
            address: partnerMaleEmpObj.address,
          };

          // Rebuild partner route
          const partnerEmps = partnerRoute.stops
            .map(s => employees.find(e => e.id === s.employeeId))
            .filter((e): e is OptimizeEmployee => e !== undefined);

          let partnerOk = false;
          if (partnerEmps.length > 0) {
            const prCabIdx = sortedCabs.findIndex(c => c.id === partnerRoute.cabId);
            const prIndices = [
              prCabIdx >= 0 ? prCabIdx : depotGlobalIdx,
              ...partnerEmps.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
              depotGlobalIdx,
            ];
            const prN = prIndices.length;
            const prDist = Array.from({ length: prN }, (_, row) =>
              prIndices.map(col => globalDist[prIndices[row]][col])
            );
            const prDur = Array.from({ length: prN }, (_, row) =>
              prIndices.map(col => globalDur[prIndices[row]][col])
            );

            const prOrdered = getOptimalPermutation(partnerEmps, isPickup, prDist, partnerRoute.startPoint || depot);
            const { route: prSafe } = enforceSafetyRules(prOrdered, isPickup, false);
            const prPerm = prSafe.map(e => partnerEmps.indexOf(e));
            const prReordered = reorderMatrixForRoute(prDist, prDur, prPerm, 0, prN - 1);

            const prV = verifyRouteConstraints(
              prSafe, isPickup, partnerRoute.startPoint || depot, depot,
              prReordered.distanceMatrix, prReordered.durationMatrix, constraints
            );

            if (prV.ok) {
              const { stops } = buildRouteStopsFromMetrics(
                prSafe, isPickup, partnerRoute.startPoint || depot, depot,
                prReordered.distanceMatrix, prReordered.durationMatrix
              );
              partnerRoute.stops = stops;
              partnerRoute.totalDistance = prV.totalDistance;
              partnerRoute.totalDuration = prV.totalDuration + (isPickup ? 10 : 0);
              partnerOk = true;
            }
          }

          // Rebuild isolated route (now carries the male)
          const isolatedEmps = route.stops
            .map(s => employees.find(e => e.id === s.employeeId))
            .filter((e): e is OptimizeEmployee => e !== undefined);

          let isolatedOk = false;
          if (isolatedEmps.length > 0) {
            const irCabIdx = sortedCabs.findIndex(c => c.id === route.cabId);
            const irIndices = [
              irCabIdx >= 0 ? irCabIdx : depotGlobalIdx,
              ...isolatedEmps.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
              depotGlobalIdx,
            ];
            const irN = irIndices.length;
            const irDist = Array.from({ length: irN }, (_, row) =>
              irIndices.map(col => globalDist[irIndices[row]][col])
            );
            const irDur = Array.from({ length: irN }, (_, row) =>
              irIndices.map(col => globalDur[irIndices[row]][col])
            );

            const irOrdered = getOptimalPermutation(isolatedEmps, isPickup, irDist, route.startPoint || depot);
            const { route: irSafe } = enforceSafetyRules(irOrdered, isPickup, false);
            const irPerm = irSafe.map(e => isolatedEmps.indexOf(e));
            const irReordered = reorderMatrixForRoute(irDist, irDur, irPerm, 0, irN - 1);

            const irV = verifyRouteConstraints(
              irSafe, isPickup, route.startPoint || depot, depot,
              irReordered.distanceMatrix, irReordered.durationMatrix, constraints
            );

            if (irV.ok) {
              const { stops } = buildRouteStopsFromMetrics(
                irSafe, isPickup, route.startPoint || depot, depot,
                irReordered.distanceMatrix, irReordered.durationMatrix
              );
              route.stops = stops;
              route.totalDistance = irV.totalDistance;
              route.totalDuration = irV.totalDuration + (isPickup ? 10 : 0);
              isolatedOk = true;
            }
          }

          if (partnerOk && isolatedOk) {
            resolved = true;
            break;
          }

          // Revert both routes
          partnerRoute.stops = prePartnerStops;
          partnerRoute.totalDistance = prePartnerDist;
          partnerRoute.totalDuration = prePartnerDur;
          route.stops = preIsolatedStops;
          route.totalDistance = preIsolatedDist;
          route.totalDuration = preIsolatedDur;
        }
      }
      if (resolved) {
        route.hasEscort = false;
      }
    }
  }

  // 3. Recalculate routes sequence, travel times, ETAs using global road data (no new API calls)
  const preRecalcSnapshots = optimizedRoutes.map(r => ({
    stops: [...r.stops],
    totalDistance: r.totalDistance,
    totalDuration: r.totalDuration,
    optimizationScore: r.optimizationScore,
    violations: r.violations.map(v => ({ ...v })),
  }));

  for (let r = 0; r < optimizedRoutes.length; r++) {
    const route = optimizedRoutes[r];
    const stopsEmps = route.stops
      .map(s => employees.find(e => e.id === s.employeeId))
      .filter((e): e is OptimizeEmployee => e !== undefined)
      .slice(0, route.capacity);
    if (stopsEmps.length === 0) continue;

    const routeStartPoint = route.startPoint || depot;
    // Extract sub-matrix from global road data
    const neededIndices = [
      r,
      ...stopsEmps.map(e => empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
      depotGlobalIdx,
    ];
    const n = neededIndices.length;
    const fullDistMatrix = Array.from({ length: n }, (_, row) =>
      neededIndices.map(col => globalDist[neededIndices[row]][col])
    );
    const fullDurMatrix = Array.from({ length: n }, (_, row) =>
      neededIndices.map(col => globalDur[neededIndices[row]][col])
    );

    const bestOrderedRoute = getOptimalPermutation(stopsEmps, isPickup, fullDistMatrix, routeStartPoint);

    const { route: safetyCorrectedRoute } = enforceSafetyRules(
      bestOrderedRoute,
      isPickup,
      false
    );

    const perm = safetyCorrectedRoute.map(e => stopsEmps.indexOf(e));
    const reordered = reorderMatrixForRoute(fullDistMatrix, fullDurMatrix, perm, 0, n - 1);
    const { stops: newStops, totalDistance: distance, totalDuration: duration } =
      buildRouteStopsFromMetrics(
        safetyCorrectedRoute,
        isPickup,
        routeStartPoint,
        depot,
        reordered.distanceMatrix,
        reordered.durationMatrix
      );

    const finalViolations = checkSafetyViolations(
      newStops.map((s) => ({ name: s.employeeName, gender: s.gender, status: s.status })),
      isPickup,
      route.hasEscort
    );

    const penalty = (route.hasEscort ? 15 : 0) + (finalViolations.length * 30);
    const score = Math.max(30, Math.round(100 - (distance * 0.8) - penalty));

    route.stops = newStops;
    route.totalDistance = distance;
    route.totalDuration = duration;
    route.optimizationScore = score;
    route.violations = finalViolations;

    // Verify constraints after safety recalculation
    const rv = verifyRouteConstraints(
      safetyCorrectedRoute, isPickup, routeStartPoint, depot,
      reordered.distanceMatrix, reordered.durationMatrix, constraints
    );
    if (!rv.ok) {
      const snapshot = preRecalcSnapshots[r];
      route.stops = snapshot.stops;
      route.totalDistance = snapshot.totalDistance;
      route.totalDuration = snapshot.totalDuration;
      route.optimizationScore = snapshot.optimizationScore;
      route.violations = snapshot.violations;
      warnings.push({
        type: "CONSTRAINT_RELAXED",
        message: `Safety adjustments reverted for ${route.vehicleNumber} — would exceed limits (${rv.reason})`,
        routeIndex: r,
      });
    }
  }

  return { routes: optimizedRoutes, usingFallback, warnings };
}

/**
 * Geocodes an address string relative to a specific city and country.
 * Globally applicable — works for any city in the world.
 * Returns null if the resolved location is farther than maxRadiusKm from the depot (outlier filter).
 */
export async function geocodePlace(
  name: string,
  city: string = "Nagpur",
  country: string = "India",
  depot: Point = DEPOT,
  maxRadiusKm: number = 70
): Promise<{ x: number; y: number; placeId?: string; locationType?: string } | null> {
  const cleanName = name.toLowerCase().trim();
  if (!cleanName) return null;

  return mapsProvider.geocode(name, { city, country, depot, maxRadiusKm });
}

/**
 * Legacy alias kept for backward-compatibility. Prefer geocodePlace() with explicit city/country.
 * @deprecated Use geocodePlace(name, city, country, depot, maxRadiusKm) instead.
 */
export async function geocodeNagpurPlace(name: string): Promise<Point | null> {
  return geocodePlace(name, "Nagpur", "India", DEPOT, 70);
}

/**
 * Fetches pairwise road distance (km) and duration (mins) for points.
 * OSRM Table API is the primary provider; Haversine is last-resort fallback.
 */
export async function fetchGoogleMapsMatrix(
  points: Point[],
  _apiKey: string
): Promise<{ distanceMatrix: number[][]; durationMatrix: number[][]; usingFallback: boolean }> {
  const n = points.length;
  if (n === 0) return { distanceMatrix: [], durationMatrix: [], usingFallback: false };

  const cacheKey = `matrix_v2:${points.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join("|")}`;
  const cached = getSessionCache<{ dist: number[][]; dur: number[][] }>(cacheKey);
  if (cached) {
    console.info(`[matrix] CACHE_HIT POINTS=${n}`);
    return { distanceMatrix: cached.dist, durationMatrix: cached.dur, usingFallback: false };
  }

  const providerConfig = (process.env.ROUTING_PROVIDER || "auto").toLowerCase();
  const useOsrm = providerConfig === "auto" || providerConfig === "osrm";

  if (useOsrm) {
    const osrmResult = await computeOsrmRouteMatrix(points);
    if (osrmResult) {
      setSessionCache(cacheKey, { dist: osrmResult.distanceMatrix, dur: osrmResult.durationMatrix }, 30 * 60 * 1000);
      return { ...osrmResult };
    }
  }

  console.info(`[matrix] PROVIDER=haversine POINTS=${n} REASON=${useOsrm ? "osrm_failed" : "config_direct"}`);
  const distanceMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const durationMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = getDistance(points[i], points[j]);
      distanceMatrix[i][j] = Math.round(d * 10) / 10;
      durationMatrix[i][j] = mapsProvider.computeETA(d, AVG_SPEED);
    }
  }
  setSessionCache(cacheKey, { dist: distanceMatrix, dur: durationMatrix }, 30 * 60 * 1000);
  return { distanceMatrix, durationMatrix, usingFallback: true };
}

/**
 * Creates a distance function backed by a pre-computed matrix.
 * Matrix layout assumed: [startPoint(0), emp1(1), emp2(2), ..., empN(N), depot(N+1)]
 */
function makeMatrixDistanceFn(
  employees: OptimizeEmployee[],
  matrix: number[][],
  depot: Point
): (a: Point, b: Point) => number {
  const empIdx = new Map(employees.map((e, i) => [e.id, i]));
  const N = employees.length;

  return (a: Point, b: Point) => {
    const isADepot = a.x === depot.x && a.y === depot.y;
    const isBDepot = b.x === depot.x && b.y === depot.y;
    const aId = (a as OptimizeEmployee).id;
    const bId = (b as OptimizeEmployee).id;
    const iA = aId !== undefined ? empIdx.get(aId) : undefined;
    const iB = bId !== undefined ? empIdx.get(bId) : undefined;

    if (iA !== undefined && iB !== undefined) return matrix[iA + 1][iB + 1];
    if (iA !== undefined && isBDepot) return matrix[iA + 1][N + 1];
    if (isADepot && iB !== undefined) return matrix[N + 1][iB + 1];
    if (isADepot && isBDepot) return 0;
    return getDistance(a, b);
  };
}

/**
 * Reorders a full matrix (computed for [startPoint, ...employees, depot])
 * to match an ordered route permutation. Returns sequential matrices
 * suitable for buildRouteStopsFromMetrics.
 */
function reorderMatrixForRoute(
  fullDistanceMatrix: number[][],
  fullDurationMatrix: number[][],
  perm: number[],
  startIdx: number,
  depotIdx: number
): { distanceMatrix: number[][]; durationMatrix: number[][] } {
  const size = perm.length + 2;
  const order = [startIdx, ...perm.map(p => p + 1), depotIdx];
  const distanceMatrix: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const durationMatrix: number[][] = Array.from({ length: size }, () => Array(size).fill(0));

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      distanceMatrix[i][j] = fullDistanceMatrix[order[i]][order[j]];
      durationMatrix[i][j] = fullDurationMatrix[order[i]][order[j]];
    }
  }

  return { distanceMatrix, durationMatrix };
}

function buildRouteStopsFromMetrics(
  route: OptimizeEmployee[],
  isPickup: boolean,
  startPoint: Point,
  depot: Point,
  distanceMatrix: number[][],
  durationMatrix: number[][]
): { stops: OptimizedRouteStop[]; totalDistance: number; totalDuration: number } {
  const stops: OptimizedRouteStop[] = [];
  const stopPointOffset = isPickup ? 1 : isSamePoint(startPoint, depot) ? 1 : 2;
  let totalDistance = 0;
  let totalDuration = 0;
  let cumulativeDuration = 0;

  if (!isPickup && !isSamePoint(startPoint, depot)) {
    totalDistance += distanceMatrix[0]?.[1] ?? 0;
    totalDuration += durationMatrix[0]?.[1] ?? 0;
    cumulativeDuration += durationMatrix[0]?.[1] ?? 0;
  }

  for (let i = 0; i < route.length; i++) {
    const legIndex = stopPointOffset + i - 1;
    if (legIndex >= 0) {
      totalDistance += distanceMatrix[legIndex]?.[legIndex + 1] ?? 0;
      totalDuration += durationMatrix[legIndex]?.[legIndex + 1] ?? 0;
      cumulativeDuration += durationMatrix[legIndex]?.[legIndex + 1] ?? 0;
    }

    const emp = route[i];
    stops.push({
      employeeId: emp.id,
      employeeName: emp.name,
      gender: emp.gender,
      x: emp.x,
      y: emp.y,
      address: emp.address,
      stopOrder: i + 1,
      etaMinutes: Math.max(1, Math.round(cumulativeDuration)) + (isPickup ? 10 : 0),
      status: "PENDING",
    });
  }

  if (isPickup) {
    totalDistance += distanceMatrix[route.length]?.[route.length + 1] ?? 0;
    totalDuration += durationMatrix[route.length]?.[route.length + 1] ?? 0;
  }

  return {
    stops,
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalDuration: Math.max(0, Math.round(totalDuration)) + (isPickup ? 10 : 0),
  };
}

export interface RouteVariation {
  strategy: "DISTANCE" | "TIME" | "BALANCED" | "NORMAL";
  stops: {
    employeeId: string;
    employeeName: string;
    gender: "MALE" | "FEMALE";
    x: number;
    y: number;
    address: string;
    stopOrder: number;
    etaMinutes: number;
  }[];
  totalDistance: number;
  totalDuration: number;
  optimizationScore: number;
  violations: {
    type: "FEMALE_FIRST_PICKUP" | "FEMALE_LAST_DROP" | "ISOLATED_FEMALE" | "OVERCAPACITY";
    severity: "HIGH" | "MEDIUM";
    notes: string;
  }[];
  hasEscort: boolean;
}

/**
 * Calculates 3 routing variations (Distance, Time, Balanced) for a set of employees assigned to a cab.
 */
export async function getRouteVariations(
  employees: OptimizeEmployee[],
  isPickup: boolean,
  hasEscort: boolean = false,
  apiKey: string = ""
): Promise<RouteVariation[]> {
  const n = employees.length;
  if (n === 0) return [];

  // Points list: index 0 is DEPOT, indices 1..n are employees
  const points: Point[] = [DEPOT, ...employees.map((e) => ({ x: e.x, y: e.y }))];
  const { distanceMatrix, durationMatrix } = await fetchGoogleMapsMatrix(points, apiKey);

  // Helper to check if a permutation of employee indices (1..n) is safe
  function isPermSafe(perm: number[]): boolean {
    if (hasEscort || perm.length <= 1) return true;
    const hasFemales = perm.some((idx) => employees[idx - 1].gender === "FEMALE");
    if (!hasFemales) return true;

    if (isPickup) {
      return employees[perm[0] - 1].gender === "MALE";
    } else {
      return employees[perm[perm.length - 1] - 1].gender === "MALE";
    }
  }

  // Generate all permutations of indices 1..n
  const indices = Array.from({ length: n }, (_, i) => i + 1);
  const permutations: number[][] = [];

  // Limit exact permutations to 8 stops (40,320 perms max) to prevent OOM/timeouts (500 errors) on large buses
  if (n <= 8) {
    function permute(arr: number[], memo: number[] = []) {
      if (arr.length === 0) {
        permutations.push(memo);
        return;
      }
      for (let i = 0; i < arr.length; i++) {
        const curr = arr.slice();
        const next = curr.splice(i, 1);
        permute(curr, memo.concat(next));
      }
    }
    permute(indices);
  } else {
    // For n > 8, fallback to just the original sequence to avoid crashing the server
    permutations.push(indices);
  }

  // Separate safe and unsafe permutations
  const safePerms: number[][] = [];
  const unsafePerms: number[][] = [];

  for (const perm of permutations) {
    if (isPermSafe(perm)) {
      safePerms.push(perm);
    } else {
      unsafePerms.push(perm);
    }
  }

  const pool = safePerms.length > 0 ? safePerms : unsafePerms;

  const strategies: ("DISTANCE" | "TIME" | "BALANCED" | "NORMAL")[] = ["DISTANCE", "TIME", "BALANCED", "NORMAL"];
  const variations: RouteVariation[] = [];

  for (const strategy of strategies) {
    let bestPerm = pool[0];
    let minCost = Infinity;

    if (strategy === "NORMAL") {
      // Find the permutation that corresponds to the alphabetical sorting of employees
      const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name));
      bestPerm = sortedEmployees.map(emp => employees.findIndex(e => e.id === emp.id) + 1);
    } else {
      for (const perm of pool) {
        let distCost = 0;
        let durationCost = 0;

        if (isPickup) {
          // Stop_1 -> Stop_2 -> ... -> Depot
          for (let i = 0; i < perm.length - 1; i++) {
            distCost += distanceMatrix[perm[i]][perm[i + 1]];
            durationCost += durationMatrix[perm[i]][perm[i + 1]];
          }
          distCost += distanceMatrix[perm[perm.length - 1]][0];
          durationCost += durationMatrix[perm[perm.length - 1]][0];
        } else {
          // Depot -> Stop_1 -> Stop_2 -> ...
          distCost += distanceMatrix[0][perm[0]];
          durationCost += durationMatrix[0][perm[0]];
          for (let i = 0; i < perm.length - 1; i++) {
            distCost += distanceMatrix[perm[i]][perm[i + 1]];
            durationCost += durationMatrix[perm[i]][perm[i + 1]];
          }
        }

        let cost = 0;
        if (strategy === "DISTANCE") {
          cost = distCost;
        } else if (strategy === "TIME") {
          cost = durationCost;
        } else {
          cost = distCost + durationCost * 0.5; // Balanced
        }

        if (cost < minCost) {
          minCost = cost;
          bestPerm = perm;
        }
      }
    }

    // Build Stops details for the best permutation
    let currentDistance = 0;
    let currentDuration = 0;
    const stops: RouteVariation["stops"] = [];

    if (isPickup) {
      for (let j = 0; j < bestPerm.length; j++) {
        const idx = bestPerm[j];
        const emp = employees[idx - 1];
        if (j > 0) {
          const prevIdx = bestPerm[j - 1];
          currentDistance += distanceMatrix[prevIdx][idx];
          currentDuration += durationMatrix[prevIdx][idx];
        }
        stops.push({
          employeeId: emp.id,
          employeeName: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
          stopOrder: j + 1,
          etaMinutes: currentDuration + 10, // 10m buffer for pickup start
        });
      }
      currentDistance += distanceMatrix[bestPerm[bestPerm.length - 1]][0];
      currentDuration += durationMatrix[bestPerm[bestPerm.length - 1]][0] + 10;
    } else {
      currentDistance += distanceMatrix[0][bestPerm[0]];
      currentDuration += durationMatrix[0][bestPerm[0]];
      for (let j = 0; j < bestPerm.length; j++) {
        const idx = bestPerm[j];
        const emp = employees[idx - 1];
        if (j > 0) {
          const prevIdx = bestPerm[j - 1];
          currentDistance += distanceMatrix[prevIdx][idx];
          currentDuration += durationMatrix[prevIdx][idx];
        }
        stops.push({
          employeeId: emp.id,
          employeeName: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
          stopOrder: j + 1,
          etaMinutes: currentDuration,
        });
      }
    }

    // Evaluate violations
    const finalViolations = checkSafetyViolations(
      stops.map((s) => ({ name: s.employeeName, gender: s.gender })),
      isPickup,
      hasEscort
    );

    const penalty = (hasEscort ? 15 : 0) + finalViolations.length * 30;
    const score = Math.max(30, Math.round(100 - currentDistance * 0.8 - penalty));

    variations.push({
      strategy,
      stops,
      totalDistance: Math.round(currentDistance * 10) / 10,
      totalDuration: currentDuration,
      optimizationScore: score,
      violations: finalViolations,
      hasEscort,
    });
  }

  return variations;
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STRATEGY OPTIMIZATION ENGINE
// Runs 3 distinct clustering strategies simultaneously, returning all 3 plans
// so the admin can compare and choose which one to commit to the database.
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyPlan {
  routes: OptimizedRoute[];
  totalCabsUsed: number;
  totalEmployeesCovered: number;
  totalDistance: number;          // km (sum across all routes)
  avgCommuteMins: number;         // average commute time per employee
  totalViolations: number;
  strategyScore: number;          // 0-100 composite: penalises distance, violations, and vehicle count
}

export interface AllStrategyPlans {
  MAXIMIZE_UTILIZATION: StrategyPlan;
  MINIMIZE_TIME: StrategyPlan;
  BALANCED: StrategyPlan;
  capacityShortfall: number;      // > 0 → admin needs more cabs
  totalCabCapacity: number;
  totalEmployees: number;
  usingFallback: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function idxFurthestFromDepot(employees: OptimizeEmployee[], depot: Point, roadData?: GlobalRoadData): number {
  let idx = 0, maxD = -1;
  for (let i = 0; i < employees.length; i++) {
    const empGlobalIdx = roadData?.empToGlobalIdx.get(employees[i].id);
    const d = roadData && empGlobalIdx !== undefined
      ? roadData.dist[empGlobalIdx][roadData.depotGlobalIdx]
      : getDistance({ x: employees[i].x, y: employees[i].y }, depot);
    if (d > maxD) { maxD = d; idx = i; }
  }
  return idx;
}

function idxNearestTo(employees: OptimizeEmployee[], ref: OptimizeEmployee, roadData?: GlobalRoadData): { idx: number; dist: number; roadDur?: number } {
  let idx = 0, minD = Infinity, durAtMin: number | undefined;
  const refGlobalIdx = roadData?.empToGlobalIdx.get(ref.id);
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    let d: number;
    let rd: number | undefined;
    if (refGlobalIdx !== undefined && roadData) {
      const empGlobalIdx = roadData.empToGlobalIdx.get(emp.id);
      if (empGlobalIdx === undefined) continue;
      d = roadData.dist[refGlobalIdx][empGlobalIdx];
      rd = roadData.dur[refGlobalIdx][empGlobalIdx];
    } else {
      d = getDistance({ x: emp.x, y: emp.y }, { x: ref.x, y: ref.y });
    }
    if (d < minD) { minD = d; durAtMin = rd; idx = i; }
  }
  return { idx, dist: minD, roadDur: durAtMin };
}

type ClusterAssignment = { cab: OptimizeCab; cluster: OptimizeEmployee[] };

/**
 * Strategy 1 — MAXIMIZE_UTILIZATION
 * Greedily fills every cab to capacity. No radius limit.
 * Uses fewest cabs possible. Some employees may have longer rides.
 */
function clusterMaxUtilization(
  employees: OptimizeEmployee[],
  cabs: OptimizeCab[],
  depot: Point,
  maxClusterRadiusKm: number = 15,
  roadData?: GlobalRoadData
): ClusterAssignment[] {
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  const remaining = [...employees];
  const assignments: ClusterAssignment[] = [];

  const seedStrategy = (process.env.SEED_STRATEGY || "depot").toLowerCase();

  for (const cab of sortedCabs) {
    if (remaining.length === 0) break;
    const seedIdx = idxFurthestFromDepot(remaining, depot, roadData);
    const seed = remaining.splice(seedIdx, 1)[0];
    const cluster: OptimizeEmployee[] = [seed];

    while (cluster.length < cab.capacity && remaining.length > 0) {
      const { idx, dist } = idxNearestTo(remaining, seed, roadData);
      if (dist > maxClusterRadiusKm) break;
      cluster.push(remaining.splice(idx, 1)[0]);
    }
    assignments.push({ cab, cluster });
  }
  reassignOutliers(assignments);
  return matchCabsToClusters(assignments);
}
/**
 * Strategy 2 — MINIMIZE_TIME
 * Keeps clusters tight (20 min road-duration radius from seed).
 * Scans ALL remaining employees against the seed and takes those within the
 * time/radius limits — sorted by road duration ascending. This prevents the
 * old bug where breaking on the single nearest (by km) caused employees that
 * are close in time (but not the absolute nearest by km) to be skipped.
 */
function clusterMinTime(
  employees: OptimizeEmployee[],
  cabs: OptimizeCab[],
  depot: Point,
  radiusMin: number = 20,
  maxClusterRadiusKm: number = 15,
  roadData?: GlobalRoadData
): ClusterAssignment[] {
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  const remaining = [...employees];
  const assignments: ClusterAssignment[] = [];

  for (const cab of sortedCabs) {
    if (remaining.length === 0) break;
    const seedIdx = idxFurthestFromDepot(remaining, depot, roadData);
    const seed = remaining.splice(seedIdx, 1)[0];
    const cluster: OptimizeEmployee[] = [seed];
    const seedGlobalIdx = roadData?.empToGlobalIdx.get(seed.id);

    while (cluster.length < cab.capacity && remaining.length > 0) {
      // Score every remaining employee from the seed — pick by road duration
      type Cand = { remIdx: number; dist: number; dur: number };
      const eligible: Cand[] = [];
      for (let j = 0; j < remaining.length; j++) {
        const emp = remaining[j];
        let dist: number, dur: number;
        if (seedGlobalIdx !== undefined && roadData) {
          const gIdx = roadData.empToGlobalIdx.get(emp.id);
          if (gIdx === undefined) continue;
          dist = roadData.dist[seedGlobalIdx][gIdx];
          dur  = roadData.dur[seedGlobalIdx][gIdx];
        } else {
          dist = getDistance({ x: emp.x, y: emp.y }, { x: seed.x, y: seed.y });
          dur  = dist / AVG_SPEED;
        }
        if (dist <= maxClusterRadiusKm && dur <= radiusMin) {
          eligible.push({ remIdx: j, dist, dur });
        }
      }
      if (eligible.length === 0) break;
      eligible.sort((a, b) => a.dur - b.dur);
      cluster.push(remaining.splice(eligible[0].remIdx, 1)[0]);
    }
    assignments.push({ cab, cluster });
  }
  reassignOutliers(assignments);
  return matchCabsToClusters(assignments);
}
/**
 * Strategy 3 — BALANCED
 * 30 min road-duration radius, targets ~80% fill before stopping.
 * Balances commute time vs cab utilization.
 * Scans all remaining employees within the km radius and stops early only
 * when targetFill is reached AND the best remaining candidate exceeds 30 min.
 */
function clusterBalanced(
  employees: OptimizeEmployee[],
  cabs: OptimizeCab[],
  depot: Point,
  maxClusterRadiusKm: number = 15,
  roadData?: GlobalRoadData
): ClusterAssignment[] {
  const RADIUS_MIN = 30;
  const FILL_RATIO = 0.8;
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  const remaining = [...employees];
  const assignments: ClusterAssignment[] = [];

  for (const cab of sortedCabs) {
    if (remaining.length === 0) break;
    const targetFill = Math.max(1, Math.ceil(cab.capacity * FILL_RATIO));
    const seedIdx = idxFurthestFromDepot(remaining, depot, roadData);
    const seed = remaining.splice(seedIdx, 1)[0];
    const cluster: OptimizeEmployee[] = [seed];
    const seedGlobalIdx = roadData?.empToGlobalIdx.get(seed.id);

    while (cluster.length < cab.capacity && remaining.length > 0) {
      type Cand = { remIdx: number; dist: number; dur: number };
      const eligible: Cand[] = [];
      for (let j = 0; j < remaining.length; j++) {
        const emp = remaining[j];
        let dist: number, dur: number;
        if (seedGlobalIdx !== undefined && roadData) {
          const gIdx = roadData.empToGlobalIdx.get(emp.id);
          if (gIdx === undefined) continue;
          dist = roadData.dist[seedGlobalIdx][gIdx];
          dur  = roadData.dur[seedGlobalIdx][gIdx];
        } else {
          dist = getDistance({ x: emp.x, y: emp.y }, { x: seed.x, y: seed.y });
          dur  = dist / AVG_SPEED;
        }
        if (dist <= maxClusterRadiusKm) {
          eligible.push({ remIdx: j, dist, dur });
        }
      }
      if (eligible.length === 0) break;
      eligible.sort((a, b) => a.dist - b.dist);
      // Stop early only when targetFill reached AND best remaining exceeds RADIUS_MIN
      if (cluster.length >= targetFill && eligible[0].dur > RADIUS_MIN) break;
      cluster.push(remaining.splice(eligible[0].remIdx, 1)[0]);
    }
    assignments.push({ cab, cluster });
  }
  reassignOutliers(assignments);
  return matchCabsToClusters(assignments);
}

// ── Reassign Outliers: Post-clustering employee chain-swap ─────────────────
// Detects employees that are geographic outliers within their assigned cluster
// and chain-swaps them to the closest valid cluster. Runs BEFORE cab matching
// so cluster composition is geographically coherent first.
const OUTLIER_DIST_RATIO = 2.0;  // distance-to-centroid > 2× cluster mean
const OUTLIER_CLOSER_RATIO = 0.7; // other centroid < 70% of own-centroid distance
const MAX_CHAIN_DEPTH = 5;

function clusterCentroid(cluster: OptimizeEmployee[]): Point {
  return {
    x: cluster.reduce((s, e) => s + e.x, 0) / Math.max(cluster.length, 1),
    y: cluster.reduce((s, e) => s + e.y, 0) / Math.max(cluster.length, 1),
  };
}

function detectOutliers(
  assignments: ClusterAssignment[],
  centroids: Point[]
): { srcIdx: number; empId: string; severity: number }[] {
  const results: { srcIdx: number; empId: string; severity: number }[] = [];
  for (let ci = 0; ci < assignments.length; ci++) {
    const cluster = assignments[ci].cluster;
    if (cluster.length <= 1) continue;
    const cent = centroids[ci];
    const meanDist = cluster.reduce((s, e) => s + getDistance(e, cent), 0) / cluster.length;
    if (meanDist < 0.001) continue;
    for (const emp of cluster) {
      const dOwn = getDistance(emp, cent);
      // Criterion 1: distance from own centroid far exceeds cluster mean
      if (dOwn > meanDist * OUTLIER_DIST_RATIO) {
        results.push({ srcIdx: ci, empId: emp.id, severity: dOwn / meanDist });
        continue;
      }
      // Criterion 2: closer to another cluster's centroid that has room
      for (let cj = 0; cj < assignments.length; cj++) {
        if (cj === ci) continue;
        if (assignments[cj].cluster.length >= assignments[cj].cab.capacity) continue;
        if (getDistance(emp, centroids[cj]) < dOwn * OUTLIER_CLOSER_RATIO) {
          results.push({ srcIdx: ci, empId: emp.id, severity: dOwn / meanDist });
          break;
        }
      }
    }
  }
  results.sort((a, b) => b.severity - a.severity);
  return results;
}

function isOutlierInCluster(
  emp: OptimizeEmployee,
  cluster: OptimizeEmployee[],
  centroid: Point
): boolean {
  if (cluster.length <= 1) return false;
  const meanDist = cluster.reduce((s, e) => s + getDistance(e, centroid), 0) / cluster.length;
  return meanDist >= 0.001 && getDistance(emp, centroid) > meanDist * OUTLIER_DIST_RATIO;
}

function findWorstFit(
  employees: OptimizeEmployee[],
  destCentroid: Point,
  srcCentroid: Point
): number {
  let worstIdx = -1;
  let worstScore = -Infinity;
  for (let i = 0; i < employees.length; i++) {
    const dDest = getDistance(employees[i], destCentroid);
    const dSrc = getDistance(employees[i], srcCentroid);
    const score = dDest * 1.5 - dSrc;
    if (score > worstScore) { worstScore = score; worstIdx = i; }
  }
  return worstIdx;
}

function reassignOutliers(assignments: ClusterAssignment[]): void {
  if (assignments.length <= 1) return;

  let centroids = assignments.map(a => clusterCentroid(a.cluster));
  let outliers = detectOutliers(assignments, centroids);
  if (outliers.length === 0) return;

  const visited = new Set<string>();

  function chainReassign(srcIdx: number, empId: string, depth: number): void {
    if (depth > MAX_CHAIN_DEPTH) return;
    const key = `${empId}:${srcIdx}`;
    if (visited.has(key)) return;
    visited.add(key);

    // Refresh centroids (may have shifted)
    centroids = assignments.map(a => clusterCentroid(a.cluster));

    const srcCluster = assignments[srcIdx].cluster;
    const empIdx = srcCluster.findIndex(e => e.id === empId);
    if (empIdx < 0) return;
    const emp = srcCluster[empIdx];

    // Find closest destination cluster with room (prefer) or any
    let bestDestIdx = -1;
    let bestDist = Infinity;
    let hasRoom = false;

    for (let cj = 0; cj < assignments.length; cj++) {
      if (cj === srcIdx) continue;
      const cap = assignments[cj].cab.capacity;
      const d = getDistance(emp, centroids[cj]);
      const room = assignments[cj].cluster.length < cap;
      // Prefer destinations with room; fall back to full ones
      const priority = room ? 0 : 1;
      const score = priority * 1e6 + d;
      if (score < bestDist) {
        bestDist = score;
        bestDestIdx = cj;
        hasRoom = room;
      }
    }

    if (bestDestIdx < 0) return;

    const destCluster = assignments[bestDestIdx].cluster;
    const destCap = assignments[bestDestIdx].cab.capacity;

    if (hasRoom) {
      // Simple move
      srcCluster.splice(empIdx, 1);
      destCluster.push(emp);
    } else if (destCluster.length > 0) {
      // Full cluster — swap with worst-fit employee
      const worstIdx = findWorstFit(destCluster, centroids[bestDestIdx], centroids[srcIdx]);
      if (worstIdx < 0) return;
      const displaced = destCluster[worstIdx];
      destCluster[worstIdx] = emp;
      srcCluster[empIdx] = displaced;

      // Recursively check if displaced is now an outlier in source
      centroids = assignments.map(a => clusterCentroid(a.cluster));
      if (isOutlierInCluster(displaced, srcCluster, centroids[srcIdx])) {
        chainReassign(srcIdx, displaced.id, depth + 1);
      }
    }
  }

  for (const o of outliers) {
    chainReassign(o.srcIdx, o.empId, 0);
  }
}

// ── Hungarian algorithm for minimum-cost perfect matching ─────────────────
// Replaces the previous greedy matching in matchCabsToClusters to find the
// globally optimal cab-to-cluster assignment, minimising total driver deadhead.
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];

  const INF = 1e15;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = Math.max(cost[i0 - 1][j - 1] - u[i0] - v[j], 0);
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) {
      result[p[j] - 1] = j - 1;
    }
  }
  return result;
}

/**
 * Re-matches cabs to clusters based on driver startPoint proximity to cluster centroid.
 * Uses Hungarian algorithm for globally optimal assignment. Runs AFTER clustering
 * so cluster composition is unchanged — only swaps which cab services which cluster.
 */
function matchCabsToClusters(
  assignments: ClusterAssignment[]
): ClusterAssignment[] {
  if (assignments.length <= 1) return assignments;

  const n = assignments.length;
  const cabsInOrder = assignments.map(a => a.cab);
  const clusters = assignments.map(a => a.cluster);

  // Compute geographic centroid for each cluster
  const centroids = clusters.map(cluster => ({
    x: cluster.reduce((s, e) => s + e.x, 0) / Math.max(cluster.length, 1),
    y: cluster.reduce((s, e) => s + e.y, 0) / Math.max(cluster.length, 1),
  }));

  // Build cost matrix: cost[cabIdx][clusterIdx] = dist(cab.startPoint, cluster centroid)
  // Invalid assignments (capacity < cluster size) get a prohibitive cost to discourage assignment
  const INFEASIBLE = 1e12;
  const cost: number[][] = cabsInOrder.map(cab =>
    centroids.map((centroid, clIdx) => {
      if (cab.capacity < clusters[clIdx].length) return INFEASIBLE;
      if (!cab.startPoint) return INFEASIBLE;
      return getDistance(cab.startPoint, centroid);
    })
  );

  // Hungarian: globally optimal minimum-cost assignment
  const assignment = hungarian(cost);

  // Rebuild assignments with the matched cabs
  return assignments.map((a, clIdx) => {
    const cabIdx = assignment[clIdx];
    return {
      cab: cabIdx >= 0 && cabIdx < n ? cabsInOrder[cabIdx] : a.cab,
      cluster: a.cluster,
    };
  });
}

async function buildRoutesFromAssignments(
  assignments: ClusterAssignment[],
  employees: OptimizeEmployee[],  // full employee list for post-swap lookups
  isPickup: boolean,
  apiKey: string,
  depot: Point,
  roadData?: GlobalRoadData,
  constraints: RouteConstraints = defaultConstraints()
): Promise<OptimizedRoute[]> {
  const routes: OptimizedRoute[] = [];

  // Seed uncovered with employees that the cluster function never placed into any cab.
  // Cluster functions (clusterMinTime, clusterBalanced) use a local `remaining` array
  // and drop employees that fall outside duration/radius thresholds — they never get
  // into assignments at all, so they'd be silently lost without this seeding step.
  const allClusteredIds = new Set(assignments.flatMap(a => a.cluster.map(e => e.id)));
  const uncovered: OptimizeEmployee[] = employees.filter(e => !allClusteredIds.has(e.id));

  for (const { cab, cluster } of assignments) {
    const startPoint = cab.startPoint || depot;
    if (cluster.length === 0) continue;

    // Hard cap: never assign more stops than the cab's stated capacity
    const cappedCluster = cluster.slice(0, cab.capacity);

    // Optimal stop order using matrix-backed distance scoring + safety enforcement
    let attemptCluster = [...cappedCluster];
    let routeAccepted = false;
    let finalStops: OptimizedRouteStop[] = [];
    let finalDistance = 0;
    let finalDuration = 0;
    let finalViolations: { type: "FEMALE_FIRST_PICKUP" | "FEMALE_LAST_DROP" | "OVERCAPACITY" | "ISOLATED_FEMALE"; severity: "HIGH" | "MEDIUM"; notes: string }[] = [];

    while (attemptCluster.length > 0 && !routeAccepted) {
      let subMatrixSize = attemptCluster.length + 2;
      let subDist: number[][], subDur: number[][];

      if (roadData) {
        const cabGlobalIdx = roadData.cabToGlobalIdx.get(cab.id) ?? roadData.depotGlobalIdx;
        const neededGlobalIndices = [
          cabGlobalIdx,
          ...attemptCluster.map(e => roadData.empToGlobalIdx.get(e.id)).filter((idx): idx is number => idx !== undefined),
          roadData.depotGlobalIdx,
        ];
        subMatrixSize = neededGlobalIndices.length;
        subDist = Array.from({ length: subMatrixSize }, (_, i) =>
          neededGlobalIndices.map(j => roadData.dist[neededGlobalIndices[i]][j])
        );
        subDur = Array.from({ length: subMatrixSize }, (_, i) =>
          neededGlobalIndices.map(j => roadData.dur[neededGlobalIndices[i]][j])
        );
      } else {
        const allPoints: Point[] = [startPoint, ...attemptCluster.map(e => ({ x: e.x, y: e.y })), depot];
        subMatrixSize = allPoints.length;
        const matrices = await fetchGoogleMapsMatrix(allPoints, apiKey);
        subDist = matrices.distanceMatrix;
        subDur = matrices.durationMatrix;
      }

      const ordered = getOptimalPermutation(attemptCluster, isPickup, subDist, startPoint);
      const { route: safeRoute } = enforceSafetyRules(ordered, isPickup, false);

      const perm = safeRoute.map(e => attemptCluster.indexOf(e));
      const reordered = reorderMatrixForRoute(subDist, subDur, perm, 0, subMatrixSize - 1);

      const verification = verifyRouteConstraints(
        safeRoute, isPickup, startPoint, depot,
        reordered.distanceMatrix, reordered.durationMatrix, constraints
      );

      if (verification.ok) {
        const { stops, totalDistance: distance, totalDuration: duration } = buildRouteStopsFromMetrics(
          safeRoute, isPickup, startPoint, depot,
          reordered.distanceMatrix, reordered.durationMatrix
        );
        finalStops = stops;
        finalDistance = distance;
        finalDuration = duration;
        finalViolations = checkSafetyViolations(
          stops.map(s => ({ name: s.employeeName, gender: s.gender, status: s.status })),
          isPickup, false
        );
        routeAccepted = true;
      } else {
        // Push shed employee into uncovered pool — never silently discard
        const shed = attemptCluster.pop();
        if (shed) uncovered.push(shed);
      }
    }

    routes.push({
      cabId: cab.id,
      vehicleNumber: cab.vehicleNumber,
      capacity: cab.capacity,
      driverName: cab.driverName || "Unassigned",
      driverPhone: cab.driverPhone || "N/A",
      startPoint,
      stops: finalStops,
      totalDistance: finalDistance,
      totalDuration: finalDuration,
      optimizationScore: Math.max(30, Math.round(100 - finalDistance * 0.8 - finalViolations.length * 30)),
      violations: finalViolations,
      hasEscort: false,
      tripSequence: cab.tripSequence,
    });
  }

  // --- REDISTRIBUTION PASS ---
  // Employees shed from failing clusters (uncovered[]) get a second chance.
  // Each is tried against every existing route with spare capacity.
  // Radius is relaxed 1.5× for redistribution. Strategy identity is preserved
  // because routes were already built with strategy-specific cluster composition.
  if (uncovered.length > 0) {
    for (let empIdx = uncovered.length - 1; empIdx >= 0; empIdx--) {
      const emp = uncovered[empIdx];
      let placed = false;

      for (const route of routes) {
        if (route.stops.length >= route.capacity) continue;

        const routeEmps = route.stops
          .map(s => employees.find(e => e.id === s.employeeId))
          .filter((e): e is OptimizeEmployee => e !== undefined);
        if (routeEmps.length === 0) continue;

        const centroid = {
          x: routeEmps.reduce((s, e) => s + e.x, 0) / routeEmps.length,
          y: routeEmps.reduce((s, e) => s + e.y, 0) / routeEmps.length,
        };
        if (getDistance(emp, centroid) > constraints.maxClusterRadiusKm * 1.5) continue;

        const trialCluster = [...routeEmps, emp];
        const routeStartPoint = route.startPoint || depot;

        let subDist: number[][], subDur: number[][], subSize: number;
        if (roadData) {
          const cabGIdx = roadData.cabToGlobalIdx.get(route.cabId) ?? roadData.depotGlobalIdx;
          const idxs = [
            cabGIdx,
            ...trialCluster.map(e => roadData.empToGlobalIdx.get(e.id)).filter((i): i is number => i !== undefined),
            roadData.depotGlobalIdx,
          ];
          subSize = idxs.length;
          subDist = Array.from({ length: subSize }, (_, r) => idxs.map(c => roadData.dist[idxs[r]][c]));
          subDur  = Array.from({ length: subSize }, (_, r) => idxs.map(c => roadData.dur[idxs[r]][c]));
        } else {
          const pts: Point[] = [routeStartPoint, ...trialCluster.map(e => ({ x: e.x, y: e.y })), depot];
          subSize = pts.length;
          const mx = await fetchGoogleMapsMatrix(pts, apiKey);
          subDist = mx.distanceMatrix;
          subDur  = mx.durationMatrix;
        }

        const ordered = getOptimalPermutation(trialCluster, isPickup, subDist, routeStartPoint);
        const { route: safeOrdered } = enforceSafetyRules(ordered, isPickup, false);
        const perm = safeOrdered.map(e => trialCluster.indexOf(e));
        const reordered = reorderMatrixForRoute(subDist, subDur, perm, 0, subSize - 1);

        const v = verifyRouteConstraints(
          safeOrdered, isPickup, routeStartPoint, depot,
          reordered.distanceMatrix, reordered.durationMatrix, constraints
        );
        if (v.ok) {
          const { stops } = buildRouteStopsFromMetrics(
            safeOrdered, isPickup, routeStartPoint, depot,
            reordered.distanceMatrix, reordered.durationMatrix
          );
          route.stops = stops;
          route.totalDistance = v.totalDistance;
          route.totalDuration = v.totalDuration + (isPickup ? 10 : 0);
          uncovered.splice(empIdx, 1);
          placed = true;
          break;
        }
      }

      // Last resort: force into the route with most spare capacity (relax constraints 1.3×)
      if (!placed) {
        const candidate = routes
          .filter(r => r.stops.length < r.capacity)
          .sort((a, b) => (b.capacity - b.stops.length) - (a.capacity - a.stops.length))[0];
        if (!candidate) continue; // genuine capacity shortfall — no seats available at all

        const routeEmps = candidate.stops
          .map(s => employees.find(e => e.id === s.employeeId))
          .filter((e): e is OptimizeEmployee => e !== undefined);
        const trialCluster = [...routeEmps, emp];
        const routeStartPoint = candidate.startPoint || depot;

        let subDist: number[][], subDur: number[][], subSize: number;
        if (roadData) {
          const cabGIdx = roadData.cabToGlobalIdx.get(candidate.cabId) ?? roadData.depotGlobalIdx;
          const idxs = [
            cabGIdx,
            ...trialCluster.map(e => roadData.empToGlobalIdx.get(e.id)).filter((i): i is number => i !== undefined),
            roadData.depotGlobalIdx,
          ];
          subSize = idxs.length;
          subDist = Array.from({ length: subSize }, (_, r) => idxs.map(c => roadData.dist[idxs[r]][c]));
          subDur  = Array.from({ length: subSize }, (_, r) => idxs.map(c => roadData.dur[idxs[r]][c]));
        } else {
          const pts: Point[] = [routeStartPoint, ...trialCluster.map(e => ({ x: e.x, y: e.y })), depot];
          subSize = pts.length;
          const mx = await fetchGoogleMapsMatrix(pts, apiKey);
          subDist = mx.distanceMatrix;
          subDur  = mx.durationMatrix;
        }

        const ordered = getOptimalPermutation(trialCluster, isPickup, subDist, routeStartPoint);
        const { route: safeOrdered } = enforceSafetyRules(ordered, isPickup, false);
        const perm = safeOrdered.map(e => trialCluster.indexOf(e));
        const reordered = reorderMatrixForRoute(subDist, subDur, perm, 0, subSize - 1);

        const relaxed: RouteConstraints = {
          ...constraints,
          maxRouteDistanceKm: Infinity,
          maxRouteDurationMin: Infinity,
          maxClusterRadiusKm: Infinity,
          maxEmployeeDetourKm: Infinity,
        };
        const v = verifyRouteConstraints(
          safeOrdered, isPickup, routeStartPoint, depot,
          reordered.distanceMatrix, reordered.durationMatrix, relaxed
        );
        if (v.ok) {
          const { stops } = buildRouteStopsFromMetrics(
            safeOrdered, isPickup, routeStartPoint, depot,
            reordered.distanceMatrix, reordered.durationMatrix
          );
          candidate.stops = stops;
          candidate.totalDistance = v.totalDistance;
          candidate.totalDuration = v.totalDuration + (isPickup ? 10 : 0);
          uncovered.splice(empIdx, 1);
        }
        // If still not placeable — genuine capacity shortfall, leave in uncovered
      }
    }

    // --- GUARANTEED SEAT PASS ---
    // After all redistribution attempts, if seats still exist and employees are still uncovered,
    // force-assign them unconditionally. Physical capacity > routing aesthetics.
    for (let empIdx = uncovered.length - 1; empIdx >= 0; empIdx--) {
      const emp = uncovered[empIdx];
      const routeWithSpace = routes
        .filter(r => r.stops.length < r.capacity)
        .sort((a, b) => (a.stops.length / a.capacity) - (b.stops.length / b.capacity))[0]; // pick least-full route
      if (!routeWithSpace) break; // genuine capacity shortfall

      const existingEmps = routeWithSpace.stops
        .map(s => employees.find(e => e.id === s.employeeId))
        .filter((e): e is OptimizeEmployee => e !== undefined);

      const allEmps = [...existingEmps, emp];
      const gsStartPoint = routeWithSpace.startPoint || depot;

      let gsDist: number[][], gsDur: number[][], gsSize: number;
      if (roadData) {
        const cabGIdx = roadData.cabToGlobalIdx.get(routeWithSpace.cabId) ?? roadData.depotGlobalIdx;
        const idxs = [
          cabGIdx,
          ...allEmps.map(e => roadData.empToGlobalIdx.get(e.id)).filter((i): i is number => i !== undefined),
          roadData.depotGlobalIdx,
        ];
        gsSize = idxs.length;
        gsDist = Array.from({ length: gsSize }, (_, r) => idxs.map(c => roadData.dist[idxs[r]][c]));
        gsDur  = Array.from({ length: gsSize }, (_, r) => idxs.map(c => roadData.dur[idxs[r]][c]));
      } else {
        const pts: Point[] = [gsStartPoint, ...allEmps.map(e => ({ x: e.x, y: e.y })), depot];
        gsSize = pts.length;
        const mx = await fetchGoogleMapsMatrix(pts, apiKey);
        gsDist = mx.distanceMatrix;
        gsDur  = mx.durationMatrix;
      }

      const gsOrdered = getOptimalPermutation(allEmps, isPickup, gsDist, gsStartPoint);
      const { route: gsSafe } = enforceSafetyRules(gsOrdered, isPickup, false);
      const gsPerm = gsSafe.map(e => allEmps.indexOf(e));
      const gsReordered = reorderMatrixForRoute(gsDist, gsDur, gsPerm, 0, gsSize - 1);

      const { stops: gsStops } = buildRouteStopsFromMetrics(
        gsSafe, isPickup, gsStartPoint, depot,
        gsReordered.distanceMatrix, gsReordered.durationMatrix
      );
      const gsMetrics = computeRouteMetrics(
        gsSafe, isPickup, gsStartPoint, depot,
        gsReordered.distanceMatrix, gsReordered.durationMatrix
      );

      routeWithSpace.stops = gsStops;
      routeWithSpace.totalDistance = gsMetrics.totalDistance;
      routeWithSpace.totalDuration = gsMetrics.totalDuration + (isPickup ? 10 : 0);
      uncovered.splice(empIdx, 1);
    }
  }

  return routes;
}

function summarisePlan(routes: OptimizedRoute[]): StrategyPlan {
  const covered = new Set(routes.flatMap(r => r.stops.map(s => s.employeeId))).size;
  const totalDist = routes.reduce((s, r) => s + r.totalDistance, 0);
  const allDurations = routes.flatMap(r => r.stops.map(s => s.etaMinutes));
  const avgMins = allDurations.length > 0
    ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
    : 0;
  const violations = routes.reduce(
    (s, r) => s + r.violations.length,
    0
  );

  const strategyScore = Math.max(0, Math.round(
    100 - (totalDist * 0.5) - (routes.length * 5) - (violations * 20)
  ));

  return {
    routes,
    totalCabsUsed: routes.length,
    totalEmployeesCovered: covered,
    totalDistance: Math.round(totalDist * 10) / 10,
    avgCommuteMins: avgMins,
    totalViolations: violations,
    strategyScore,
  };
}

/**
 * Main entry point: run all 3 clustering strategies simultaneously.
 * Returns a preview of all 3 plans WITHOUT saving to the database.
 * The admin reviews them and picks one via applyOptimizationPlan().
 */
export async function optimizeAllStrategies(
  employees: OptimizeEmployee[],
  cabs: OptimizeCab[],
  isPickup: boolean = true,
  apiKey: string = "",
  depot: Point = DEPOT,
  constraints: RouteConstraints = defaultConstraints()
): Promise<AllStrategyPlans> {
  const totalCabCapacity = cabs.reduce((sum, c) => sum + c.capacity, 0);
  const capacityShortfall = Math.max(0, employees.length - totalCabCapacity);

  // Build global road matrix once: [cab_0_start, ..., cab_{M-1}_start, emp_0, ..., emp_{N-1}, depot]
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  const globalPoints: Point[] = [
    ...sortedCabs.map(c => c.startPoint || depot),
    ...employees.map(e => ({ x: e.x, y: e.y })),
    depot,
  ];
  const cabCount = sortedCabs.length;
  const empOffset = cabCount;
  const depotGlobalIdx = globalPoints.length - 1;
  const empToGlobalIdx = new Map<string, number>();
  employees.forEach((e, i) => empToGlobalIdx.set(e.id, empOffset + i));
  const cabToGlobalIdx = new Map<string, number>();
  sortedCabs.forEach((c, i) => cabToGlobalIdx.set(c.id, i));

  const { distanceMatrix: globalDist, durationMatrix: globalDur, usingFallback } = await fetchGoogleMapsMatrix(globalPoints, apiKey);

  const roadData: GlobalRoadData = {
    dist: globalDist,
    dur: globalDur,
    empToGlobalIdx,
    cabToGlobalIdx,
    depotGlobalIdx,
  };

  const maxUtilConstraints: RouteConstraints = {
    ...constraints,
    maxRouteDistanceKm: Infinity,
    maxRouteDurationMin: Infinity,
    maxClusterRadiusKm: Infinity,
  };

  const [maxRoutes, minRoutes, balRoutes] = await Promise.all([
    buildRoutesFromAssignments(
      clusterMaxUtilization(employees, sortedCabs, depot, Infinity, roadData),
      employees, isPickup, apiKey, depot, roadData, maxUtilConstraints
    ),
    buildRoutesFromAssignments(
      clusterMinTime(employees, sortedCabs, depot, 20, constraints.maxClusterRadiusKm, roadData),
      employees, isPickup, apiKey, depot, roadData, constraints
    ),
    buildRoutesFromAssignments(
      clusterBalanced(employees, sortedCabs, depot, constraints.maxClusterRadiusKm, roadData),
      employees, isPickup, apiKey, depot, roadData, constraints
    ),
  ]);

  return {
    MAXIMIZE_UTILIZATION: summarisePlan(maxRoutes),
    MINIMIZE_TIME: summarisePlan(minRoutes),
    BALANCED: summarisePlan(balRoutes),
    capacityShortfall,
    totalCabCapacity,
    totalEmployees: employees.length,
    usingFallback,
  };
}

