# Audit: Driver-to-Passenger Geographic Assignment Review

## 1. EXECUTIVE SUMMARY

The system produces **valid routes** that respect capacity, shift, and safety constraints, but **driver home location plays no role in assignment**. Employees are clustered by proximity to one another, and cabs are assigned sequentially by capacity (largest first). A driver living near employee A may be assigned employee B who is on the other side of the city, simply because B's cluster was assigned to the next available cab in the capacity-sorted list.

**Root cause:** The clustering and assignment algorithms treat cabs as interchangeable containers with a capacity. Driver home coordinates (`cab.driverX`/`driverY`) are only used to compute route metrics after assignment — they never influence *which* employees go to *which* cab.

---

## 2. ASSIGNMENT FLOW TRACE

| Step | Input | Output | Location Data Usage |
|------|-------|--------|-------------------|
| **Employee retrieval** | `shiftId`, `date` | List of active (not on leave) employees filtered by shift | Employee `x`/`y` coordinates loaded from DB |
| **Cab retrieval** | `shiftId`, `date` | List of available cabs filtered by shift | Cab `driverX`/`driverY` loaded; used for startPoint calculation |
| **Start point resolution** | Cab's previous routes + driver home | `startPoint` for each cab | `tripSequence === 1` → driver home; else → depot |
| **Distance matrix** | All cab start points + all employees + depot | N×N road distance/duration matrix (OSRM → Haversine fallback) | ALL points included in one global matrix |
| **Clustering** | Employees + capacities | Groups of employees (≤ capacity) | **Employee-to-employee distances only** |
| **Cab assignment** | Clusters + cabs (sorted by capacity desc) | Cluster → cab binding | **No driver location considered** for binding |
| **Route ordering** | Cluster + startPoint + depot | Optimal stop sequence (brute-force ≤7, greedy >7) | Uses full matrix including startPoint |
| **Safety enforcement** | Ordered route | Safety-corrected stop sequence | Gender-based, not location-based |
| **Constraint verification** | Route + constraints | Pass/fail with distance/duration | Uses startPoint → stops → depot |
| **Redistribution** | Unassigned employees + existing routes | Employees added to routes with space | Centroid check: employee must be within 1.5× radius of route centroid |
| **Guaranteed seat pass** | Remaining unassigned | Force-assigned ignoring all constraints | No geographic filter |

---

## 3. DRIVER ASSIGNMENT FINDINGS

### Where employees become assigned to specific drivers

**Primary path** — `src/lib/optimization.ts:708-855` (`optimizeRoutes` function):

```typescript
for (let i = 0; i < sortedCabs.length; i++) {
    const cab = sortedCabs[i];           // next cab (capacity-descending)
    // ... build cluster from ALL remaining employees ...
    // ... no consideration of cab's driver location ...
    optimizedRoutes.push({ cabId: cab.id, ... });
}
```

Cabs are iterated in capacity-descending order. Each gets the "next available" cluster. **The same cluster would go to a different cab if cab order changed.**

**Multi-strategy path** — `src/lib/optimization.ts:2392-2405`:

```typescript
// clusterMaxUtilization builds clusters from employees only
// Then buildRoutesFromAssignments binds clusters to cabs (also no driver location check)
```

### Key Finding: Assignment is NOT proximity-based

| Criteria | Is it used? | Details |
|----------|-----------|---------|
| Proximity to driver home | **NO** | Driver home not referenced in any clustering or assignment function |
| Capacity | **YES** | Primary sort: cabs sorted by capacity desc |
| Employee-to-employee proximity | **YES** | Clusters built by nearest-neighbor to seed |
| Route optimization | **YES** | After assignment, stop sequence is optimized |
| Random/first-fit | **NO** | Deterministic — first-fit to capacity-sorted cabs |
| Clustering influences | **YES** | But only employee-employee, not driver-employee |

---

## 4. DRIVER HOME LOCATION ANALYSIS

### Where driver home IS used:

1. **`src/app/api/optimization/route.ts:127-132`** — Start point resolution
   ```typescript
   if (tripSequence === 1) {
       if (typeof cab.driverX === "number" && typeof cab.driverY === "number") {
           startPoint = { x: cab.driverX, y: cab.driverY };
       } else { startPoint = depot; }
   }
   ```
   **Impact:** Sets `startPoint` for route distance calculations. Correctly used.

