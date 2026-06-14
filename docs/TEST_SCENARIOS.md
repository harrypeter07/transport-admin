# ETMS Test Scenarios — Excel Comparison & Manifest

Test workbooks live in [`data/test-rosters/`](../data/test-rosters/). Generate or refresh them with:

```bash
npm run build:scenarios
npm run seed:excel
```

Coordinates: **x = longitude**, **y = latitude**. Depot: **21.0625, 79.0526** (MIHAN Nagpur).

---

## Scenario A — Baseline parity (`2026-06-01`)

**Workbook:** `scenario-2026-06-01-baseline.xlsx` (sheet `2026-06-01`)

### Steps

1. Run `npm run seed:excel` to sync employees and cabs from roster/JSON.
2. Admin → Transport → Optimization → set date **2026-06-01**.
3. Run **Preview** (pickup, BALANCED strategy).
4. Open **Compare** → upload workbook → select sheet **2026-06-01** → **Save baseline**.

### Expected

| Metric | Expected |
|--------|----------|
| Unmatched employee codes | **0** after seed |
| Active employees (app) | ~**53–65** (depends on shift filter) |
| Manual routes (Excel) | ~**12** pickup routes in generated scenario file |
| App cab count | `ceil(active / 6)` ≈ **9–11** |
| App `FEMALE_FIRST_PICKUP` violations | **0** |
| Distance vs manual | Within ~**15%** (OSRM vs haversine Excel) |
| Per-route employee overlap | Flag routes with **<50%** same employees as manual |

---

## Scenario B — High absence (`2026-06-02`)

**Workbook:** `scenario-2026-06-02-high-absence.xlsx` (sheet `2026-06-02`)

**Setup:** 12 employees marked **NO SHOW** in Excel:

`CHEPARTHI-VASANTHI`, `ANIMA-DIXIT`, `MEGHANA-U`, `AKANSHA-KHODE`, `PULIPATI-KRISHNA`, `PRABHAT-PRIYDARSHI`, `2577398`, `Shubhankar-Das`, `2577282`, `2576690`, `SEJAL-SHAHARE`, `GEETA-RAJPUT`

### Steps

1. In app: create **approved leave requests** for the same 12 employees on **2026-06-02** (optional but recommended for DB parity).
2. Upload scenario B in Manual Routing desk → note absent codes applied to optimizer via `absentEmployeeCodes`.
3. Run optimization preview for **2026-06-02**.
4. CompareModal: upload same sheet, save baseline, compare.

### Expected

| Metric | Expected |
|--------|----------|
| Excel no-show count | **12** |
| Optimizer active count | Total − 12 (minus any DB leaves) |
| Active cabs | `ceil(active / 6)` — roughly **7** if ~41 active (vs ~9 full day) |
| CompareModal chips | Excel absent ≈ DB leaves when both configured |
| `capacityShortfall` | **0** |

---

## Scenario C — Female-first pickup (`2026-06-03`)

**Workbook:** `scenario-2026-06-03-female-first.xlsx` (sheet `2026-06-03`)

Manual sheet lists a **female first** on a mixed-gender cab (route P1).

### Steps

1. Run app optimization for **2026-06-03** (same employee set).
2. Upload manual sheet → Compare.
3. Inspect first pickup stop gender on manual vs app for route P1.

### Expected

| Side | Expected |
|------|----------|
| Manual (Excel) | May show **FEMALE_FIRST_PICKUP** on affected route |
| App | First pickup = **nearest male** to depot; **no** `FEMALE_FIRST_PICKUP` |
| Stop order | Distance-based after male-first constraint |

---

## Scenario D — Manifest drag-and-drop

### Steps

1. Publish or preview routes with **≥2 cabs** at partial capacity.
2. In manifest panel, use **Drag employees between routes**.
3. Drag employee from Cab A (e.g. 4/6) to Cab B at **6/6** → should **block** (409).
4. Drag to Cab C (e.g. 3/6) → should **succeed**; stops re-ordered by distance.

### Expected

| Action | HTTP / UI |
|--------|-----------|
| Capacity exceed | **409** + toast message |
| Safety violation (isolated female) | **422** + snap back |
| Valid move | Both routes persist; map updates |

---

## Verification commands

```bash
npx tsc --noEmit
npm run verify
```

Manual checklist after each scenario: record actual cab count, active employees, and CompareModal metrics in this file under **Actual results** when testing.

---

## Actual results (fill when testing)

| Scenario | Date tested | Active employees | Cabs | Notes |
|----------|-------------|------------------|------|-------|
| A | | | | |
| B | | | | |
| C | | | | |
| D | | | | |
