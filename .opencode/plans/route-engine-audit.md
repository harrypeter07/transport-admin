# Route Generation Engine — Complete Technical Audit

> Generated: June 2026  
> Scope: Full end-to-end trace of how routes are generated, optimized, assigned, and stored.

---

## 1. End-to-End Flow

### 1.1 User clicks "Generate Routes" (Preview)

```
UI (page.tsx)                    Store                          API                          Optimization Engine
                              useTransportStore
"Optimize Routing" button  →   handleGeneratePlans()
                                ├─ fetchInitialData()         GET /api/employees
                                │                             GET /api/cabs
                                │                             GET /api/shifts
                                │                             GET /api/optimization?date=
                                │
                                └─ previewOptimization()
                                   for each shift:
                                     POST /api/optimization        fetchOptimizationInputs()
                                     { shiftId, mode: "ALL",        ├─ prisma.employee.findMany
                                       tripSequence: idx+1 }        ├─ filter APPROVED leaves
                                                                     └─ prisma.cab.findMany

                                                                     optimizeAllStrategies()
                                                                     ├─ fetchGoogleMapsMatrix()
                                                                     ├─ clusterMaxUtilization()
                                                                     ├─ clusterMinTime()
                                                                     └─ clusterBalanced()

                                                                     buildRoutesFromAssignments()
                                                                     ├─ matchCabsToClusters()
                                                                     ├─ getOptimalPermutation()
                                                                     ├─ enforceSafetyRules()
                                                                     ├─ verifyRouteConstraints()
                                                                     ├─ CONSOLIDATION PASS
                                                                     └─ REDISTRIBUTION PASS

                                     return { preview: plans }   mergeOptimizationPlans()
                                                                  store → optimizationPlans
```

### 1.2 User clicks "Apply Plan" (Persistence)

```
UI                            Store                          API
                              useTransportStore
"Apply Plan" button  →       applyOptimizationPlan()
                               ├─ maps preview routes
                               └─ POST /api/optimization         persistPreviewRoutes()
                                  { mode: "APPLY",                ├─ Route.deleteMany (old)
                                    selectedStrategy,             ├─ Route.createMany
                                    previewRoutes }               ├─ RouteStop.createMany
                                                                   └─ Violation.createMany

                                  GET /api/optimization?date=  ← refresh
                                  store → routes
```

### Key Functions & Files

| Function | File | Line | Purpose |
|----------|------|------|---------|
| `handleGeneratePlans()` | `page.tsx` | 265 | Entry point for preview |
| `previewOptimization()` | `useTransportStore.ts` | 287 | Loops over shifts, calls API per shift |
| `POST /api/optimization` | `route.ts` | 346 | Orchestrator — routes to ALL, APPLY, or single-mode |
| `fetchOptimizationInputs()` | `route.ts` | 61 | Loads employees + cabs from DB, computes startPoints |
| `optimizeAllStrategies()` | `optimization.ts` | 2533 | Runs all 3 strategies in parallel |
| `optimizeRoutes()` | `optimization.ts` | 669 | Single-strategy engine (single-shift path) |
| `buildRoutesFromAssignments()` | `optimization.ts` | 2203 | Converts clusters to validated routes |
| `persistPreviewRoutes()` | `route.ts` | 227 | Bulk-inserts all preview routes across shifts |
| `persistRoutes()` | `route.ts` | 158 | Transactional single-shift persist |

---

## 2. Data Sources

### Employee (`prisma/schema.prisma:60`)
- **Purpose**: Passengers who need to be picked up/dropped off
- **Key fields**: `id`, `name`, `gender`, `phone`, `address`, `x`, `y` (coordinates), `shiftId`, `designation`, `status` (ACTIVE/INACTIVE)
- **Routing role**: Source of passenger demand. Filtered by `status: "ACTIVE"` and `shiftId`.
- **Leave exclusion**: Employees with APPROVED leave covering the target date are excluded (`route.ts:82`).

