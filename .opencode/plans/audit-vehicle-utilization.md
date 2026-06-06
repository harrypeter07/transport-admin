# Audit: Underutilized Vehicle and Passenger Consolidation Analysis

## 1. EXECUTIVE SUMMARY

The observed scenario — Driver Ashish with 1 passenger (Sejal) while Driver Suraj has capacity 6 but carries only 5 — is a **direct consequence of sequential greedy clustering with no post-consolidation pass**. The algorithm locks cluster membership during formation and never revisits whether a passenger could be moved to a different vehicle with spare capacity.

**Root cause:** Cluster composition is frozen the moment an employee is assigned to a cab's cluster. The redistribution and guaranteed-seat passes only operate on employees who were never assigned to any route — they never move an already-assigned employee from an underutilized route to one with spare capacity.

---

## 2. RECONSTRUCTED DECISION PATH

Given:
- **Suraj's cab**: capacity 6, carries 5 passengers
- **Ashish's cab**: capacity (unknown — let's assume ≥1), carries 1 passenger (Sejal)
- **Mode**: `FASTEST_TRAVEL` (default)

### Step-by-step trace

**Phase 1: Cluster formation** (`src/lib/optimization.ts:708-777`)

1. **Line 680**: Cabs sorted by capacity descending → Suraj (capacity 6) is first, Ashish is later
2. **Lines 718-728**: Suraj's seed = employee furthest from depot among ALL employees
3. **Lines 737-774**: Cluster grows by adding nearest employees to the seed:
   - Each candidate is checked against the **seed**, not against the growing cluster
   - **Line 753**: Hard break if candidate distance > `maxClusterRadiusKm` (15km default)
   - **Lines 764-769**: In `FASTEST_TRAVEL` mode, breaks if next candidate > 15 min road duration from seed AND `mustTakeToAvoidLeavingBehind` is false
4. **Line 776**: After Suraj's cluster reaches 5 (or hits constraints at 5), Ashish gets the next turn
5. **Lines 718-728 again**: Ashish's seed = furthest from depot among REMAINING employees (which includes Sejal)
6. **Lines 737-774**: Sejal is nearest to Ashish's seed and within radius → assigned to Ashish

**Why Suraj stopped at 5 instead of 6**: Either:
- **Hard radius** (line 753): The 6th nearest employee to Suraj's seed was > 15km away
- **Mode guardrail** (line 765): The 6th nearest to Suraj's seed was > 15 min duration in `FASTEST_TRAVEL` mode
- **Sejal specifically was > 15km/15min from Suraj's seed** but < 15km/15min from Ashish's seed

**Phase 2: Cab-to-cluster matching** (`matchCabsToClusters`, line 2038-2098)

This step matches the closest driver to each cluster's centroid. It **does not change cluster composition** — it only swaps which cab services which cluster.

**Phase 3: Route building** (lines 784-867)

Routes are built from the cluster assignments. If a cluster passes constraint verification, it is finalized.

**Phase 4: Redistribution** (lines 870-1101)

Only operates on `remainingEmployees` — employees never assigned to any route. Since Sejal WAS assigned to Ashish's cluster, she is **not** in this pool. Suraj's empty seat stays empty.

---

## 3. CONSTRAINT ANALYSIS

Assuming Sejal is within 15km and 15min duration of Ashish's seed (the conditions that caused her assignment to Ashish):

| Constraint | Current (Ashish+Sejal) | Post-move (Suraj+Sejal) | Result |
|-----------|----------------------|------------------------|--------|
| **Capacity** | 1 ≤ Ashish capacity ✅ | 6 ≤ 6 ✅ | Pass |
| **Shift** | Same shift (8 AM) ✅ | Same shift ✅ | Pass |
| **Cluster radius** | Sejal within 15km of Ashish's seed ✅ | Would need to check vs Suraj's seed ❓ | Unknown |
| **Route duration** | Ashish route: ≤ 90 min ✅ | Suraj route: recalculated ❓ | Unknown |
| **Ride time** | Sejal's ETA on Ashish | Sejal's ETA on Suraj (would recalc) ❓ | Unknown |
| **Safety** | Single female with Ashish ⚠️ | Female with 5 others ✅ (safer) | Improves |

