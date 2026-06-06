# Audit: Route Resilience, Driver Replacement, and Operational Exception Handling

## 1. EXECUTIVE SUMMARY

The system is **fragile under operational disruptions**. Most exception scenarios require **full re-optimization** (regeneration of all routes) and several paths silently **destroy pending routes** instead of reassigning them. There is no incremental repair capability — a last-minute driver absence, vehicle breakdown, or employee no-show forces the admin to either use a blunt swap tool or wipe all routes and re-optimize from scratch.

**Key risk areas:**
- Cab/employee CRUD operations **delete pending routes** rather than redistributing passengers
- `SWAP_CAB` updates `cabId` without recalculating driver start point, route sequence, or shift validity
- **No route freezing** — a route with status `ASSIGNED` or `IN_PROGRESS` can still be affected by entity deletions
- **No partial re-optimization** — all changes require a full pipeline run

---

## 2. DRIVER REMOVAL FINDINGS

### Scenario: Driver becomes unavailable after route generation

**Current behavior:** Routes remain assigned to the driver's cab. If the cab is deleted, pending routes are **silently destroyed**.

**Code path for cab deletion — `src/app/api/cabs/manage/route.ts:96-106`**:
```typescript
const pendingRoutes = await prisma.route.findMany({
    where: { cabId: id, status: { in: ["PENDING", "PLANNED"] } },
});
if (pendingRoutes.length > 0) {
    const routeIds = pendingRoutes.map(r => r.id);
    await prisma.routeStop.deleteMany({ where: { routeId: { in: routeIds } } });
    await prisma.violation.deleteMany({ where: { routeId: { in: routeIds } } });
    await prisma.route.deleteMany({ where: { id: { in: routeIds } } });
}
```

**Same pattern in `src/app/api/cabs/[id]/route.ts:106-116`.**

**Consequence:** Employees are silently unassigned — no notification, no redistribution, no re-optimization triggered. The only way to recover is for the admin to manually notice and re-run optimization.

### Admin-side workaround: Swap Driver modal

**`src/app/dashboard/admin/transport/optimization/page.tsx:1605-1614`** and **`2831-2894`**:

The "Swap Driver" button opens a modal listing available cabs. Selecting a cab calls `swapRouteCab(routeId, cabId)` which PATCHes the route with `action: "SWAP_CAB"`.

**`src/app/api/routes/[id]/route.ts:268-292`** — The API handler:
```typescript
if (action === "SWAP_CAB") {
    const { cabId } = body;
    const targetCab = await prisma.cab.findUnique({ where: { id: cabId } });
    if (!targetCab) return NextResponse.json({ error: "Cab not found" }, { status: 404 });
    await prisma.route.update({ where: { id: routeId }, data: { cabId } });
    // ... audit log
    return NextResponse.json({ success: true });
}
```

**Problems with SWAP_CAB:**
1. **No start point recalculation** — The new driver's home location is ignored. Route metrics (distance, duration, score) are NOT recalculated.
2. **No re-optimization** — The stop sequence remains as-is, even though the new driver starts from a different location.
3. **No shift validation** — The new cab's shift assignments are not checked against the route's shift.
4. **No constraint re-verification** — The route could now violate `maxRouteDistanceKm` or `maxRouteDurationMin` with the new start point.
5. **No tripSequence recalculation** — If the new driver already completed a trip this day, `tripSequence` should be incremented and start point should be depot, not home. The SWAP_CAB API does not update `tripSequence` or recalculate the start point.

---

## 3. VEHICLE FAILURE FINDINGS

### Scenario A: Vehicle becomes unavailable (deleted or set to MAINTENANCE)

| Action | Pending routes handling | Active/assigned routes handling |
|--------|----------------------|-------------------------------|
| Cab DELETE (manage) | Routes **destroyed** (lines 96-106) | Non-pending routes still reference deleted cab ID — **orphan records** until admin intervenes |
| Cab DELETE ([id]) | Routes **destroyed** (lines 106-116) | If routes exist, cab is **soft-deleted** (status=INACTIVE, vehicleNumber renamed) — routes orphaned (lines 122-136) |
| Cab PATCH (status change) | Routes **destroyed** (lines 207-217) | No automatic handling |

