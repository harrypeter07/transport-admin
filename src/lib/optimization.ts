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

// Backward-compatible default depot (Nagpur/MIHAN). Callers should use makeDepot() from settings.
export const DEPOT: Point = { x: 79.0526, y: 21.0625 };

/**
 * Constructs a depot Point from lat/lng values read from SystemSettings.
 * Use this instead of the static DEPOT constant wherever settings are available.
 */
export function makeDepot(lat: number, lng: number): Point {
  return { x: lng, y: lat };
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

/**
 * Queries the public OSRM driving route API to get the exact road distance (km) and travel duration (mins).
 * Falls back to Haversine-based calculation if API is offline, slow, or rate-limited.
 */
export async function fetchOSRMRoute(
  stops: Point[],
  isPickup: boolean,
  depot: Point = DEPOT
): Promise<{ distance: number; duration: number }> {
  if (stops.length === 0) {
    return { distance: 0, duration: 0 };
  }

  let coordsList: Point[] = [];
  if (isPickup) {
    coordsList = [...stops, depot];
  } else {
    coordsList = [depot, ...stops];
  }

  const coordsString = coordsList.map(p => `${p.x},${p.y}`).join(";");
  const url = `http://router.project-osrm.org/route/v1/driving/${coordsString}?overview=false`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TransitAdminPOC/1.0" }
    });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const data = await res.json();
      if (data && data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
        const durationMins = Math.round(route.duration / 60);
        return { distance: distanceKm, duration: durationMins };
      }
    }
  } catch (e) {
    console.error("OSRM Route API failed, falling back to Haversine:", e);
  }

  // Fallback calculation using Haversine
  let totalDist = 0;
  for (let i = 0; i < coordsList.length - 1; i++) {
    totalDist += getDistance(coordsList[i], coordsList[i + 1]);
  }

  const distanceKm = Math.round(totalDist * 10) / 10;
  const durationMins = Math.round(totalDist / AVG_SPEED) + (isPickup ? 10 : 0);
  return { distance: distanceKm, duration: durationMins };
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
  let centroids: Point[] = [];
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
 * 2. Brute Force Route Optimization with Safety Constraints
 * Since cluster size is small (<= 6), we can check all permutations
 * to find the absolute mathematically optimal route.
 */