### Cab (`prisma/schema.prisma:40`)
- **Purpose**: Vehicle + driver unit that services routes
- **Key fields**: `id`, `vehicleNumber`, `capacity` (seats), `vendor`, `status`, `driverName`, `driverPhone`, `driverX`, `driverY` (home coords), `userId`
- **Routing role**: Resource units. Filtered by `status: "AVAILABLE"` and shift association (many-to-many via `shifts`).
- **Capacity**: Directly constrains cluster size — a cab cannot receive more stops than `capacity`.

### Shift (`prisma/schema.prisma:30`)
- **Purpose**: Time-block grouping (e.g., morning/evening)
- **Key fields**: `id`, `name`, `startTime`, `endTime`
- **Relations**: One-to-many with Employee (`shiftId` FK). Many-to-many with Cab.
- **Processing**: Shifts are iterated in `startTime ASC` order. Each shift generates its own set of routes.

### Route (`prisma/schema.prisma:86`)
- **Purpose**: Optimized journey from start point through stops to depot (or reverse)
- **Key fields**: `cabId`, `date`, `shiftId`, `isPickup`, `totalDistance`, `totalDuration`, `status`, `tripSequence`, `routeNumber`, `optimizationScore`
- **Statuses**: PENDING → ASSIGNED → IN_PROGRESS → COMPLETED/CANCELLED

### RouteStop (`prisma/schema.prisma:114`)
- **Purpose**: Individual employee stop within a route
- **Key fields**: `routeId`, `employeeId`, `stopOrder` (1-indexed), `etaMinutes`, `status`

### Violation (`prisma/schema.prisma:131`)
- **Types**: `FEMALE_FIRST_PICKUP`, `FEMALE_LAST_DROP`, `ISOLATED_FEMALE`, `OVERCAPACITY`
- **Routing role**: Post-hoc safety checks flagged without blocking route creation.

### Depot (from `SystemSettings`)
- Default: `lat=21.0625, lng=79.0526` ("MIHAN Depot", Nagpur)
- Used as end-point for pickups, start-point for drops (shift 1), and start-point for shift 2+.

### Constraints (from `SystemSettings`)
- `maxRouteDistanceKm` (45), `maxRouteDurationMin` (90), `maxClusterRadiusKm` (15), `maxEmployeeDetourKm` (10)

---

## 3. Shift Processing

### 3.1 Shift Filtering

`fetchOptimizationInputs()` (`route.ts:62`):
- **Employees**: `status: "ACTIVE"` + matching `shiftId`, excludes APPROVED leaves
- **Cabs**: `status: "AVAILABLE"` + associated to shift via `shifts: { some: { id } }`

### 3.2 Shift Isolation

Each shift gets its own API call. The store iterates shifts (`useTransportStore.ts:296`):
```
for shiftIdx, shift in shifts:
  POST /api/optimization { shiftId: shift.id, mode: "ALL", tripSequence: shiftIdx + 1 }
  previews.push(tagPreviewRoutes(data.preview, shift))
```

Results are tagged with `shiftId` and `shift`, then merged via `mergeOptimizationPlans()`.

### 3.3 Shift Ordering

Shifts processed in order from `GET /api/shifts` (ordered by `startTime ASC`). `tripSequence` = 1-based index in this order.

### 3.4 Multi-Shift Behavior

**Key rule**:
- Shift index 0 → `tripSequence=1` → `startPoint = driver home`
- Shift index 1+ → `tripSequence=2+` → `startPoint = depot`

Enforced in `fetchOptimizationInputs()` (`route.ts:118-139`):
```
if forceTripSequence:
  tripSequence = forceTripSequence
else:
  prevRoutes = cab.routes (excluding current shift, sorted by tripSequence)
  tripSequence = prevRoutes.length + 1

if tripSequence == 1: startPoint = driver home (or depot if coords missing)
else: startPoint = depot
```

### Example: 3 Shifts
```
Shift A (08:00): tripSequence=1 → driver's home ✓
Shift B (14:00): tripSequence=2 → depot ✓
Shift C (20:00): tripSequence=3 → depot ✓
```

---

## 4. Driver Assignment Logic