### Scenario B: Vehicle capacity changes

**`src/app/api/cabs/manage/route.ts:186-205`** — Cab update:
```typescript
const pendingRoutes = await prisma.route.findMany({
    where: { cabId: id, status: { in: ["PENDING", "PLANNED"] } },
});
if (pendingRoutes.length > 0) {
    // DELETE all pending routes
}
```

**Consequence:** If capacity is reduced from 6 to 4, the pending route stops are deleted rather than the excess employees being redistributed. If capacity is increased, the extra seats go unused until re-optimization.

### Finding: No automatic redistribution exists

There is no code path that automatically tries to fit displaced employees into other routes' spare capacity. The **Employee Redistribution** logic in `src/lib/optimization.ts:860-1032` only runs during the optimization pipeline — it is not an independent operation.

---

## 4. EMPLOYEE ADDITION FINDINGS

### Scenario: New employee added after optimization

**`src/app/api/employees/route.ts:163-289`** (POST):
- Creates the employee record
- Does NOT touch existing routes
- No incremental insertion into any route

**`src/app/api/employees/route.ts:361-368`** (PATCH):
```typescript
const pendingStops = await prisma.routeStop.findMany({
    where: { employeeId: id, route: { status: { in: ["PENDING", "PLANNED"] } } },
});
if (pendingStops.length > 0) {
    // DELETE all pending routes involving this employee
}
```

### Finding: No incremental insertion exists

There is no "add employee to nearest route" or "insert employee into existing route" feature. The only path is full re-optimization:

```typescript
// Admin must call this:
await runOptimization(isPickup, apiKey, mode);
// Which calls POST /api/optimization → optimizeRoutes() → full rebuild
```

**Operational impact:** Adding a last-minute employee requires regenerating all routes. This also affects all other employees' routes (ETAs, stop orders, etc.), even if they were perfectly optimized.

---

## 5. EMPLOYEE REMOVAL FINDINGS

### Scenario: Employee cancels transport, is absent, or changes shift

**DELETE employee — `src/app/api/employees/route.ts:127-151`:**
```typescript
// Soft-delete the employee (set status=INACTIVE)
await tx.employee.update({
    where: { id },
    data: { status: "INACTIVE" },
});

// Delete all pending routes with any stop for this employee
const pendingStops = await prisma.routeStop.findMany({
    where: { employeeId: id, route: { status: { in: ["PENDING", "PLANNED"] } } },
});
if (pendingStops.length > 0) {
    const routeIds = pendingStops.map(s => s.routeId);
    await prisma.routeStop.deleteMany({ where: { routeId: { in: routeIds } } });
    await prisma.violation.deleteMany({ where: { routeId: { in: routeIds } } });
    await prisma.route.deleteMany({ where: { id: { in: routeIds } } });
}
```

**Critical finding:** Removing ONE employee deletes ALL routes that contained a stop for that employee — even routes that also carry 5 other employees. This means removing a single employee can cascade to unassigning dozens of others.

**For IN_PROGRESS or ASSIGNED routes:** The employee is soft-deleted (INACTIVE) but their stops remain on those routes. The driver will see a stop for someone who no longer works there. The stop can be manually skipped via the driver UI (`SKIP_STOP` action), but there is no automatic cleanup.

### PATCH employee (shift change, address change) — `src/app/api/employees/route.ts:361-368`:
Same destructive pattern — all pending routes containing this employee are **deleted**.

---

## 6. SHIFT CHANGE FINDINGS

### Scenario A: Driver shift changes

**Shift assignments for cabs** — Updated via `PATCH /api/cabs/manage` or `PUT /api/cabs/[id]`:
```typescript
shifts: Array.isArray(shiftIds)
    ? { set: shiftIds.map((id: string) => ({ id })) }
    : undefined,
```

