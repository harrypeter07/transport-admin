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
  status: "PENDING" | "PICKED_UP" | "MISSED" | "COMPLETED";
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

// Fixed Corporate Depot Location (MIHAN, Nagpur) - Real coordinates
export const DEPOT: Point = { x: 79.0526, y: 21.0625 };

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
  isPickup: boolean
): Promise<{ distance: number; duration: number }> {
  if (stops.length === 0) {
    return { distance: 0, duration: 0 };
  }

  let coordsList: Point[] = [];
  if (isPickup) {
    coordsList = [...stops, DEPOT];
  } else {
    coordsList = [DEPOT, ...stops];
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
function calculateRouteDistance(route: OptimizeEmployee[], isPickup: boolean): number {
  if (route.length === 0) return 0;
  let dist = 0;

  if (isPickup) {
    // Pickup: start at Stop_1, end at Office (DEPOT)
    for (let i = 0; i < route.length - 1; i++) {
      dist += getDistance({ x: route[i].x, y: route[i].y }, { x: route[i + 1].x, y: route[i + 1].y });
    }
    dist += getDistance({ x: route[route.length - 1].x, y: route[route.length - 1].y }, DEPOT);
  } else {
    // Drop: start at Office (DEPOT), drop in order
    dist += getDistance(DEPOT, { x: route[0].x, y: route[0].y });
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
  stops: { gender: "MALE" | "FEMALE"; name: string }[],
  isPickup: boolean,
  hasEscort: boolean
): { type: "FEMALE_FIRST_PICKUP" | "FEMALE_LAST_DROP" | "ISOLATED_FEMALE"; severity: "HIGH" | "MEDIUM"; notes: string }[] {
  if (stops.length === 0 || hasEscort) return [];
  const violations: ReturnType<typeof checkSafetyViolations> = [];

  if (isPickup) {
    // First pickup check
    if (stops[0].gender === "FEMALE") {
      // If there are other passengers, she is alone with driver at start
      if (stops.length > 1) {
        violations.push({
          type: "FEMALE_FIRST_PICKUP",
          severity: "HIGH",
          notes: `${stops[0].name} (female) is scheduled as the first pickup. No escort is present, making her alone in the cab.`,
        });
      } else {
        // Only 1 passenger and she is female
        violations.push({
          type: "ISOLATED_FEMALE",
          severity: "HIGH",
          notes: `${stops[0].name} is the sole passenger and is female. Escort required.`,
        });
      }
    }
  } else {
    // Last drop check
    const lastIdx = stops.length - 1;
    if (stops[lastIdx].gender === "FEMALE") {
      if (stops.length > 1) {
        violations.push({
          type: "FEMALE_LAST_DROP",
          severity: "HIGH",
          notes: `${stops[lastIdx].name} (female) is scheduled as the last drop. No escort is present, leaving her alone with driver.`,
        });
      } else {
        violations.push({
          type: "ISOLATED_FEMALE",
          severity: "HIGH",
          notes: `${stops[lastIdx].name} is the sole passenger and is female. Escort required.`,
        });
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
  isPickup: boolean = true
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

    // Pick a seed employee (furthest from DEPOT to bundle remote areas together)
    let seedIdx = 0;
    let maxDist = -1;
    for (let j = 0; j < remainingEmployees.length; j++) {
      const dist = getDistance({ x: remainingEmployees[j].x, y: remainingEmployees[j].y }, DEPOT);
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
      // Pickup route stop details: employee pickup order ➔ DEPOT
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
        currentDistance += getDistance({ x: lastEmp.x, y: lastEmp.y }, DEPOT);
      }
    } else {
      // Drop route stop details: DEPOT ➔ employee drop order
      if (safetyCorrectedRoute.length > 0) {
        currentDistance += getDistance(DEPOT, { x: safetyCorrectedRoute[0].x, y: safetyCorrectedRoute[0].y });
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
    const stopsEmps = route.stops.map(s => employees.find(e => e.id === s.employeeId)!);
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
        currentDistance += getDistance({ x: lastEmp.x, y: lastEmp.y }, DEPOT);
      }
    } else {
      if (safetyCorrectedRoute.length > 0) {
        currentDistance += getDistance(DEPOT, { x: safetyCorrectedRoute[0].x, y: safetyCorrectedRoute[0].y });
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

    // Fetch actual OSRM road distance and duration
    const osrmResult = await fetchOSRMRoute(
      safetyCorrectedRoute.map(e => ({ x: e.x, y: e.y })),
      isPickup
    );

    const finalViolations = checkSafetyViolations(
      newStops.map((s) => ({ name: s.employeeName, gender: s.gender })),
      isPickup,
      route.hasEscort
    );

    const penalty = (route.hasEscort ? 15 : 0) + (finalViolations.length * 30);
    const score = Math.max(30, Math.round(100 - (osrmResult.distance * 0.8) - penalty));

    route.stops = newStops;
    route.totalDistance = osrmResult.distance;
    route.totalDuration = osrmResult.duration;
    route.optimizationScore = score;
    route.violations = finalViolations;
  }

  return optimizedRoutes;
}

export const NAGPUR_PLACES: { [key: string]: Point } = {
  "mihan": { x: 79.0526, y: 21.0625 },
  "manish nagar": { x: 79.0832, y: 21.0945 },
  "wardha road": { x: 79.0712, y: 21.0822 },
  "besa": { x: 79.1121, y: 21.0872 },
  "pratap nagar": { x: 79.0560, y: 21.1189 },
  "dharampeth": { x: 79.0612, y: 21.1432 },
  "sitabuldi": { x: 79.0880, y: 21.1444 },
  "sadar": { x: 79.0805, y: 21.1611 },
  "nandanvan": { x: 79.1220, y: 21.1340 },
  "dhantoli": { x: 79.0822, y: 21.1232 },
  "ramdaspeth": { x: 79.0778, y: 21.1325 },
  "shankar nagar": { x: 79.0655, y: 21.1278 },
  "khamla": { x: 79.0650, y: 21.1012 },
  "trimurti nagar": { x: 79.0535, y: 21.1125 },
  "sonegaon": { x: 79.0588, y: 21.0845 },
  "koradi": { x: 79.0985, y: 21.2385 },
  "mankapur": { x: 79.0755, y: 21.1925 },
  "mahal": { x: 79.1112, y: 21.1415 },
  "gandhibagh": { x: 79.1085, y: 21.1525 },
};

/**
 * Geocodes a Nagpur place name to a Point (x, y) in real-world coordinates.
 * Checks local cache first, then calls Nominatim API if connected.
 */
export async function geocodeNagpurPlace(name: string): Promise<Point> {
  const cleanName = name.toLowerCase().replace(/nagpur/gi, "").trim();
  
  // Check local cache
  if (NAGPUR_PLACES[cleanName]) {
    return NAGPUR_PLACES[cleanName];
  }
  
  // Try partial matching in cache
  for (const key of Object.keys(NAGPUR_PLACES)) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      return NAGPUR_PLACES[key];
    }
  }

  // Fallback: Query OpenStreetMap Nominatim
  try {
    const query = encodeURIComponent(`${name}, Nagpur, Maharashtra, India`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: { "User-Agent": "TransitAdminPOC/1.0" },
    });
    const data = await res.json();
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      return { x: lng, y: lat };
    }
  } catch (e) {
    console.error("OSM Geocoding failed:", e);
  }

  // Final fallback: random coordinates in Nagpur sector bounds (lng 79.00-79.16, lat 21.04-21.19)
  return {
    x: Math.round((79.00 + Math.random() * 0.16) * 10000) / 10000,
    y: Math.round((21.04 + Math.random() * 0.15) * 10000) / 10000,
  };
}