### 4.1 Driver Selection

Cabs queried with `status: "AVAILABLE"` and associated to shift. No separate driver entity — driver data is embedded in Cab.

### 4.2 Cab-Cluster Matching

After clustering, `matchCabsToClusters()` (`optimization.ts:2141`):
1. Compute centroid of each cluster (avg x,y of employees)
2. Build cost matrix: `distance(cab.startPoint, cluster.centroid)`
3. Process clusters largest-first, each picks closest unmatched cab
4. Capacity must fit (`cab.capacity >= cluster.length`)
5. Cluster composition is unchanged — only cab assignment changes

### 4.3 Driver Home Usage

Driver home (`cab.driverX`, `cab.driverY`) is used ONLY as `startPoint` when `tripSequence === 1`. For all subsequent shifts, `startPoint = depot`.

### 4.4 Capacity Affects Assignment

- Cabs sorted by `capacity DESC` before clustering
- Each cluster is hard-capped at `cab.capacity` (`optimization.ts:2226`)
- "Must take to avoid leaving behind" guard (`optimization.ts:773`): if remaining employees > remaining capacity, radius/duration guardrails are loosened

---

## 5. Employee Assignment Logic

### 5.1 Employee Entry

All shift-matching ACTIVE employees loaded, leaves filtered out. Enter the clustering pipeline as `remainingEmployees`.

### 5.2 Clustering Flow (`optimizeRoutes()`, `optimization.ts:669`)

```
remainingEmployees = [...allEmployees]
for each cab (sorted by capacity DESC):
  seed = furthest from depot by road distance
  remove seed from remaining
  grow cluster: greedily add nearest-by-road-distance members
    until capacity OR no more candidates within constraints
  store { cab, cluster }
```

In `buildRoutesFromAssignments()` (`optimization.ts:2203`):
```
for each { cab, cluster }:
  cap at cab.capacity
  find optimal permutation
  enforce safety rules
  verify constraints
  if fails: shed furthest employee, retry
  build route with stops, metrics, violations
```

### 5.3 Pickup Order

For ≤7 employees: brute-force ALL permutations, pick shortest safe one (first stop MALE).
For ≥8 employees: greedy nearest-neighbor starting from furthest-from-depot, then safety-correct.

### 5.4 Drop Order

Same function handles both. For drops: route starts at depot, visits all stops. Safety rule: last stop must be MALE.

---

## 6. Clustering Logic

### Common Pattern
All three strategies: sort cabs by capacity DESC, pick furthest-from-depot seed, grow cluster, call `matchCabsToClusters()`.

### clusterMaxUtilization() (`optimization.ts:1995`)
| Property | Value |
|----------|-------|
| Radius | `maxClusterRadiusKm` (15km) |
| Duration | None |
| Fill | 100% |
| Growth | Distance-to-seed only |
| Best for | Minimizing cab count |

### clusterMinTime() (`optimization.ts:2031`)
| Property | Value |
|----------|-------|
| Radius | `maxClusterRadiusKm` (15km) |
| Duration | 20 min road duration from seed |
| Fill | As many as fit |
| Growth | Duration-sorted from seed |
| Best for | Minimizing commute time |

### clusterBalanced() (`optimization.ts:2085`)
| Property | Value |
|----------|-------|
| Radius | `maxClusterRadiusKm` (15km) |
| Duration | 30 min (early-stop threshold) |
| Fill | 80% target |
| Growth | Distance-sorted from seed |
| Best for | Trade-off |

### Cluster Size Limit
All strategies hard-cap at `cab.capacity`. Downstream `buildRoutesFromAssignments()` also caps at line 2226.

---

## 7. Route Optimization Logic

### 7.1 Route Score
```
score = max(30, 100 - (distance × 0.8) - (violations × 30))
```
Strategy-level score:
```
strategyScore = max(0, 100 - (totalDist × 0.5) - (routes.length × 5) - (violations × 20))
```