If shiftIds are changed for a cab, **no route validation occurs**. A cab could be assigned routes for a shift it no longer belongs to.

### Scenario B: Employee shift changes

**`PATCH /api/employees/route.ts:356`**:
```typescript
shiftId: shiftId !== undefined ? (shiftId || null) : undefined,
```

If shiftId changes, pending routes for that employee are **destroyed** (line 361-368). The employee becomes unassigned and needs re-optimization.

### Scenario C: Vehicle shift changes

Same as Scenario A — shiftIds updated on cab, no route validation.

### Scenario D: Shift deletion

**`src/app/api/shifts/[id]/route.ts:35-41`**:
```typescript
const routeCount = await prisma.route.count({ where: { shiftId: id } });
if (routeCount > 0) {
    return NextResponse.json(
        { error: "This shift is used in existing routes. Archive or reassign those routes first." },
        { status: 409 }
    );
}
```

**Finding:** Shift deletion is blocked if routes exist — correct behavior. But there is no tool to reassign routes to another shift.

### Failure mode: Assignment drift

With no validation on shift-routes-cab alignment, the following can happen:
- A cab is removed from a shift but retains routes for that shift
- An employee changes shifts but their route stop remains in the old shift's route
- Shift time changes (`startTime`/`endTime` edited) but routes are not revalidated

---

## 7. MULTI-SHIFT DRIVER FINDINGS

### Verified correct: Start point rule

**`src/app/api/optimization/route.ts:114-149`** — `fetchOptimizationInputs`:
```typescript
const optCabs: OptimizeCab[] = dbCabs.map(cab => {
    let startPoint = undefined;
    let tripSequence = 1;

    const prevRoutes = cab.routes
        .filter(r => r.shiftId !== fallbackShiftId)
        .sort((a, b) => a.tripSequence - b.tripSequence);

    if (prevRoutes.length > 0) {
        tripSequence = prevRoutes.length + 1;
    }

    if (tripSequence === 1) {
        if (typeof cab.driverX === "number" && typeof cab.driverY === "number") {
            startPoint = { x: cab.driverX, y: cab.driverY };
        } else {
            startPoint = depot;
        }
    } else {
        startPoint = depot;
    }

    return { id: cab.id, ..., startPoint, tripSequence };
});
```

**Rule confirmed:**
- `tripSequence === 1` → `startPoint = driver home` (if coordinates exist), else depot
- `tripSequence > 1` → `startPoint = depot`

### How tripSequence is determined

The code counts routes for this cab on the same day **that are NOT for the current shift** and sets `tripSequence = prevRoutes.length + 1`.

**Problem:** This assumes all previous shifts have COMPLETED routes. If a previous shift's route was CANCELLED or is still IN_PROGRESS, the tripSequence calculation could be wrong.

### SWAP_CAB risk to multi-shift rule

**`src/app/api/routes/[id]/route.ts:268-292`** — The SWAP_CAB action:
```typescript
await prisma.route.update({
    where: { id: routeId },
    data: { cabId },  // Only updates cabId
});
```

**TripSequence is NOT updated** when swapping cabs. If Driver A (shift 1) swaps their route to Driver B's cab (which also has shift 2), then:
- Driver B's cab might get `tripSequence` = 1 for shift 1 (correct), but if Driver B also has a shift 2 route, that route might then get `tripSequence` = 1 incorrectly on next optimization
- More critically, the new cab's start point is **never recalculated** during SWAP_CAB — it uses whatever was stored from the original optimization

**Recommendation:** SWAP_CAB must either:
1. Recalculate `tripSequence` for the new cab and update `tripSequence`/`startPoint` on the route, OR
2. Mark the route for re-optimization (set status back to PENDING with a flag)

---

## 8. PARTIAL RE-OPTIMIZATION FINDINGS

### What exists today