**Key insight:** The constraint that blocked Sejal from Suraj's cluster was likely **cluster radius** or **mode duration guardrail** from Suraj's seed. If Sejal is >15km from Suraj's furthest-from-depot seed employee, line 753 blocks the addition. But she might still be close to other employees in Suraj's route — the algorithm doesn't check this.

---

## 4. CLUSTER LOCKING AUDIT

### Where cluster membership is frozen

| Lock point | File & Line | Description |
|-----------|-------------|-------------|
| **Cluster formation loop** | `optimization.ts:737-774` | Employees are pulled from `remainingEmployees` and pushed into a cluster. Once in a cluster, they're removed from `remainingEmployees`. |
| **Raw assignment storage** | `optimization.ts:776` | `rawClusterAssignments.push({ cab, cluster })` — cluster is stored |
| **matchCabsToClusters** | `optimization.ts:2038-2098` | Only swaps **cab** per cluster, **never moves employees** between clusters |
| **Route building** | `optimization.ts:784-867` | Iterates matched assignments, builds routes per cluster |
| **Redistribution** | `optimization.ts:870-1043` | Only touches `remainingEmployees` — empty if everyone was assigned |
| **Guaranteed seat pass** | `optimization.ts:1046-1101` | Same — only touches `remainingEmployees` |
| **Safety swaps** | `optimization.ts:1103-1328` | Only swaps single females with single males — not a consolidation feature |

### What CAN move between clusters

| Operation | Can it move Sejal to Suraj? | Condition |
|-----------|---------------------------|-----------|
| Redistribution | ❌ No — Sejal is already assigned | Sejal must be in `remainingEmployees` |
| Guaranteed seat | ❌ No — same limitation | Sejal must be in `remainingEmployees` |
| Safety swap | ❌ Only unassigned females swapped with assigned males | Sejal is already assigned |
| Isolated female swap | ✅ **Potentially** | Only if Sejal is female AND alone on Ashish's route AND Suraj has a male to swap |

**This is the most likely path for rescue.** If Sejal is female (name suggests female), and Ashish has only 1 passenger making her isolated, lines 1181-1327 attempt to swap her with a male from a multi-passenger route. But this swap is constrained:
- Line 1205: `getDistance(isolated female, partner route's seed) ≤ maxClusterRadiusKm` — must pass geographic check
- Both routes must pass constraint re-verification after swap

---

## 5. VEHICLE UTILIZATION AUDIT

### Does the optimizer consider utilization?

| Factor | Considered? | Evidence |
|--------|------------|----------|
| Vehicle count | **NO** | Score formula (line 854): `100 - (distance × 0.8) - penalty`. No vehicle count term. |
| Empty seats | **NO** | No penalty for underutilization |
| Single-passenger routes | **NO** | No penalty for creating them |
| Route consolidation | **NO** | No consolidation pass exists |

### Score formula (line 854):
```
score = max(30, 100 - totalDistance × 0.8 - violations × 30)
```

Two solutions with the same total distance score identically, even if one uses 2 vehicles and the other uses 1. The optimizer has **no incentive** to consolidate.

### Multi-strategy preview score (`summarisePlan` line 2393):
```typescript
totalCabsUsed: routes.length
```
The `totalCabsUsed` is computed for display but **never used in scoring or decision-making**.

---

## 6. POST-OPTIMIZATION IMPROVEMENT AUDIT

### Post-optimization passes that exist:

| Pass | Exists? | Purpose | Can it consolidate? |
|------|---------|---------|-------------------|
| Route constraint shedding | ✅ Yes (lines 846-865) | Sheds employees from routes that fail constraints | ❌ No — only makes routes smaller |
| Redistribution | ✅ Yes (lines 870-1043) | Places unassigned employees into routes with space | ❌ Only for `remainingEmployees` |
| Guaranteed seat | ✅ Yes (lines 1046-1101) | Force-assigns remaining employees | ❌ Same limitation |
| Female priority swap | ✅ Yes (lines 1103-1178) | Swaps unassigned females for assigned males | ❌ Gender-specific |
| Isolated female rescue | ✅ Yes (lines 1180-1328) | Swaps isolated female with male in multi-cab | ✅ **Partially** — fixes 1-female routes |
| Route recalc + safety re-check | ✅ Yes (lines 1331-1415) | Re-optimizes all routes' stop sequences | ❌ Doesn't change composition |

### Missing: **Route consolidation pass**

There is no step after route building that:
- Identifies routes with 1 passenger
- Checks if those passengers fit into other routes with spare capacity
- Eliminates the now-empty route
- Recovers the cab for other use

---

## 7. GLOBAL SEARCH AUDIT

### What the optimizer CAN discover:

- **Within a cluster**: Optimal permutation of stops (brute-force all permutations for ≤7 employees)
- **Seed + nearest employees**: A greedy cluster centered on the furthest-from-depot employee
- **Multiple strategies**: Three different clustering strategies (max-util, min-time, balanced) are offered as a preview

### What the optimizer CANNOT discover:

- **Moving one employee from its assigned cluster to another cluster**
- **Merging two underutilized clusters**
- **Eliminating a vehicle by redistributing its passengers**
- **Any solution that requires splitting an already-formed cluster**

### Practical limitation:

The algorithm is a **greedy sequential** clusterer followed by **independent per-route** optimizers. It never evaluates alternative clusterings of the same employees. The multi-strategy preview provides different clustering heuristics but each is still greedy-sequential.

**If Sejal is 14km from Suraj's seed** (within radius) but **16 min duration** (over the FASTEST_TRAVEL guardrail), she stays out even though:
- She might be 2km from the last employee added to Suraj's cluster
- Moving her would save an entire vehicle
- Total system distance would be lower

---

## 8. ROOT CAUSE

### Exact answer: Cluster composition is locked after formation, and no consolidation pass exists.

**Why Sejal was not assigned to Suraj:**

1. **Cluster formation** (`optimization.ts:737-774`): When Suraj's cluster was being built, Sejal was either:
   - Outside the `maxClusterRadiusKm` (15km) from Suraj's **seed employee** (line 753), OR
   - Outside the mode guardrail (15 min for FASTEST_TRAVEL) from the seed (line 765), OR
   - Both

2. **Locked composition** (`optimization.ts:776`): Sejal remained in the employee pool and was later assigned to Ashish's cluster (where she was within radius of Ashish's seed).

3. **No consolidation pass**: After all routes are finalized, there is no step that identifies "Ashish has 1 passenger and 1+ empty seats, Suraj has 1 empty seat" and attempts to move Sejal.

4. **Redistribution skip** (`optimization.ts:870`): The redistribution pass only handles `remainingEmployees`. Sejal was already assigned, so she's invisible to redistribution.

5. **Score indifference**: The optimizer is not penalized for using an extra vehicle. Two routes with total distance 40km score the same as one route with 40km.

---

## 9. RECOMMENDATIONS

### CRITICAL

#### C1: Add route consolidation pass

- **Root cause:** No post-optimization step moves assigned employees between routes
- **Code location:** After line 867 (after cluster-based route building), insert a new pass
- **Proposed fix:** After all routes are built, iterate over routes with 1 passenger (or low fill ratio). For each, check whether every passenger can fit into another route (matching shift, within centroid radius, capacity available, constraints pass). If so, consolidate and mark the source route as empty for removal.
- **Complexity:** Medium (80-100 lines)
- **Risk:** Low (all moves validated by constraint checks)
- **Expected impact:** Eliminates single-passenger routes, reduces vehicle count by ~5-15%

#### C2: Score should penalize vehicle count

