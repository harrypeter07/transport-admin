# SEED_STRATEGY Feature Flag — Implementation Plan

## Overview

Add `SEED_STRATEGY=depot|driver` env variable to control how the cluster seed (first employee per cab) is selected. When `driver`, a weighted score balances cab proximity against depot distance to reduce deadhead.

## Files Changed

**Single file:** `src/lib/optimization.ts`

| Location | Lines | What |
|----------|-------|------|
| `optimizeRoutes()` — seed selection | 715-726 | Replace inline logic |
| `idxBestSeed()` — **NEW function** | after line 1840 | Shared helper for strategy functions |
| `clusterMaxUtilization()` | 1828 | Replace `idxFurthestFromDepot` call |
| `clusterMinTime()` | 1862 | Same |
| `clusterBalanced()` | 1899 | Same |
| `getOptimalPermutation()` — route ordering seed | 424-437 | Also uses furthest-from-depot — keep unchanged (post-cluster ordering) |

**Total: ~35 lines added/changed, 1 file.**

## Exact Code Changes

### Change 1 — Read env var at top of `optimizeRoutes()`

After line 706 (`const warnings: OptimizationWarning[] = [];`), add:

```ts
const seedStrategy = (process.env.SEED_STRATEGY || "depot").toLowerCase();
```

This is read once per optimization run, inside the function so it's compatible with both direct calls and API routes.

### Change 2 — Replace seed selection in `optimizeRoutes()` (lines 715-726)

**Current:**
```ts
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
```

**New:**
```ts
// Pick a seed employee
// depot: furthest from depot by road distance
// driver: best score = dist_to_depot - dist_to_cab_start (balance)
let seedIdx = 0;
let bestScore = -Infinity;
const cabGlobalIdx = i; // cab's index in the global matrix
for (let j = 0; j < remainingEmployees.length; j++) {
  const gIdx = empToGlobalIdx.get(remainingEmployees[j].id);
  if (gIdx === undefined) continue;
  const distToDepot = globalDist[gIdx][depotGlobalIdx];

  if (seedStrategy === "driver") {
    const distToCab = globalDist[gIdx][cabGlobalIdx];
    const score = distToDepot - distToCab;
    if (score > bestScore) { bestScore = score; seedIdx = j; }
  } else {
    if (distToDepot > bestScore) { bestScore = distToDepot; seedIdx = j; }
  }
}
```

**Scoring:**
```
score = dist_to_depot - dist_to_cab
```
- Employee far from depot AND close to cab → high score (ideal seed)
- Employee close to both → low score (picked later)
- Employee far from both → medium score
- `dist_to_depot` weight ensures the seed is still meaningfully far from depot (good cluster reach)
- `dist_to_cab` penalty ensures deadhead is minimized

### Change 3 — Create `idxBestSeed()` helper (new function after line 1840)

```ts
function idxBestSeed(
  employees: OptimizeEmployee[],
  cabGlobalIdx: number,
  depot: Point,
  roadData: GlobalRoadData
): number {
  let idx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < employees.length; i++) {
    const empGlobalIdx = roadData.empToGlobalIdx.get(employees[i].id);
    if (empGlobalIdx === undefined) continue;
    const distToDepot = roadData.dist[empGlobalIdx][roadData.depotGlobalIdx];
    const distToCab = roadData.dist[empGlobalIdx][cabGlobalIdx];
    const score = distToDepot - distToCab;
    if (score > bestScore) { bestScore = score; idx = i; }
  }
  return idx;
}
```

This mirrors the scoring logic from Change 2 but is callable from strategy functions.

### Change 4 — Update `clusterMaxUtilization()` (line 1828)

```diff
-    const seedIdx = idxFurthestFromDepot(remaining, depot, roadData);
+    const cabGlobalIdx = roadData?.cabToGlobalIdx.get(cab.id) ?? roadData?.depotGlobalIdx ?? 0;
+    const seedIdx = roadData && seedStrategy === "driver"
+      ? idxBestSeed(remaining, cabGlobalIdx, depot, roadData)
+      : idxFurthestFromDepot(remaining, depot, roadData);
```

