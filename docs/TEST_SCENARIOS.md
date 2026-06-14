# ETMS Test Guide — Excel Files & Scenarios

All test workbooks live in [`data/test-rosters/`](../data/test-rosters/).

```bash
npm run generate:test:excels   # refresh scenario files from GTPL master
npm run seed:12june            # seed DB from GTPL 12-June sheet
npm run test:scenarios         # automated smoke checks (no UI)
npm run verify                 # 72 unit/regression tests
```

Master source: `data/test-roasters/GTPL Cab Sheet June 26  (2).xlsx`

---

## Quick reference — which file for what?

| File | Sheet name | Set app date | What it tests |
|------|------------|--------------|---------------|
| **gtpl-12-6-26-baseline.xlsx** | `12-6-26` | **2026-06-12** | Primary GTPL baseline — 17 routes, 64 present, 6 absent |
| **test-scenario-A.xlsx** | `14-6-26` | **2026-06-14** | Same roster as 12-June (baseline parity on different date) |
| **test-scenario-B.xlsx** | `14-6-26` | **2026-06-14** | **15 NO SHOW** — high absence, fewer cabs expected |
| **test-scenario-C.xlsx** | `16-6-26` | **2026-06-16** | Female-first manual violations — app should fix |
| scenario-2026-06-01-baseline.xlsx | `2026-06-01` | 2026-06-01 | Legacy synthetic (older pipeline) |
| scenario-2026-06-02-high-absence.xlsx | `2026-06-02` | 2026-06-02 | Legacy 12 absent names |
| scenario-2026-06-03-female-first.xlsx | `2026-06-03` | 2026-06-03 | Legacy female-first stress |

**Recommended path:** Use **2026-06-12** + `gtpl-12-6-26-baseline.xlsx` for the main demo.

---

## Scenario 1 — GTPL baseline (2026-06-12)

**File:** `gtpl-12-6-26-baseline.xlsx` → sheet **`12-6-26`**

### Steps

1. `npm run seed:12june`
2. Admin → Transport → Optimization → date **2026-06-12**
3. Click **Optimize Routing** → wait for preview (no 400 errors in terminal)
4. Map filter **All Shifts (N routes)** — all route paths visible
5. Click a shift header in manifest → map filters to that shift
6. **Compare** → upload same file → sheet `12-6-26` → **Save baseline**

### Expected

| Metric | Value |
|--------|-------|
| GTPL routes | 17 |
| Present (manifest YES) | ~131 rows / ~64 unique |
| DB absent leaves | 6 |
| App violations | 0 (female-first enforced) |
| Excel violations in Compare | 7 |
| Map routes (all shifts) | ~11–15 optimized routes across 5 shifts |

---

## Scenario 2 — High absence (2026-06-14)

**File:** `test-scenario-B.xlsx` → sheet **`14-6-26`**

### Steps

1. Set date **2026-06-14**
2. Upload `test-scenario-B.xlsx` in Compare or Manual Routing → **Save baseline**
3. Absent codes flow to optimizer automatically
4. Run **Optimize Routing**
5. Compare: Excel no-show ≈ 15, cabs reduced vs Scenario A

### Expected

- Fewer active employees than baseline
- Fewer cabs in preview banner
- `absentEmployeeCodes` applied from parse response

---

## Scenario 3 — Baseline copy on 14-June (2026-06-14)

**File:** `test-scenario-A.xlsx` → sheet **`14-6-26`**

Same roster as 12-June but dated 14-June. Use to verify date inference (`14-6-26` → 2026-06-14) and Excel filter without re-seeding.

---

## Scenario 4 — Female-first stress (2026-06-16)

**File:** `test-scenario-C.xlsx` → sheet **`16-6-26`**

Upload → optimize → Compare first pickup gender: Excel may violate, app must not.

---

## Marking absent via API (edge cases)

### Single employee leave (DB)

```http
POST /api/leaves
Content-Type: application/json

{
  "startDate": "2026-06-12",
  "endDate": "2026-06-12",
  "comments": "Test absence"
}
```

Then approve via `PATCH /api/leaves/{id}` with `{ "status": "APPROVED" }`.

### Excel overlay (no DB leave)

Upload scenario B in Compare → **Save baseline** — `absentEmployeeCodes` syncs to the store and is sent on every optimize call.

### Heavy absence (≥5 on one route)

Use `test-scenario-B.xlsx`. Parse API returns `routesWithHeavyAbsence` for routes with 5+ NO SHOW. Optimizer runs `consolidateUnderfilled()` to release empty cabs.

---

## Map & filter checklist

After **Optimize Routing**:

- [ ] Manifest table shows routes grouped by shift (05:00, 07:00, …)
- [ ] Map dropdown shows **All Shifts (N routes)** with correct N
- [ ] Clicking shift header filters map + manifest together
- [ ] Clicking a route path on map shows manifest sidebar (not "No Path Selected")
- [ ] Compare modal: both maps show all routes for selected shift filter
- [ ] Compare manifest lists: click route → highlights on map

---

## Terminal — what is normal vs a bug

| Log | Normal? |
|-----|---------|
| `Excel Filter for 2026-06-12 (12-6-26): Found 64 names, 8 cab plates` | ✅ Yes — only 8 MH plates in sheet; fleet tops up from DB |
| `shift skipped / no_employees` | ✅ Yes — empty shifts (e.g. 08:00 protected) skip quietly |
| `Fleet sized: N of M cabs` with N > 0 | ✅ Optimization succeeded for that shift |
| `POST /api/optimization 400` | ❌ Should not happen in preview mode anymore |
| `POST /api/optimization 403` | ✅ Only for protected shift-0800 |

---

## Verification commands

```bash
npx tsc --noEmit
npm run verify
npm run test:scenarios
npm run seed:12june
```

---

## Actual results (fill when testing)

| Scenario | Date | Routes | Cabs | Notes |
|----------|------|--------|------|-------|
| GTPL baseline | 2026-06-12 | | | |
| High absence B | 2026-06-14 | | | |
| Female-first C | 2026-06-16 | | | |