| Capability | Exists? | Code Location |
|-----------|---------|---------------|
| Reorder stops within a route | ✅ Yes | `REORDER` action, `src/app/api/routes/[id]/route.ts:70-181` |
| Apply alternative stop sequence | ✅ Yes | `APPLY_SEQUENCE` action, line 183-266 |
| Swap cab on a route | ✅ Yes | `SWAP_CAB` action, line 268-292 |
| Override violation | ✅ Yes | `POST /api/routes/violation` |
| Rebuild one route | ❌ No | Requires full `optimizeRoutes()` |
| Rebuild one cluster | ❌ No | No cluster-level operation |
| Reassign one employee's stop | ❌ No | No API for this |
| Incrementally insert employee | ❌ No | No nearest-route insertion |

### The only "partial" tool: Route Variations

**`src/app/api/routes/[id]/variations/route.ts`** — Fetches 4 recomputed stop orderings (DISTANCE, TIME, BALANCED, NORMAL) for a **single route's existing employees**. Admin can apply one via `APPLY_SEQUENCE`.

This recomputes the **stop order** but does NOT:
- Add or remove employees from the route
- Change the cab assignment
- Update the start point
- Recalculate constraints for the new cab

### Full regeneration is the only option

All substantial changes — driver replacement, vehicle breakdown, employee changes — require:
```typescript
const result = await optimizeRoutes(optEmployees, optCabs, isPickup, apiKey, mode, depot, constraints);
```

This rebuilds everything: distance matrix, clustering, assignment, routing, safety checks. For a single employee change, this is ~2,400 lines of processing across all routes.

---

## 9. DISASTER SCENARIO AUDIT

### Scenario 1: Driver unavailable 30 minutes before shift

| Aspect | Finding |
|--------|---------|
| **Current behavior** | Admin must use "Swap Driver" modal. This merely changes `cabId` on the route — no re-optimization, no start point update, no constraint recheck. |
| **Gap** | If the replacement driver lives far from the original's cluster, the route's first pickup could be 20+ km from the replacement driver's home. Route distance/duration/score are not recalculated. |
| **Required change** | SWAP_CAB should trigger a lightweight re-optimization of the affected route: recompute distance/duration using the new cab's start point, recheck constraints, update score. |

### Scenario 2: Vehicle breakdown during day

| Aspect | Finding |
|--------|---------|
| **Current behavior** | Cab can be marked MAINTENANCE (`PATCH /api/cabs/manage`). If the cab has routes beyond PENDING status, nothing happens automatically. The route remains assigned to the broken vehicle. |
| **Gap** | No automatic notification, no reassignment, no re-optimization. Employees waiting for pickup have no way to know. |
| **Required change** | Changing cab status to MAINTENANCE/INACTIVE while it has ASSIGNED or IN_PROGRESS routes should trigger a notification. A "reassign all routes" workflow is needed. |

### Scenario 3: Multiple drivers unavailable

| Aspect | Finding |
|--------|---------|
| **Current behavior** | Each route must be swapped individually. There is no batch-swap or bulk reassignment. |
| **Gap** | Manual, error-prone process. Missing drivers could leave employees stranded. |
| **Required change** | A "re-optimize for available cabs" mode that takes the current route stops and re-assigns them to remaining cabs. |

### Scenario 4: Capacity shortage

| Aspect | Finding |
|--------|---------|
| **Current behavior** | `optimizeRoutes()` handles this through the redistribution pass and guaranteed seat pass. But if a cab's capacity drops after optimization, routes are **destroyed** rather than redistributed. |
| **Gap** | Capacity changes during the day destroy pending routes. |
| **Required change** | Capacity reduction should redistribute employees to other routes with spare capacity, not delete routes. |

### Scenario 5: Depot vehicle substituted

| Aspect | Finding |
|--------|---------|
| **Current behavior** | Admin can create a new cab (`POST /api/cabs/manage`), then swap it onto each affected route. But `tripSequence` for the new cab is not set correctly. |
| **Gap** | If the new cab is a depot vehicle, its start point should be the depot. Since `tripSequence` is determined during optimization, and no optimization runs, the start point may be incorrectly set to driver home. |
| **Required change** | Cab creation during the day should allow specifying `tripSequence` or start point for immediate assignment. |