### Change 5 — Update `clusterMinTime()` (line 1862)

Same change as Change 4 at the corresponding line.

### Change 6 — Update `clusterBalanced()` (line 1899)

Same change as Change 4 at the corresponding line.

### NOT changed — `getOptimalPermutation()` (line 424-437)

This function determines **stop ordering within a cluster**, not which cluster the employee belongs to. It picks the furthest-from-depot employee as the first stop for route geometry reasons (depot-first ordering). This is correct regardless of seed strategy — the cluster is already formed, we're just ordering its stops.

## What Scales with the Flag

| Path | Current (`depot`) | Experimental (`driver`) |
|------|-------------------|------------------------|
| `POST /api/optimization` (single strategy) | `optimizeRoutes()` → furthest-from-depot seed | `optimizeRoutes()` → balanced seed |
| `POST /api/optimization` (mode=ALL preview) | `optimizeAllStrategies()` → `clusterMaxUtilization/MinTime/Balanced` → furthest-from-depot seed | Same functions → balanced seed via `idxBestSeed` |
| `GET /api/routes/{id}/variations` | `getRouteVariations()` → uses pre-assigned employees, calls `getOptimalPermutation()` for ordering only | **No change** — employees already assigned |

## Evaluation Framework

### Script: `scripts/compare-seed-strategies.ts`

Purpose: Run both strategies on historical route data and compare results.

**Inputs:**
- Queries last N days of route data from DB
- For each route: cab (with driverX/driverY), employees assigned, current seed
- Re-fetches the global road matrix (or uses stored route metrics as approximation)

**Outputs (per strategy):**

| Metric | `depot` | `driver` | Δ |
|--------|---------|----------|---|
| Avg deadhead (km) | 6.0 | — | — |
| Median deadhead (km) | 5.3 | — | — |
| Total deadhead (km) | 216.6 | — | — |
| Total route distance (km) | 1125.1 | — | — |
| Total route duration (min) | — | — | — |
| Cab utilization (avg stops/cab) | — | — | — |
| Safety violations (count) | — | — | — |
| Constraint violations (shed events) | — | — | — |

**Acceptance criteria:**

| Criterion | Threshold |
|-----------|-----------|
| Deadhead reduction | > 20% |
| Fleet distance reduction | > 5% |
| Safety violations | ≤ baseline (0 increase) |
| Constraint violations | ≤ baseline (0 increase) |
| Cab utilization | ≥ baseline (no reduction) |

**Only pass if all 5 criteria met.**

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New seed → different cluster → constraint violation | Medium | Employee shed → redistribution | Shed-and-retry logic handles it; utilization may drop |
| `idxBestSeed` receives undefined roadData | Low | Falls back to `idxFurthestFromDepot` | Guard clause: `if (!roadData) return idxFurthestFromDepot(...)` |
| Employee count + cab capacity mismatch with new clusters | Low-Medium | More employees left unassigned | Redistribution phase handles stragglers |
| Scoring weight imbalance | Low | Suboptimal seeds | Equal weight is sensible; tunable if needed |

## Rollback

```sh
# Immediate (no code change):
export SEED_STRATEGY=depot

# Code revert:
git checkout src/lib/optimization.ts
```

Zero DB changes. Zero API changes. Zero UI changes.

## Verification Steps

1. Set `SEED_STRATEGY=depot` → run optimization → confirm deadhead matches current baseline (avg ~6.0 km)
2. Set `SEED_STRATEGY=driver` → run optimization → confirm deadhead decreases (avg ~3.9 km expected)
3. Run comparison script against 36 historical routes
4. Verify acceptance criteria
5. If all pass: set `SEED_STRATEGY=driver` as default
6. Monitor for 1 week, then remove flag entirely, keeping `driver` behavior
