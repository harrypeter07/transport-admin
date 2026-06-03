import { mapsProvider } from "@/lib/maps";
import { getSessionCache, setSessionCache } from "@/lib/sessionCache";

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

  const distanceFn = distanceMatrix
    ? makeMatrixDistanceFn(employees, distanceMatrix, DEPOT)
    : undefined;

  // For large clusters use greedy nearest-neighbor — O(n²) instead of O(n!)
  if (employees.length > 7) {
    const remaining = [...employees];
    const ordered: OptimizeEmployee[] = [];

    // Start with the employee furthest from the depot (handles remote areas first)
    let seedIdx = 0;
    let maxDist = -1;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceFn
        ? distanceFn(remaining[i], DEPOT)
        : getDistance(remaining[i], DEPOT);
      if (d > maxDist) { maxDist = d; seedIdx = i; }
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
  return bestSafeRoute.length > 0 ? bestSafeRoute : bestUnsafeRoute;
}

// Calculate the total route distance
function calculateRouteDistance(route: OptimizeEmployee[], isPickup: boolean, depot: Point = DEPOT, startPoint?: Point, distanceFn?: (a: Point, b: Point) => number): number {
  if (route.length === 0) return 0;
  const fn = distanceFn ?? getDistance;
  let dist = 0;

  if (isPickup) {
    if (startPoint) {
      dist += fn(startPoint, route[0]);
    }
    for (let i = 0; i < route.length - 1; i++) {
      dist += fn(route[i], route[i + 1]);
    }
    dist += fn(route[route.length - 1], depot);
  } else {
    dist += fn(depot, route[0]);
    for (let i = 0; i < route.length - 1; i++) {
      dist += fn(route[i], route[i + 1]);
    }
  }

  return dist;
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

  for (let i = 0; i < sortedCabs.length; i++) {
    if (remainingEmployees.length === 0) break;

    const cab = sortedCabs[i];
    const capacity = cab.capacity;
    const startPoint = cab.startPoint || depot;

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

    // Find the closest employees to the seed by road distance to fill the cab capacity
    const cluster: OptimizeEmployee[] = [seed];
    const seedGIdx = empToGlobalIdx.get(seed.id) ?? depotGlobalIdx;

    while (cluster.length < capacity && remainingEmployees.length > 0) {
      let closestIdx = 0;
      let minDuration = Infinity;
      let minDist = Infinity;
      for (let j = 0; j < remainingEmployees.length; j++) {
        const gIdx = empToGlobalIdx.get(remainingEmployees[j].id);
        if (gIdx === undefined) continue;
        const dur = globalDur[seedGIdx][gIdx];
        const dist = globalDist[seedGIdx][gIdx];
        if (dist < minDist) {
          minDist = dist;
          minDuration = dur;
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

    // Try building a valid route: if constraints are violated, shed employees and retry
    let attemptCluster = [...cluster];
    let routeAccepted = false;

    while (attemptCluster.length > 0 && !routeAccepted) {
      // Build sub-matrix from global road data for [cabIdx, ...attemptCluster, depot]
      const attemptIndices = [
        i,
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

      // Verify route against hard constraints
      const verification = verifyRouteConstraints(
        safetyCorrectedRoute,
        isPickup,
        startPoint,
        depot,
        reordered.distanceMatrix,
        reordered.durationMatrix,
        constraints
      );

      if (verification.ok) {
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
        // Shed the employee farthest from depot in this cluster and retry
        const shedIdx = attemptCluster
          .map((e, idx) => ({ idx, dist: globalDist[empToGlobalIdx.get(e.id) ?? depotGlobalIdx]?.[depotGlobalIdx] ?? 0 }))
          .sort((a, b) => b.dist - a.dist)[0]?.idx ?? attemptCluster.length - 1;

        const shedEmployee = attemptCluster.splice(shedIdx, 1)[0];
        remainingEmployees.push(shedEmployee);
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

      const lrV = verifyRouteConstraints(
        lrSafe, isPickup, cabWithSpace.startPoint || depot, depot,
        lrReordered.distanceMatrix, lrReordered.durationMatrix, constraints
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
 * Google Routes Matrix API is the primary provider; Haversine is last-resort fallback.
 */
export async function fetchGoogleMapsMatrix(
  points: Point[],
  apiKey: string
): Promise<{ distanceMatrix: number[][]; durationMatrix: number[][]; usingFallback: boolean }> {
  const n = points.length;
  if (n === 0) return { distanceMatrix: [], durationMatrix: [], usingFallback: false };

  // Check in-memory cache (5 min TTL) for identical point sets
  const cacheKey = apiKey
    ? `matrix:${apiKey.slice(-8)}:${points.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join("|")}`
    : "";
  if (apiKey) {
    const cached = getSessionCache<{ dist: number[][]; dur: number[][] }>(cacheKey);
    if (cached) {
      return { distanceMatrix: cached.dist, durationMatrix: cached.dur, usingFallback: false };
    }
  }

  if (apiKey) {
    const routesMatrix = await mapsProvider.computeMatrix(points, apiKey);
    if (routesMatrix) {
      setSessionCache(cacheKey, { dist: routesMatrix.distanceMatrix, dur: routesMatrix.durationMatrix }, 5 * 60 * 1000);
      return { ...routesMatrix, usingFallback: false };
    }
  }

  console.warn("[optimization] ⚠️ Matrix API call failed or no API key — using Haversine estimation");
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
  return assignments;
}

/**
 * Strategy 2 — MINIMIZE_TIME
 * Keeps clusters tight (20 min road-duration radius from seed).
 * Outliers seed their own separate cab — shorter rides for everyone.
 * May leave some cab seats empty.
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

    while (cluster.length < cab.capacity && remaining.length > 0) {
      const { idx, dist, roadDur } = idxNearestTo(remaining, seed, roadData);
      if (dist > maxClusterRadiusKm) break;
      const breakDur = roadDur ?? dist;
      if (breakDur > radiusMin) break;
      cluster.push(remaining.splice(idx, 1)[0]);
    }
    assignments.push({ cab, cluster });
  }
  return assignments;
}

/**
 * Strategy 3 — BALANCED
 * 30 min road-duration radius, targets ~80% fill before stopping.
 * Balances commute time vs cab utilization.
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

    while (cluster.length < cab.capacity && remaining.length > 0) {
      const { idx, dist, roadDur } = idxNearestTo(remaining, seed, roadData);
      if (dist > maxClusterRadiusKm) break;
      const breakDur = roadDur ?? (idxNearestTo(remaining, seed).dist);
      if (breakDur > RADIUS_MIN && cluster.length >= targetFill) break;
      cluster.push(remaining.splice(idx, 1)[0]);
    }
    assignments.push({ cab, cluster });
  }
  return assignments;
}

// ── Route builder from a set of cluster assignments ───────────────────────────

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
        attemptCluster.pop();
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
    });
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

  return {
    routes,
    totalCabsUsed: routes.length,
    totalEmployeesCovered: covered,
    totalDistance: Math.round(totalDist * 10) / 10,
    avgCommuteMins: avgMins,
    totalViolations: violations,
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

  const [maxRoutes, minRoutes, balRoutes] = await Promise.all([
    buildRoutesFromAssignments(
      clusterMaxUtilization(employees, sortedCabs, depot, constraints.maxClusterRadiusKm, roadData),
      employees, isPickup, apiKey, depot, roadData, constraints
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