### Scenario 6: New emergency vehicle added

| Aspect | Finding |
|--------|---------|
| **Current behavior** | `POST /api/cabs/manage` creates a cab with `status: "AVAILABLE"`. No routes are automatically assigned. |
| **Gap** | Admin must manually swap routes or re-optimize. |
| **Required change** | Option to "assign remaining unassigned employees" to the new cab, using the nearest-employee logic. |

---

## 10. RESILIENCE ROADMAP

### CRITICAL — Can cause route failure or employee loss

#### R1: Pending route destruction on entity changes

- **Root cause:** Cab/employee CRUD operations delete pending routes instead of redistributing passengers
- **Code locations:**
  - `src/app/api/cabs/manage/route.ts:96-106` (cab update/delete → delete pending routes)
  - `src/app/api/cabs/[id]/route.ts:106-116` (cab delete → delete pending routes)
  - `src/app/api/employees/route.ts:141-151` (employee delete → delete pending routes)
  - `src/app/api/employees/route.ts:361-368` (employee update → delete pending routes)
- **Proposed fix:** Instead of deleting all pending routes, remove the affected employee's stop from each route. If the cab is removed, re-assign remaining employees to other routes with spare capacity. If no capacity exists, only then should routes be deleted and warnings generated.
- **Complexity:** Medium
- **Risk:** Low (replaces destructive behavior with graceful degradation)

#### R2: SWAP_CAB lacks re-optimization

- **Root cause:** Swapping a route to a different cab does not recalculate start point, tripSequence, distance, duration, or constraints
- **Code location:** `src/app/api/routes/[id]/route.ts:268-292`
- **Proposed fix:** After changing `cabId`, recalculate tripSequence for the new cab: count existing routes for this cab on the same day, set tripSequence = count + 1, set startPoint accordingly (tripSequence === 1 → driver home, else → depot). Then recompute route distance/duration using the new start point via `fetchGoogleRouteMetrics`. Re-verify constraints.
- **Complexity:** Medium
- **Risk:** Medium (depends on road matrix API availability)

---

### HIGH — Causes operational disruption

#### R3: No incremental employee insertion

- **Root cause:** No API to add an employee to the nearest route with spare capacity
- **Code location:** Missing entirely
- **Proposed fix:** Add a `POST /api/routes/assign-late-employee` endpoint that finds the route (matching shift, capacity available, geographically nearest) and inserts the employee via the redistribution logic from `optimizeRoutes()`.
- **Complexity:** Medium
- **Risk:** Low

#### R4: Delete cascade unassigns everyone

- **Root cause:** Deleting one employee's pending stop deletes the entire route, unassigning all other employees on that route
- **Code location:** `src/app/api/employees/route.ts:145-150`
- **Proposed fix:** Remove only the deleted employee's stop from the route. Re-optimize the remaining stops in that route. Only delete the route if it would be empty.
- **Complexity:** Low
- **Risk:** Low

#### R5: No multi-shift start point validation on SWAP_CAB

- **Root cause:** SWAP_CAB does not update tripSequence, so the route's start point may be incorrect for the new cab's shift sequence
- **Code location:** `src/app/api/routes/[id]/route.ts:268-292`
- **Proposed fix:** Implement the recalc from R2 above
- **Complexity:** Low
- **Risk:** Low

---

### MEDIUM — Reduces efficiency

#### R6: Single-route re-optimization missing

- **Root cause:** No way to rebuild one route in isolation; full re-optimization required
- **Proposed fix:** Expose `getOptimalPermutation` + constraint check + safety check as an API endpoint for a single cab's route. This allows rebuilding one route without touching others.
- **Complexity:** Medium
- **Risk:** Low

#### R7: Active route modification not supported