### 7.2 Distance & Duration
- **Provider chain**: OSRM (primary) → Haversine × 1.3 (fallback)
- **Avg speed**: 30 km/h (0.5 km/min) for Haversine duration
- **Matrix**: Computed once for ALL points, sub-matrices extracted per route

### 7.3 Objectives
**Primary**: Minimize total distance under constraints.  
**Secondary**: Maximize coverage, minimize cabs, respect female safety rules.

**Tradeoffs**:
- Longer commutes for fewer cabs (MAXIMIZE_UTILIZATION)
- More cabs for shorter commutes (MINIMIZE_TIME)
- Constraint relaxation rather than leaving employees unassigned
- Force-assignment bypasses all constraints if a seat exists

### 7.4 Optimization Pipeline (`optimizeRoutes()`)

```
Phase 1: Sequential greedy clustering
Phase 2: Cab-cluster matching (by centroid proximity)
Phase 3: Route building (permutation → safety → verification)
Phase 4: Route consolidation (merge <50% fill routes)
Phase 5: Redistribution (relaxed constraints, 3 levels)
Phase 6: Guaranteed seat (bypass all constraints)
Phase 7: Safety post-processing (female swaps)
Phase 8: Final recalc + constraint re-verification
```

---

## 8. Driver Home vs Depot Rules

### 8.1 Summary
| Scenario | tripSequence | startPoint |
|----------|-------------|------------|
| First shift of the day | 1 | Driver's home (`driverX`, `driverY`) |
| Second+ shift | 2+ | Depot (from SystemSettings) |
| No driver coordinates | 1 | Depot (fallback) |

### 8.2 Implementation

**Primary**: `fetchOptimizationInputs()` (`route.ts:114-139`)
**Secondary (SWAP_CAB)**: `route.ts:300-305`

### 8.3 Edge Cases
| Case | Behavior |
|------|----------|
| No driver coords | Falls back to depot even for first shift |
| Cab not worked previous shifts | Per-cab DB lookup: if no prior routes, tripSequence=1 (even on 2nd shift) |
| Preview vs production | Preview uses forceTripSequence (same for ALL cabs). Production uses per-cab DB lookup |

---

## 9. Capacity Management

### 9.1 Rules
- **Hard limit**: No route exceeds `cab.capacity` stops (`optimization.ts:2226`)
- **Cluster cap**: Growth stops when `cluster.length >= cab.capacity`
- **Redistribution**: Only routes with `stops.length < capacity` are targets
- **Guaranteed seat**: Last resort — any seat available, any employee gets in

### 9.2 Balancing
- **Consolidation pass** (`optimization.ts:886`): Moves passengers from <50% fill to fuller routes
- **Guaranteed seat**: Assigns to least-full route first

---

## 10. Manual Operations

### SWAP_CAB (`routes/[id]/route.ts:270-332`)
1. Look up target cab
2. Count cab's existing routes today
3. Compute `newTripSequence = existingRoutes.length + 1`
4. Resolve `newStartPoint`: trip 1 + coords → home, else depot
5. Recompute distance/duration from new start point
6. Update route record
- **Limitation**: Does NOT re-optimize stop order after swap

### REORDER / APPLY_SEQUENCE (`routes/[id]/route.ts:72-268`)
- REORDER: Swap two adjacent stops, recalculate ETAs + violations
- APPLY_SEQUENCE: Accept full new stop order, recalculate everything

### Regenerate Route
Not a direct operation. Re-run preview + apply to regenerate all routes for a date/shift.

### Delete Route
Bulk-deleted during persist (old routes cleared before new insert).  
CRUD operations delete pending routes for affected cabs (`cabs/[id]/route.ts:73-83`).

---

## 11. Constraint Catalog