- **Root cause:** Score formula ignores vehicle utilization
- **Code location:** `optimization.ts:842`, `optimization.ts:2200`
- **Proposed fix:** Add `- (totalCabsUsed × 5)` to the strategy-level score or add a per-route underutilization penalty
- **Complexity:** Very low (2 lines)
- **Risk:** Very low
- **Expected impact:** Admin preview will naturally rank consolidated plans higher

---

### HIGH PRIORITY

#### H1: Redistribution should consider moving already-assigned employees

- **Root cause:** Redistribution only handles unassigned employees
- **Code location:** `optimization.ts:870`
- **Proposed fix:** After the existing redistribution pass, run a second pass that looks at routes with <50% fill ratio and tries to move their employees to fuller routes
- **Complexity:** Medium (60-80 lines)
- **Risk:** Low
- **Expected impact:** Catches the Sejal-on-Ashish scenario specifically

#### H2: Cluster growth should consider cluster centroid, not just seed

- **Root cause:** Employees are only checked against the single seed employee, not against the growing cluster's centroid
- **Code location:** `optimization.ts:744-745` — `globalDur[seedGIdx][gIdx]` uses fixed seed
- **Proposed fix:** After adding each employee, recalculate cluster centroid and use centroid-to-candidate distance for the next addition. This naturally tightens clusters around the group, not just one point.
- **Complexity:** Low (5 lines)
- **Risk:** Low
- **Expected impact:** May add Sejal to Suraj's cluster if she's close to the centroid even if far from the original seed

---

### MEDIUM PRIORITY

#### M1: Multi-strategy comparison should show vehicle count

- **Root cause:** Strategy comparison UI (`summarisePlan`) shows total cabs used but doesn't highlight it as a decision factor
- **Code location:** `optimization.ts:2393-2412`
- **Proposed fix:** Add vehicle count to strategy summary and highlight when one strategy uses fewer cabs
- **Complexity:** Low (5 lines)
- **Risk:** Very low

#### M2: Guaranteed seat pass should consider route elimination

- **Root cause:** The guaranteed seat pass adds employees to routes with space but doesn't consider that emptying a source route could free a vehicle
- **Code location:** `optimization.ts:1046-1101`
- **Proposed fix:** When adding an employee from a route with only 1 passenger, mark the source route for deletion if it becomes empty
- **Complexity:** Low (10 lines)
- **Risk:** Low

---

## RECOMMENDED IMPLEMENTATION ORDER

| Order | Issue | Effort | Impact | Risk |
|-------|-------|--------|--------|------|
| 1 | **H2** — Use centroid not seed for cluster growth | ~5 lines | Medium — catches some cases at cluster time | Low |
| 2 | **C2** — Score penalizes vehicle count | ~2 lines | Low — admin visibility only | Very low |
| 3 | **C1** — Route consolidation pass | ~100 lines | High — eliminates single-passenger routes | Low |
| 4 | **H1** — Redistribution for assigned employees | ~80 lines | High — moves passengers from underfull to full routes | Low |
| 5 | **M2** — Guaranteed seat considers route elimination | ~10 lines | Medium — frees vehicles | Low |
| 6 | **M1** — UI shows vehicle count in comparison | ~5 lines | Low — admin decision support | Very low |

---

## Files Referenced

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/optimization.ts` | 708-777 | Sequential cluster formation (greedy, seed-based) |
| `src/lib/optimization.ts` | 780-782 | Cab-to-cluster matching (doesn't change composition) |
| `src/lib/optimization.ts` | 2038-2098 | `matchCabsToClusters` — only swaps cabs, not employees |
| `src/lib/optimization.ts` | 870-1101 | Redistribution + guaranteed seat — only for unassigned |
| `src/lib/optimization.ts` | 842, 2200 | Score formula — no utilization/vehicle count incentive |
| `src/lib/optimization.ts` | 2393-2412 | Strategy summary — shows vehicle count but doesn't score it |
| `src/lib/optimization.ts` | 1880-2030 | Strategy-specific clusterers — all sequential greedy |