2. **`src/lib/optimization.ts:683-694`** — Global matrix includes cab start points
   ```typescript
   const globalPoints: Point[] = [
       ...sortedCabs.map(c => c.startPoint || depot),  // driver homes included
       ...employees,
       depot,
   ];
   ```
   **Impact:** Distance from driver home to every employee IS computed in the matrix. But it's never queried for assignment decisions.

3. **`src/lib/optimization.ts:780-791`** — Sub-matrix extraction includes cab start point
   **Impact:** Route verification and ETA computation include driver start. But this is *after* assignment is locked.

4. **`src/lib/vehicleState.ts:83-113`** — `resolveCabOriginFromSnapshot`
   **Impact:** Used during execution (real-time), not during optimization.

### Where driver home should be used but IS NOT:

**PRIMARY CRITICAL GAP — `optimizeRoutes()` line 708-772:**

The cluster-building loop starts with a seed (furthest-from-depot employee) then adds remaining employees nearest to the seed. **The cab's `startPoint` is never referenced** — not to select the seed, not to filter candidates, not to score assignments.

```typescript
// Line 715-716: seed is employee furthest from depot (not closest to driver!)
let seedIdx = 0;
let maxDist = -1;
for (let j = 0; j < remainingEmployees.length; j++) {
    const dist = globalDist[gIdx][depotGlobalIdx];  // ← depot distance, NOT driver distance
    if (dist > maxDist) { maxDist = dist; seedIdx = j; }
}
```

**SECONDARY GAP — cluster strategies in `optimizeAllStrategies()` lines 1880-2021:**

`clusterMaxUtilization`, `clusterMinTime`, `clusterBalanced` all use `idxFurthestFromDepot()` for seed selection and `idxNearestTo()` which measures employee-to-employee distance. None reference cab start points.

**CONSEQUENCE:** A driver living in the south of the city can be assigned employees clustered in the north, because clustering is purely employee-employee proximity. The driver then drives across the entire city to start the route.

---

## 5. SHIFT ISOLATION VERIFICATION

### Confirmed: Shift isolation is correct.

**`src/app/api/optimization/route.ts:61-99`:**

```typescript
// Employees filtered by shiftId
const dbEmployees = await prisma.employee.findMany({
    where: { status: "ACTIVE", ...(shiftId ? { shiftId } : {}) },
});

// Cabs filtered by shiftId (via many-to-many relation)
const dbCabs = await prisma.cab.findMany({
    where: { status: "AVAILABLE", shifts: { some: { id: fallbackShiftId } } },
});
```

**No code path was found** that compares employees and drivers from different shifts. The `fallbackShiftId` is derived from employees' actual shift assignments, ensuring they match.

The only caveat: if an employee has no shift assigned (`shiftId` is null), they use the `fallbackShiftId` from the first available employee, which could theoretically cause a mismatch if employees have inconsistent shift assignments.

---

## 6. OPTIMIZATION OBJECTIVE REVIEW

### What is the routing engine actually optimizing?

| Objective | Code location | Weight |
|-----------|--------------|--------|
| **Total route distance** | `optimizationScore = 100 - (totalDistance × 0.8)` (line 829) | Primary (0.8) |
| **Safety violations** | `penalty = violations × 30` (line 828) | Secondary (30pts per violation) |
| **Escort presence** | `penalty = 15` (line 828) | Minor |

### The optimization score is computed PER ROUTE after assignment is locked.

**Consequence:** The scoring function cannot correct bad driver-employee matching — it only optimizes the stop order within the already-assigned cluster.

**Example:** If a cab is assigned employees spread across the city (because clustering was done without driver location), the router will find the optimal permutation of those stops, but the total distance will still be high, and the score correspondingly low. The low score is a *symptom* of the bad assignment, but the system does not use the score to re-assign.

### For multi-strategy preview (`getRouteVariations` lines 1689-1737):
- **DISTANCE**: Minimizes total travel distance
- **TIME**: Minimizes total travel duration
- **BALANCED**: distance + duration × 0.5
- **NORMAL**: Alphabetical order (baseline for comparison)

These variations only change **stop ordering**, not **which employees go to which cab**.

---

## 7. CLUSTER QUALITY REVIEW

### Clustering methods:

| Method | Location | Description |
|--------|----------|-------------|
| `clusterEmployees()` | Line 278 | K-means++ initialization + greedy capacity-constrained assignment + centroid refinement. Used by `optimizeRoutes()` only. |
| `clusterMaxUtilization()` | Line 1880 | Seed = furthest from depot. Greedy nearest-neighbor fill. No radius limit. |
| `clusterMinTime()` | Line 1917 | Seed = furthest from depot. Scans all remaining, picks within 20-min duration radius. |
| `clusterBalanced()` | Line 1972 | Seed = furthest from depot. 30-min radius. Stops at 80% fill if remaining candidates exceed 30 min. |

### Distance metrics:
- Road distance/duration from OSRM Table API (primary)
- Haversine × 1.3 road-circuity factor (fallback)

### Critical finding: Driver locations DO NOT influence cluster formation.

All cluster functions:
1. Sort cabs by capacity descending
2. For each cab, pick the furthest-from-depot employee as seed
3. Grow cluster by nearest-distance among remaining employees

**There is no mechanism to favor putting employees near a specific driver into that driver's cab.**

### Edge case: `optimizeRoutes()` line 735-772

Within the main optimization, the cluster grows by finding employees nearest to the seed. The `mustTakeToAvoidLeavingBehind` logic (line 760) can cause mode guardrails to be bypassed, potentially creating clusters that violate the strategy's intent:

```typescript
const mustTakeToAvoidLeavingBehind = remainingEmployees.length > subsequentCapacity;
```

This means if there are more remaining employees than future cab capacity, radius/duration limits are lifted, potentially clustering distant employees together.

---

## 8. ROUTE SCORING REVIEW

### Score formula (line 829):
```
score = max(30, 100 - (totalDistance × 0.8) - (violations × 30) - (escort ? 15 : 0))
```

### Does the score include?

| Factor | Included? | Detail |
|--------|-----------|--------|
| Driver home → first passenger | **YES** | Via `computeRouteMetrics` which uses `startPoint` → first stop |
| Driver home → cluster centroid | **NO** | No centroid score is computed |
| Driver home → assigned employee distance | **NO** | Only total route distance is scored, not individual driver-employee pairs |