export function getOptimalPermutation(
  employees: OptimizeEmployee[],
  isPickup: boolean // true = pickup (end at office), false = drop (start at office)
): OptimizeEmployee[] {
  if (employees.length <= 1) return employees;

  let bestSafeRoute: OptimizeEmployee[] = [];
  let minSafeDistance = Infinity;

  let bestUnsafeRoute: OptimizeEmployee[] = [];
  let minUnsafeDistance = Infinity;

  // Helper to generate permutations
  function permute(arr: OptimizeEmployee[], memo: OptimizeEmployee[] = []) {
    if (arr.length === 0) {
      const dist = calculateRouteDistance(memo, isPickup);
      const safe = isPermutationSafe(memo, isPickup);

      if (safe) {
        if (dist < minSafeDistance) {
          minSafeDistance = dist;
          bestSafeRoute = [...memo];
        }
      } else {
        if (dist < minUnsafeDistance) {
          minUnsafeDistance = dist;
          bestUnsafeRoute = [...memo];
        }
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

  if (bestSafeRoute.length > 0) {
    return bestSafeRoute;
  }
  return bestUnsafeRoute;
}

// Calculate the total route distance
function calculateRouteDistance(route: OptimizeEmployee[], isPickup: boolean, depot: Point = DEPOT): number {
  if (route.length === 0) return 0;
  let dist = 0;

  if (isPickup) {
    // Pickup: start at Stop_1, end at Office (depot)
    for (let i = 0; i < route.length - 1; i++) {
      dist += getDistance({ x: route[i].x, y: route[i].y }, { x: route[i + 1].x, y: route[i + 1].y });
    }
    dist += getDistance({ x: route[route.length - 1].x, y: route[route.length - 1].y }, depot);
  } else {
    // Drop: start at Office (depot), drop in order
    dist += getDistance(depot, { x: route[0].x, y: route[0].y });
    for (let i = 0; i < route.length - 1; i++) {
      dist += getDistance({ x: route[i].x, y: route[i].y }, { x: route[i + 1].x, y: route[i + 1].y });
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
  let violations = checkSafetyViolations(mockStops, isPickup, hasEscort);
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
  depot: Point = DEPOT
): Promise<OptimizedRoute[]> {
  if (employees.length === 0 || cabs.length === 0) return [];

  // Sort cabs by capacity descending to maximize employee transport
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  
  let remainingEmployees = [...employees];
  const optimizedRoutes: OptimizedRoute[] = [];

  for (let i = 0; i < sortedCabs.length; i++) {
    if (remainingEmployees.length === 0) break;
    
    const cab = sortedCabs[i];
    const capacity = cab.capacity;

    // Pick a seed employee (furthest from depot to bundle remote areas together)
    let seedIdx = 0;
    let maxDist = -1;
    for (let j = 0; j < remainingEmployees.length; j++) {
      const dist = getDistance({ x: remainingEmployees[j].x, y: remainingEmployees[j].y }, depot);
      if (dist > maxDist) {
        maxDist = dist;
        seedIdx = j;
      }
    }

    const seed = remainingEmployees[seedIdx];
    // Remove seed from remaining list
    remainingEmployees.splice(seedIdx, 1);

    // Find the closest employees to the seed to fill the cab capacity
    const cluster: OptimizeEmployee[] = [seed];
    
    while (cluster.length < capacity && remainingEmployees.length > 0) {
      let closestIdx = 0;
      let minDist = Infinity;
      for (let j = 0; j < remainingEmployees.length; j++) {
        const dist = getDistance(
          { x: remainingEmployees[j].x, y: remainingEmployees[j].y },
          { x: seed.x, y: seed.y }
        );
        if (dist < minDist) {
          minDist = dist;
          closestIdx = j;
        }
      }
      
      // Dual Mode Implementation:
      // If FASTEST_TRAVEL, do not pick up employees who are far away (e.g., > 7km) just to fill the cab.
      // Leave seats empty to ensure faster travel for the clustered group.
      if (mode === "FASTEST_TRAVEL" && minDist > 7 && cluster.length > 1) {
        break; // Stop filling cab to prevent massive detours
      }

      cluster.push(remainingEmployees[closestIdx]);
      remainingEmployees.splice(closestIdx, 1);
    }

    // Get optimal route distance-wise for this cluster
    let bestOrderedRoute = getOptimalPermutation(cluster, isPickup);

    // Apply safety correction
    let hasEscort = false; // default
    let { route: safetyCorrectedRoute } = enforceSafetyRules(
      bestOrderedRoute,
      isPickup,
      hasEscort
    );

    // Build Stops with ETAs
    let currentDistance = 0;
    const stops: OptimizedRouteStop[] = [];

    if (isPickup) {
      // Pickup route stop details: employee pickup order ➔ depot
      // Start from depot and add distance to first stop so ETA for Stop 1 is non-zero
      if (safetyCorrectedRoute.length > 0) {
        currentDistance += getDistance(depot, { x: safetyCorrectedRoute[0].x, y: safetyCorrectedRoute[0].y });
      }
      for (let j = 0; j < safetyCorrectedRoute.length; j++) {
        const emp = safetyCorrectedRoute[j];
        if (j > 0) {
          const prev = safetyCorrectedRoute[j - 1];
          currentDistance += getDistance({ x: prev.x, y: prev.y }, { x: emp.x, y: emp.y });
        }
        stops.push({
          employeeId: emp.id,
          employeeName: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
          stopOrder: j + 1,
          etaMinutes: Math.round(currentDistance / AVG_SPEED) + 10, // 10m buffer
          status: "PENDING",
        });
      }
      // Add final leg to depot
      if (safetyCorrectedRoute.length > 0) {
        const lastEmp = safetyCorrectedRoute[safetyCorrectedRoute.length - 1];
        currentDistance += getDistance({ x: lastEmp.x, y: lastEmp.y }, depot);
      }
    } else {
      // Drop route stop details: depot ➔ employee drop order
      if (safetyCorrectedRoute.length > 0) {
        currentDistance += getDistance(depot, { x: safetyCorrectedRoute[0].x, y: safetyCorrectedRoute[0].y });
      }
      for (let j = 0; j < safetyCorrectedRoute.length; j++) {
        const emp = safetyCorrectedRoute[j];
        if (j > 0) {
          const prev = safetyCorrectedRoute[j - 1];
          currentDistance += getDistance({ x: prev.x, y: prev.y }, { x: emp.x, y: emp.y });
        }
        stops.push({
          employeeId: emp.id,
          employeeName: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
          stopOrder: j + 1,
          etaMinutes: Math.round(currentDistance / AVG_SPEED),
          status: "PENDING",
        });
      }
    }

    // Check violations for reporting
    const finalViolations = checkSafetyViolations(
      stops.map((s) => ({ name: s.employeeName, gender: s.gender })),
      isPickup,
      hasEscort
    );

    // Calculate score
    const penalty = (hasEscort ? 15 : 0) + (finalViolations.length * 30);
    const score = Math.max(30, Math.round(100 - (currentDistance * 0.8) - penalty));

    optimizedRoutes.push({
      cabId: cab.id,
      vehicleNumber: cab.vehicleNumber,
      capacity: cab.capacity,
      driverName: cab.driverName,
      driverPhone: cab.driverPhone,
      stops,
      totalDistance: Math.round(currentDistance * 10) / 10,
      totalDuration: Math.round(currentDistance / AVG_SPEED) + (isPickup ? 10 : 0),
      optimizationScore: score,
      violations: finalViolations,
      hasEscort,
    });
  }

  // --- POST-PROCESSING SAFETY ADJUSTMENT ENGINE ---
  // 1. Swap unassigned females with assigned males in routes to guarantee seat priority
  let unassignedFemales = remainingEmployees.filter(e => e.gender === "FEMALE");
  for (const female of unassignedFemales) {
    let swapped = false;
    for (const route of optimizedRoutes) {
      const maleStopIdx = route.stops.findIndex(s => s.gender === "MALE");
      if (maleStopIdx !== -1) {
        const maleStop = route.stops[maleStopIdx];
        const maleEmpObj = employees.find(e => e.id === maleStop.employeeId)!;

        // Swap out male and swap in female
        route.stops[maleStopIdx] = {
          ...maleStop,
          employeeId: female.id,
          employeeName: female.name,
          gender: female.gender,
          x: female.x,
          y: female.y,
          address: female.address,
        };

        remainingEmployees = remainingEmployees.filter(e => e.id !== female.id);
        remainingEmployees.push(maleEmpObj);
        swapped = true;
        break;
      }
    }
    if (!swapped) break; // No more males available for swaps
  }

  // 2. Resolve isolated females (female alone in cab) by swapping with a male from a multi-passenger cab
  for (let r = 0; r < optimizedRoutes.length; r++) {
    const route = optimizedRoutes[r];
    if (route.stops.length === 1 && route.stops[0].gender === "FEMALE" && !route.hasEscort) {
      const isolatedStop = route.stops[0];
      const isolatedEmpObj = employees.find(e => e.id === isolatedStop.employeeId)!;
      
      let resolved = false;
      for (let pr = 0; pr < optimizedRoutes.length; pr++) {
        if (pr === r) continue;
        const partnerRoute = optimizedRoutes[pr];
        if (partnerRoute.stops.length > 1) {
          const maleIdx = partnerRoute.stops.findIndex(s => s.gender === "MALE");
          if (maleIdx !== -1) {
            const partnerMaleStop = partnerRoute.stops[maleIdx];
            const partnerMaleEmpObj = employees.find(e => e.id === partnerMaleStop.employeeId)!;
            
            // Swap female into partner route (traveling with others)
            partnerRoute.stops[maleIdx] = {
              ...partnerMaleStop,
              employeeId: isolatedEmpObj.id,
              employeeName: isolatedEmpObj.name,
              gender: isolatedEmpObj.gender,
              x: isolatedEmpObj.x,
              y: isolatedEmpObj.y,
              address: isolatedEmpObj.address,
            };
            
            // Swap male into isolated route (male traveling alone in cab is safe)
            route.stops[0] = {
              ...isolatedStop,
              employeeId: partnerMaleEmpObj.id,
              employeeName: partnerMaleEmpObj.name,
              gender: partnerMaleEmpObj.gender,
              x: partnerMaleEmpObj.x,
              y: partnerMaleEmpObj.y,
              address: partnerMaleEmpObj.address,
            };
            
            resolved = true;
            break;
          }
        }
      }
      if (resolved) {
        route.hasEscort = false;
      }
    }
  }

  // 3. Recalculate routes sequence, travel times, ETAs, and violations for all modified routes
  for (const route of optimizedRoutes) {
    // Filter out any null employees (can happen if a stop's employeeId became stale after a swap)
    const stopsEmps = route.stops
      .map(s => employees.find(e => e.id === s.employeeId))
      .filter((e): e is OptimizeEmployee => e !== undefined);
    if (stopsEmps.length === 0) continue;
    let bestOrderedRoute = getOptimalPermutation(stopsEmps, isPickup);
    
    let { route: safetyCorrectedRoute } = enforceSafetyRules(
      bestOrderedRoute,
      isPickup,
      false
    );

    let currentDistance = 0;
    const newStops: OptimizedRouteStop[] = [];

    if (isPickup) {
      for (let j = 0; j < safetyCorrectedRoute.length; j++) {
        const emp = safetyCorrectedRoute[j];
        if (j > 0) {
          const prev = safetyCorrectedRoute[j - 1];
          currentDistance += getDistance({ x: prev.x, y: prev.y }, { x: emp.x, y: emp.y });
        }
        newStops.push({
          employeeId: emp.id,
          employeeName: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
          stopOrder: j + 1,
          etaMinutes: Math.round(currentDistance / AVG_SPEED) + 10,
          status: "PENDING",
        });
      }
      if (safetyCorrectedRoute.length > 0) {
        const lastEmp = safetyCorrectedRoute[safetyCorrectedRoute.length - 1];
        currentDistance += getDistance({ x: lastEmp.x, y: lastEmp.y }, depot);
      }
    } else {
      if (safetyCorrectedRoute.length > 0) {
        currentDistance += getDistance(depot, { x: safetyCorrectedRoute[0].x, y: safetyCorrectedRoute[0].y });
      }
      for (let j = 0; j < safetyCorrectedRoute.length; j++) {
        const emp = safetyCorrectedRoute[j];
        if (j > 0) {
          const prev = safetyCorrectedRoute[j - 1];
          currentDistance += getDistance({ x: prev.x, y: prev.y }, { x: emp.x, y: emp.y });
        }
        newStops.push({
          employeeId: emp.id,
          employeeName: emp.name,
          gender: emp.gender,
          x: emp.x,
          y: emp.y,
          address: emp.address,
          stopOrder: j + 1,
          etaMinutes: Math.round(currentDistance / AVG_SPEED),
          status: "PENDING",
        });
      }
    }

    // Fetch road distance and duration (Google Maps or OSRM fallback)
    let distance = 0;
    let duration = 0;

    if (apiKey && safetyCorrectedRoute.length > 0) {
      const pointsList = [depot, ...safetyCorrectedRoute.map(e => ({ x: e.x, y: e.y }))];
      const matrixResult = await fetchGoogleMapsMatrix(pointsList, apiKey);
      const n = safetyCorrectedRoute.length;
      if (isPickup) {
        for (let j = 1; j < n; j++) {
          distance += matrixResult.distanceMatrix[j][j + 1];
          duration += matrixResult.durationMatrix[j][j + 1];
        }
        distance += matrixResult.distanceMatrix[n][0];
        duration += matrixResult.durationMatrix[n][0] + 10;
      } else {
        distance += matrixResult.distanceMatrix[0][1];
        duration += matrixResult.durationMatrix[0][1];
        for (let j = 1; j < n; j++) {
          distance += matrixResult.distanceMatrix[j][j + 1];
          duration += matrixResult.durationMatrix[j][j + 1];
        }
      }
      distance = Math.round(distance * 10) / 10;
    } else {
      const osrmResult = await fetchOSRMRoute(
        safetyCorrectedRoute.map(e => ({ x: e.x, y: e.y })),
        isPickup,
        depot
      );
      distance = osrmResult.distance;
      duration = osrmResult.duration;
    }

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
  }

  return optimizedRoutes;
}

const geocodeCache: { [key: string]: Point } = {};
let osmDisabled = false;
let osmFailedCount = 0;

export function resetOSMCircuitBreaker() {
  osmDisabled = false;
  osmFailedCount = 0;
  console.log("OSM Circuit Breaker manually reset by admin.");
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
): Promise<Point | null> {
  const cleanName = name.toLowerCase().trim();

  // Check in-memory cache first
  const cacheKey = `${cleanName}|${city}|${country}`;
  if (geocodeCache[cacheKey]) {
    return geocodeCache[cacheKey];
  }

  if (!osmDisabled) {
    // Query OpenStreetMap Nominatim with the configured city and country
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const query = encodeURIComponent(`${name}, ${city}, ${country}`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
        signal: controller.signal,
        headers: { "User-Agent": "TransitAdminPOC/1.0" },
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          const data = await res.json();
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            const point: Point = { x: lng, y: lat };

            // 70km outlier filter: skip if too far from depot
            const distFromDepot = getDistance(point, depot);
            if (distFromDepot > maxRadiusKm) {
              console.warn(
                `[OUTLIER] "${name}" resolved to (${lat}, ${lng}) which is ${distFromDepot.toFixed(1)}km from depot — exceeds ${maxRadiusKm}km limit. Skipping.`
              );
              return null;
            }

            geocodeCache[cacheKey] = point;
            return point;
          }
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error("OSM Geocoding failed:", e);
      osmFailedCount++;
      if (osmFailedCount >= 3) {
        console.warn("Disabling OSM geocoding API due to repeated failures (circuit breaker activated)");
        osmDisabled = true;
      }
    }
  }

  // Final fallback: use a slight random offset from the depot center
  // (better than a completely wrong city's coordinates)
  const fallbackPoint: Point = {
    x: Math.round((depot.x + (Math.random() - 0.5) * 0.1) * 10000) / 10000,
    y: Math.round((depot.y + (Math.random() - 0.5) * 0.1) * 10000) / 10000,
  };
  geocodeCache[cacheKey] = fallbackPoint;
  return fallbackPoint;
}

/**
 * Legacy alias kept for backward-compatibility. Prefer geocodePlace() with explicit city/country.
 * @deprecated Use geocodePlace(name, city, country, depot, maxRadiusKm) instead.
 */
export async function geocodeNagpurPlace(name: string): Promise<Point> {
  const result = await geocodePlace(name, "Nagpur", "India", DEPOT, 9999);
  return result ?? DEPOT;
}

/**
 * Fetches the pairwise distance (km) and duration (mins) matrix for a list of points from Google Maps Distance Matrix API.
 * Falls back to Haversine-based matrix if the request fails or no API Key is provided.
 */
export async function fetchGoogleMapsMatrix(
  points: Point[],
  apiKey: string
): Promise<{ distanceMatrix: number[][]; durationMatrix: number[][] }> {
  const n = points.length;
  if (n === 0) return { distanceMatrix: [], durationMatrix: [] };

  const distanceMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const durationMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  if (!apiKey) {
    // Generate fallback matrix
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = getDistance(points[i], points[j]);
        distanceMatrix[i][j] = Math.round(d * 10) / 10;
        durationMatrix[i][j] = Math.round(d / AVG_SPEED);
      }
    }
    return { distanceMatrix, durationMatrix };
  }

  try {
    const coordsStr = points.map((p) => `${p.y},${p.x}`).join("|");
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
      coordsStr
    )}&destinations=${encodeURIComponent(coordsStr)}&key=${apiKey}`;

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "OK" && data.rows) {
        for (let i = 0; i < n; i++) {
          const row = data.rows[i];
          if (!row || !row.elements) continue;
          for (let j = 0; j < n; j++) {
            const element = row.elements[j];
            if (element && element.status === "OK") {
              distanceMatrix[i][j] = Math.round((element.distance.value / 1000) * 10) / 10;
              durationMatrix[i][j] = Math.round(element.duration.value / 60);
            } else {
              const d = getDistance(points[i], points[j]);
              distanceMatrix[i][j] = Math.round(d * 10) / 10;
              durationMatrix[i][j] = Math.round(d / AVG_SPEED);
            }
          }
        }
        return { distanceMatrix, durationMatrix };
      }
    }
  } catch (e) {
    console.error("Google Maps API failed, falling back to Haversine matrix:", e);
  }

  // Final fallback
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = getDistance(points[i], points[j]);
      distanceMatrix[i][j] = Math.round(d * 10) / 10;
      durationMatrix[i][j] = Math.round(d / AVG_SPEED);
    }
  }
  return { distanceMatrix, durationMatrix };
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
  let permutations: number[][] = [];

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
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function idxFurthestFromDepot(employees: OptimizeEmployee[], depot: Point): number {
  let idx = 0, maxD = -1;
  for (let i = 0; i < employees.length; i++) {
    const d = getDistance({ x: employees[i].x, y: employees[i].y }, depot);
    if (d > maxD) { maxD = d; idx = i; }
  }
  return idx;
}

function idxNearestTo(employees: OptimizeEmployee[], ref: OptimizeEmployee): { idx: number; dist: number } {
  let idx = 0, minD = Infinity;
  for (let i = 0; i < employees.length; i++) {
    const d = getDistance({ x: employees[i].x, y: employees[i].y }, { x: ref.x, y: ref.y });
    if (d < minD) { minD = d; idx = i; }
  }
  return { idx, dist: minD };
}

type ClusterAssignment = { cab: OptimizeCab; cluster: OptimizeEmployee[] };

/**
 * Strategy 1 — MAXIMIZE_UTILIZATION
 * Greedily fills every cab to capacity. No radius limit.
 * Uses fewest cabs possible. Some employees may have longer rides.
 */
function clusterMaxUtilization(employees: OptimizeEmployee[], cabs: OptimizeCab[], depot: Point): ClusterAssignment[] {
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  let remaining = [...employees];
  const assignments: ClusterAssignment[] = [];

  for (const cab of sortedCabs) {
    if (remaining.length === 0) break;
    const seedIdx = idxFurthestFromDepot(remaining, depot);
    const seed = remaining.splice(seedIdx, 1)[0];
    const cluster: OptimizeEmployee[] = [seed];

    while (cluster.length < cab.capacity && remaining.length > 0) {
      const { idx } = idxNearestTo(remaining, seed);
      cluster.push(remaining.splice(idx, 1)[0]);
    }
    assignments.push({ cab, cluster });
  }
  return assignments;
}

/**
 * Strategy 2 — MINIMIZE_TIME
 * Keeps clusters geographically tight (10 km radius from seed).
 * Outliers seed their own separate cab — shorter rides for everyone.
 * May leave some cab seats empty.
 */
function clusterMinTime(
  employees: OptimizeEmployee[],
  cabs: OptimizeCab[],
  depot: Point,
  radiusKm: number = 10
): ClusterAssignment[] {
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  let remaining = [...employees];
  const assignments: ClusterAssignment[] = [];

  for (const cab of sortedCabs) {
    if (remaining.length === 0) break;
    const seedIdx = idxFurthestFromDepot(remaining, depot);
    const seed = remaining.splice(seedIdx, 1)[0];
    const cluster: OptimizeEmployee[] = [seed];

    while (cluster.length < cab.capacity && remaining.length > 0) {
      const { idx, dist } = idxNearestTo(remaining, seed);
      if (dist > radiusKm) break; // stop — next employee is too far away
      cluster.push(remaining.splice(idx, 1)[0]);
    }
    assignments.push({ cab, cluster });
  }
  return assignments;
}

/**
 * Strategy 3 — BALANCED
 * 15 km radius, targets ~80% fill before stopping.
 * Balances commute time vs cab utilization.
 */
function clusterBalanced(employees: OptimizeEmployee[], cabs: OptimizeCab[], depot: Point): ClusterAssignment[] {
  const RADIUS_KM = 15;
  const FILL_RATIO = 0.8;
  const sortedCabs = [...cabs].sort((a, b) => b.capacity - a.capacity);
  let remaining = [...employees];
  const assignments: ClusterAssignment[] = [];

  for (const cab of sortedCabs) {
    if (remaining.length === 0) break;
    const targetFill = Math.max(1, Math.ceil(cab.capacity * FILL_RATIO));
    const seedIdx = idxFurthestFromDepot(remaining, depot);
    const seed = remaining.splice(seedIdx, 1)[0];
    const cluster: OptimizeEmployee[] = [seed];

    while (cluster.length < cab.capacity && remaining.length > 0) {
      const { idx, dist } = idxNearestTo(remaining, seed);
      // Stop if we've hit the target fill AND the next person is too far
      if (dist > RADIUS_KM && cluster.length >= targetFill) break;
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
  depot: Point
): Promise<OptimizedRoute[]> {
  const routes: OptimizedRoute[] = [];

  for (const { cab, cluster } of assignments) {
    if (cluster.length === 0) continue;

    // Optimal stop order + safety enforcement
    let ordered = getOptimalPermutation(cluster, isPickup);
    const { route: safeRoute } = enforceSafetyRules(ordered, isPickup, false);

    // Build stops with Haversine ETAs
    let cumulativeDist = 0;
    const stops: OptimizedRouteStop[] = [];

    if (isPickup && safeRoute.length > 0) {
      cumulativeDist += getDistance(depot, { x: safeRoute[0].x, y: safeRoute[0].y });
    } else if (!isPickup && safeRoute.length > 0) {
      cumulativeDist += getDistance(depot, { x: safeRoute[0].x, y: safeRoute[0].y });
    }

    for (let j = 0; j < safeRoute.length; j++) {
      const emp = safeRoute[j];
      if (j > 0) {
        const prev = safeRoute[j - 1];
        cumulativeDist += getDistance({ x: prev.x, y: prev.y }, { x: emp.x, y: emp.y });
      }
      stops.push({
        employeeId: emp.id,
        employeeName: emp.name,
        gender: emp.gender,
        x: emp.x,
        y: emp.y,
        address: emp.address,
        stopOrder: j + 1,
        etaMinutes: Math.round(cumulativeDist / AVG_SPEED) + (isPickup ? 10 : 0),
        status: "PENDING",
      });
    }

    if (isPickup && safeRoute.length > 0) {
      const last = safeRoute[safeRoute.length - 1];
      cumulativeDist += getDistance({ x: last.x, y: last.y }, depot);
    }

    // Accurate road distance via Google Maps or OSRM
    let distance = 0, duration = 0;

    if (apiKey && safeRoute.length > 0) {
      const points = [depot, ...safeRoute.map(e => ({ x: e.x, y: e.y }))];
      const { distanceMatrix, durationMatrix } = await fetchGoogleMapsMatrix(points, apiKey);
      const n = safeRoute.length;

      if (isPickup) {
        for (let j = 1; j < n; j++) {
          distance += distanceMatrix[j][j + 1] ?? 0;
          duration += durationMatrix[j][j + 1] ?? 0;
        }
        distance += distanceMatrix[n]?.[0] ?? 0;
        duration += (durationMatrix[n]?.[0] ?? 0) + 10;
      } else {
        distance += distanceMatrix[0]?.[1] ?? 0;
        duration += durationMatrix[0]?.[1] ?? 0;
        for (let j = 1; j < n; j++) {
          distance += distanceMatrix[j][j + 1] ?? 0;
          duration += durationMatrix[j][j + 1] ?? 0;
        }
      }
    }

    // Fall back to OSRM if Google Maps gave us 0 or key was absent
    if (distance === 0) {
      const osrm = await fetchOSRMRoute(safeRoute.map(e => ({ x: e.x, y: e.y })), isPickup, depot);
      distance = osrm.distance;
      duration = osrm.duration;
    }

    const violations = checkSafetyViolations(
      stops.map(s => ({ name: s.employeeName, gender: s.gender, status: s.status })),
      isPickup,
      false
    );

    const score = Math.max(30, Math.round(100 - distance * 0.8 - violations.length * 30));

    routes.push({
      cabId: cab.id,
      vehicleNumber: cab.vehicleNumber,
      capacity: cab.capacity,
      driverName: cab.driverName || "Unassigned",
      driverPhone: cab.driverPhone || "N/A",
      stops,
      totalDistance: Math.round(distance * 10) / 10,
      totalDuration: duration || Math.round(cumulativeDist / AVG_SPEED) + (isPickup ? 10 : 0),
      optimizationScore: score,
      violations,
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
  const violations = routes.reduce((s, r) => s + r.violations.filter(v => !('resolved' in v) || !(v as any).resolved).length, 0);

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
  depot: Point = DEPOT
): Promise<AllStrategyPlans> {
  const totalCabCapacity = cabs.reduce((sum, c) => sum + c.capacity, 0);
  const capacityShortfall = Math.max(0, employees.length - totalCabCapacity);

  const [maxRoutes, minRoutes, balRoutes] = await Promise.all([
    buildRoutesFromAssignments(
      clusterMaxUtilization(employees, cabs, depot),
      employees, isPickup, apiKey, depot
    ),
    buildRoutesFromAssignments(
      clusterMinTime(employees, cabs, depot, 10),
      employees, isPickup, apiKey, depot
    ),
    buildRoutesFromAssignments(
      clusterBalanced(employees, cabs, depot),
      employees, isPickup, apiKey, depot
    ),
  ]);

  return {
    MAXIMIZE_UTILIZATION: summarisePlan(maxRoutes),
    MINIMIZE_TIME: summarisePlan(minRoutes),
    BALANCED: summarisePlan(balRoutes),
    capacityShortfall,
    totalCabCapacity,
    totalEmployees: employees.length,
  };
}