- **Root cause:** Once a route is IN_PROGRESS, the only supported actions are stop status changes and completion
- **Proposed fix:** Allow SWAP_CAB on IN_PROGRESS routes with warning. Add endpoint to add/remove employees from IN_PROGRESS routes (with constraint re-check).
- **Complexity:** High
- **Risk:** Medium (safety-critical mid-execution changes)

#### R8: No notification on route disruption

- **Root cause:** When pending routes are deleted/swapped, affected employees are not notified
- **Code location:** All CRUD operations lack notification calls for affected employees
- **Proposed fix:** When a route is modified or deleted, batch create notifications for all stops' employees
- **Complexity:** Low
- **Risk:** Very low

---

### LOW — Future enhancement

#### R9: Batch cab swap

- **Root cause:** No bulk operation for multiple drivers unavailable
- **Complexity:** Low
- **Risk:** Very low

#### R10: "What-if" scenario preview

- **Root cause:** No way to preview the impact of a driver swap before applying it
- **Complexity:** Low
- **Risk:** Very low

---

## RECOMMENDED IMPLEMENTATION ORDER

| Order | Issue | Effort | Impact | Risk | Preserves multi-shift rule? |
|-------|-------|--------|--------|------|---------------------------|
| 1 | **R4** — Delete only the affected stop, not the whole route | ~15 lines | High (prevents cascading unassignment) | Low | ✅ N/A |
| 2 | **R1** — Graceful route handling on entity changes | ~30 lines | High (prevents silent data loss) | Low | ✅ Yes |
| 3 | **R5** — SWAP_CAB tripSequence recalc | ~20 lines | High (fixes start point correctness) | Low | ✅ Yes — essential fix |
| 4 | **R2** — SWAP_CAB re-optimization (distance/duration/constraints) | ~40 lines | High (ensures route validity after swap) | Medium | ✅ Yes |
| 5 | **R3** — Incremental employee insertion | ~80 lines | Medium (reduces need for full re-opt) | Low | ✅ Yes |
| 6 | **R6** — Single-route re-optimization | ~60 lines | Medium (partial rebuild capability) | Low | ✅ Yes |
| 7 | **R8** — Disruption notifications | ~20 lines | Medium (employee visibility) | Very low | ✅ N/A |
| 8 | **R7** — Active route modification | ~100 lines | Low (complex, safety-critical) | Medium | ✅ Must preserve |
| 9 | **R9** — Batch swap | ~30 lines | Low (convenience) | Very low | ✅ Must implement |
| 10 | **R10** — What-if preview | ~40 lines | Low (visibility) | Very low | ✅ Must implement |

---

## Files Referenced

| File | Key Lines | Purpose |
|------|-----------|---------|
| `src/app/api/optimization/route.ts` | 114-149 | Start point / tripSequence logic |
| `src/app/api/routes/[id]/route.ts` | 268-292 | SWAP_CAB action — cab reassignment |
| `src/app/api/routes/[id]/variations/route.ts` | all | Single-route re-sequencing |
| `src/app/api/cabs/manage/route.ts` | 96-106, 207-217 | Cab CRUD → pending route deletion |
| `src/app/api/cabs/[id]/route.ts` | 106-116, 122-136 | Cab CRUD → pending route deletion |
| `src/app/api/employees/route.ts` | 141-151, 361-368 | Employee CRUD → pending route deletion |
| `src/app/api/execution/route/route.ts` | all | Route execution lifecycle |
| `src/app/api/execution/stop/route.ts` | all | Stop execution lifecycle |
| `src/app/api/shifts/[id]/route.ts` | 35-41 | Shift deletion guard |
| `src/app/api/optimization/publish/route.ts` | all | Route publishing |
| `src/store/useTransportStore.ts` | 680-707 | swapRouteCab frontend action |
| `src/lib/optimization.ts` | 668-1418 | Core optimization (redistribution, guaranteed seat) |
| `src/dashboard/admin/transport/optimization/page.tsx` | 1605-1614, 2831-2894 | Swap Driver UI modal |