### Consequence:
Two drivers could have their clusters swapped, and the scores would not necessarily reflect which assignment is better (because total route distance includes the driver's start position, but switching drivers changes start positions). The score does **not** independently measure how well-matched each driver is to their cluster.

---

## 9. CONCRETE EXAMPLES OF INEFFICIENCY

### Scenario:
- **Driver A**: lives at coordinates `(79.0, 21.0)` — southeast of city center
- **Driver B**: lives at coordinates `(79.2, 21.3)` — northeast of city center
- **Employee P**: lives at `(78.9, 21.1)` — near Driver A
- **Employee Q**: lives at `(79.3, 21.4)` — near Driver B
- Both cabs have capacity 4

**Current behavior:**
1. Clustering groups employee P with other employees near `(79.0, 21.0)` and employee Q with others near `(79.3, 21.4)` — this part is fine.
2. Cabs sorted by capacity (equal). First cab (Driver A) gets cluster P; second cab (Driver B) gets cluster Q.
3. **Result: reasonable assignment.** This case works because clusters formed around employee geography, and cabs happened to match.

**But swap the cluster assignment or change capacity ordering:**
1. If Driver A's cab had capacity 3 instead of 4, and Driver B had capacity 4...
2. Both clusters get built the same way.
3. First cab (Driver B, capacity 4) gets cluster P — Driver B now drives from northeast to southeast.
4. Second cab (Driver A, capacity 3) gets cluster Q — Driver A now drives from southeast to northeast.

**Result: Both drivers cross the city. Total deadhead distance = 2 × ~25km = 50km wasted.**

### This is not hypothetical — it is a mathematical consequence of the algorithm.

---

## 10. RECOMMENDATIONS

### CRITICAL ISSUES

#### C1: Driver home location absent from assignment decision

- **Root Cause:** All clustering algorithms (`clusterEmployees`, `clusterMaxUtilization`, `clusterMinTime`, `clusterBalanced`) and the main `optimizeRoutes()` function assign employees to cabs based purely on employee-employee proximity and capacity order. Driver start point is not consulted.
- **Code Location:** `src/lib/optimization.ts:708-772` (primary), `src/lib/optimization.ts:1880-2021` (strategy clusters)
- **Proposed Fix:** After building employee clusters, score each cluster against each available cab using `getDistance(cab.startPoint, cluster.centroid)`. Assign the closest cab to each cluster (subject to capacity). This is a **minimum-weight bipartite matching** problem (clusters → cabs). For small numbers (≤20 cabs), brute-force or Hungarian algorithm solves it.
- **Expected Impact:** Eliminates cross-city deadhead. Each driver picks up employees nearest to their home.
- **Risk:** Low. This is a post-clustering matching step that does not change cluster composition.

#### C2: Seed selection ignores driver home

- **Root Cause:** Seed employee for cluster building is always "furthest from depot" (`idxFurthestFromDepot`). There is no consideration that the first cab should start building its cluster near *its* driver.
- **Code Location:** `src/lib/optimization.ts:716-726`, `idxFurthestFromDepot` at line 1841
- **Proposed Fix:** For the first cab, select seed as the employee nearest to `cab.startPoint` rather than furthest from depot. This grounds each cab's cluster around its driver's home.
- **Expected Impact:** Clusters naturally form near each driver's starting location.
- **Risk:** Medium for first cab, low for subsequent cabs. Need to ensure the furthest-from-depot employees are still covered (they would be picked up by later cabs or redistribution passes).

---

### MEDIUM PRIORITY ISSUES

#### M1: Redistribution does not check driver proximity

- **Root Cause:** In the redistribution pass (lines 860-938), unassigned employees are added to routes based on centroid proximity and spare capacity. Driver start point is not considered — only employee centroids.
- **Code Location:** `src/lib/optimization.ts:893-899`
- **Proposed Fix:** Add `getDistance(emp, route.startPoint || depot) ≤ maxClusterRadiusKm` as an additional filter.
- **Expected Impact:** Prevents redistribution from assigning an employee to a cab that starts far away.
- **Risk:** Low. This is an additional filter that only rejects inappropriate assignments.

#### M2: Safety-driven female swapping ignores driver proximity

- **Root Cause:** The post-processing safety adjustment (lines 1093-1166) swaps females into routes based on seed-stop proximity, not driver location.
- **Code Location:** `src/lib/optimization.ts:1101`
- **Proposed Fix:** When swapping, verify the female is also within radius of the route's `startPoint`.
- **Expected Impact:** Prevents safety swaps from creating geographically poor assignments.
- **Risk:** Low.

---

### LOW PRIORITY ISSUES

#### L1: Optimization score should include driver-match quality

- **Root Cause:** Score only penalizes total route distance. A route where the driver crosses town to reach the first stop scores the same as one where the driver starts near the cluster — if total distances happen to be equal.
- **Code Location:** `src/lib/optimization.ts:829`
- **Proposed Fix:** Add a `deadheadKm` component (distance from driver home to centroid) to the score penalty.
- **Expected Impact:** Makes inefficient driver-cluster matches more visible in the admin preview UI.
- **Risk:** Very low.

#### L2: Multi-strategy preview could compare driver-home fit

- **Root Cause:** The strategy summary (`summarisePlan` line 2322) does not include average driver-deadhead distance.
- **Code Location:** `src/lib/optimization.ts:2322-2342`
- **Proposed Fix:** Add `avgDeadheadKm` to `StrategyPlan` for admin comparison.
- **Expected Impact:** Admins can see which strategy minimizes driver travel to first employee.
- **Risk:** Very low.

---

## RECOMMENDED IMPLEMENTATION ORDER

| Order | Issue | Effort | Impact | Risk |
|-------|-------|--------|--------|------|
| 1 | **C2** — Seed by driver proximity | ~20 lines | High (grounds each cab near its driver) | Medium |
| 2 | **C1** — Post-clustering cab matching | ~50 lines | High (eliminates cross-city deadhead) | Low |
| 3 | **M1** — Redistribution driver check | ~5 lines | Medium | Low |
| 4 | **M2** — Safety swap driver check | ~5 lines | Medium | Low |
| 5 | **L1** — Score deadhead component | ~10 lines | Low (visibility only) | Very low |
| 6 | **L2** — Strategy plan deadhead metric | ~10 lines | Low (visibility only) | Very low |

---

## Files Referenced

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/optimization.ts` | 2417 | Core optimization engine — clustering, routing, safety |
| `src/app/api/optimization/route.ts` | 413 | API handler — input fetching, persistence |
| `prisma/schema.prisma` | 263 | Data model — Employee (x/y), Cab (driverX/driverY) |
| `src/lib/vehicleState.ts` | 113 | Cab origin resolution for execution phase |
| `src/lib/maps/osrm.ts` | 65 | OSRM Table API for distance/duration matrix |
| `src/lib/maps/provider.ts` | 208 | Maps provider abstraction |