| # | Constraint | Default | Enforced In | Violation Behavior |
|---|-----------|---------|-------------|-------------------|
| 1 | Max route distance | 45 km | `verifyRouteConstraints()` | Shed employee, retry |
| 2 | Max route duration | 90 min | `verifyRouteConstraints()` | Same |
| 3 | Max cluster radius | 15 km | Clustering + `verifyRouteConstraints()` | Growth stops |
| 4 | Max employee detour | 10 km | `verifyRouteConstraints()` via cluster span | Shed if span > 2× radius |
| 5 | Vehicle capacity | per cab | Growth + route building | Hard cap |
| 6 | Driver home vs depot | — | `fetchOptimizationInputs()`, SWAP_CAB | Start from depot if > trip 1 |
| 7 | Shift matching | — | `fetchOptimizationInputs()` | Skip shift if no employees/cabs |
| 8 | Female first pickup | — | `isPermutationSafe()` | Violation flagged, score penalized |
| 9 | Female last drop | — | `isPermutationSafe()` | Same |
| 10 | Isolated female | — | `checkSafetyViolations()` | Swap attempt with male from another route |
| 11 | Approved leaves | — | `fetchOptimizationInputs()` JS filter | Employee excluded |
| 12 | Holiday check | — | `POST /api/optimization` line 356 | 400 error |
| 13 | Cab status | AVAILABLE | `fetchOptimizationInputs()` | INACTIVE excluded |
| 14 | Employee status | ACTIVE | `fetchOptimizationInputs()` | INACTIVE excluded |
| 15 | Capacity shortfall | — | `optimizeAllStrategies()` | Returned in response |
| 16 | Guaranteed seat | — | Phase 6 of `optimizeRoutes()` | Bypasses ALL constraints |

---

## 12. Failure Scenarios

| Scenario | Behavior |
|----------|----------|
| **Missing driver** | Cab with null/empty driver name still participates; route shows "Unassigned" |
| **Missing cab** | API returns 400 "No available cabs found" |
| **Empty route** | Filtered out before persist (`route.ts:179`) |
| **Capacity shortage** | `capacityShortfall` returned; employees without seats → `OVERCAPACITY` warning |
| **Employee removed** | Soft-delete (status=INACTIVE). Pending routes for affected cab deleted. Must re-optimize. |
| **Employee added** | Not auto-included. Must re-optimize. Routes remain stale until re-run. |

---

## 13. Architecture Diagram

```
BROWSER (React SPA)
  page.tsx
  ├─ handleGeneratePlans()
  ├─ manifest groups (per-shift tables/cards)
  ├─ selected route sidebar
  └─ RouteVisualizer → GoogleMapView
       │
  useTransportStore (zustand)
  ├─ employees, cabs, shifts, routes
  ├─ optimizationPlans (preview)
  ├─ previewOptimization()
  ├─ applyOptimizationPlan()
  └─ runOptimization()
       │ HTTP fetch
       ▼
NEXT.JS API
  POST /api/optimization     ← main orchestrator
  GET  /api/optimization     ← fetch persisted routes
  GET  /api/shifts/cabs/employees  ← data sources
  PATCH /api/routes/[id]     ← SWAP_CAB, REORDER, etc.
  DELETE /api/cabs/manage    ← soft-delete
       │
       ▼
OPTIMIZATION ENGINE (optimization.ts)
  fetchGoogleMapsMatrix()   ← OSRM primary, Haversine fallback
  clusterMaxUtilization()   ← fill to capacity
  clusterMinTime()          ← 20min duration limit
  clusterBalanced()         ← 80% fill, 30min threshold
  matchCabsToClusters()     ← centroid proximity matching
  buildRoutesFromAssignments()
  ├─ getOptimalPermutation()  ← brute-force (≤7) / greedy (≥8)
  ├─ enforceSafetyRules()     ← female-first/last correction
  └─ verifyRouteConstraints() ← distance/duration/radius
  Post-processing: Consolidation → Redistribution → Guaranteed seat
       │
       ▼
DATABASE (PostgreSQL)
  Shift ──┬── Employee (1:N via shiftId)
           └── Cab (M:N via join table)
  Route ──┬── Cab (M:1)
           ├── Shift (M:1)
           ├── RouteStop (1:N) ── Employee (M:1)
           └── Violation (1:N)
  SystemSettings, Holiday, LeaveRequest
```

---

## 14. Operational Walkthrough

### 8 AM Shift, 3 Cabs, 20 Employees

**Input**: Cabs A(6), B(6), C(6). Capacity=18. 20 employees, 2 on leave → 18 eligible.

**Step 1**: API loads 18 employees, 3 cabs (`tripSequence=1` → home start points).

**Step 2**: OSRM matrix computed for 21 points (3 homes + 18 emps + depot).

**Step 3**: `clusterBalanced()` runs:
- Cab A (cap 6): seed=E15, fills with 6 employees within 15km/30min → cluster A
- Cab B (cap 6): seed=E9, fills with 6 employees → cluster B
- Cab C (cap 6): seed=E14, fills with 6 employees → cluster C

**Step 4**: `matchCabsToClusters()` re-assigns by proximity (no change since clusters equal-sized).

**Step 5**: `buildRoutesFromAssignments()`:
- Each cluster: brute-force 720 permutations → pick shortest safe
- All constraints pass (distance≤45, duration≤90, span≤30)
- Scores: 69, 72, 65

**Step 6**: Post-processing: All routes full → no consolidation. No remaining employees. No safety issues.

**Step 7**: Admin previews BALANCED plan (3 cabs, 18 employees, 113.8km total, 28min avg commute).

**Step 8**: Admin clicks Apply → `persistPreviewRoutes()` creates 3 Route + 18 RouteStop records.

---

## 15. Executive Summary

### How Routes Are Generated
Admin clicks "Optimize Routing" → store fetches all data, calls `POST /api/optimization` per shift with `mode: "ALL"` → API loads employees (ACTIVE, shift-matched, no leaves) and cabs (AVAILABLE, shift-matched) → three clustering strategies run in parallel → cabs re-matched by proximity → routes built with optimal stop order, safety enforcement, and constraint verification → post-processing consolidates underfilled routes, redistributes leftovers, and ensures no one is left seatless → all 3 plans returned to UI as preview.

### How Drivers Are Assigned
Drivers are embedded in Cab records. After clustering (by capacity-descending cab order), `matchCabsToClusters()` reassigns cabs to clusters by minimizing distance from driver start point to cluster centroid. Driver's home is start point for shift 1; depot for all subsequent shifts.

### How Employees Are Assigned
Employees enter by shift affiliation. Each strategy picks the furthest-from-depot employee as a cluster seed, then grows the cluster by adding road-distance-nearest employees within radius/duration limits. Unassigned employees get 3 rounds of constraint-relaxed redistribution plus a final guaranteed-seat pass.

### How Optimization Works
The engine finds the shortest-distance route permutation that satisfies all constraints. For ≤7 stops, brute-force evaluates ALL permutations (up to 5040). For ≥8, greedy nearest-neighbor. Safety rules (MALE first pickup / last drop) are enforced as hard constraints; routes that violate them are penalized in score but still created. The strategy-level score adds a vehicle-count penalty to favor consolidation.

### What Constraints Exist
Distance (45km), duration (90min), cluster radius (15km), employee detour (10km), vehicle capacity (per cab), female safety rules, shift matching, holiday blocking, leave exclusion, cab/employee status filtering.

### What Assumptions Exist
- Driver home coordinates are accurate (shift 1 start point)
- Depot coordinates are correct (shift 2+ start point)
- OSRM is available (falls back to Haversine × 1.3 if not)
- 30 km/h average speed (used for Haversine duration)
- Shift order determines trip sequence (all cabs in a shift share the same forced trip sequence during preview)
- Employee coordinates are pre-geocoded
- Flat 10-minute pickup buffer is sufficient

### What Limitations Exist
- No cross-shift optimization (each shift optimized independently)
- No real-time traffic data
- No dynamic re-optimization (employee changes don't trigger auto-regeneration)
- No incremental route repair (SWAP_CAB doesn't re-optimize stop order)
- Preview uses forced trip sequence (all cabs in shift 2+ get depot start, even if a particular cab didn't work shift 1)
- Cluster strategy functions use seed-to-candidate distance, not nearest-cluster-member
- No explicit constraint-relaxation marker in persisted routes
