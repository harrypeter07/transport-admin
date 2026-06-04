# OSRM Migration — Implementation Plan

## Files Changed (6 total)

| Action | File | Lines |
|--------|------|-------|
| **CREATE** | `src/lib/maps/osrm.ts` | +70 |
| **MODIFY** | `src/lib/optimization.ts` | ~25 |
| **MODIFY** | `src/app/api/optimization/health/route.ts` | ~55 |
| **MODIFY** | `src/lib/maps/googleMaps.ts` | -85 (remove RouteMatrixResult + computeGoogleRouteMatrix) |
| **MODIFY** | `src/lib/maps/provider.ts` | -5 (remove import, interface method, implementation) |
| **MODIFY** | `src/lib/maps/index.ts` | -1 (remove RouteMatrixResult export) |

---

## 1. CREATE `src/lib/maps/osrm.ts`

```ts
import { getSessionCache, setSessionCache } from "@/lib/sessionCache";

export interface OsrmMatrixResult {
  distanceMatrix: number[][];
  durationMatrix: number[][];
  usingFallback: boolean;
}

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const TIMEOUT_MS = 5000;

export async function computeOsrmRouteMatrix(
  points: { x: number; y: number }[]
): Promise<OsrmMatrixResult | null> {
  const n = points.length;
  if (n === 0) return { distanceMatrix: [], durationMatrix: [], usingFallback: false };
  if (n === 1) return { distanceMatrix: [[0]], durationMatrix: [[0]], usingFallback: false };

  const coords = points.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(";");
  const url = `${OSRM_BASE_URL}/table/v1/driving/${coords}?annotations=duration,distance`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const t0 = performance.now();
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    const elapsed = Math.round(performance.now() - t0);

    if (!res.ok) {
      console.warn(`[osrm] HTTP ${res.status} (${elapsed}ms)`);
      return null;
    }

    const data = await res.json();
    if (data?.code !== "Ok" || !Array.isArray(data?.durations) || !Array.isArray(data?.distances)) {
      console.warn(`[osrm] Bad response code=${data?.code} (${elapsed}ms)`);
      return null;
    }

    const distanceMatrix: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        i === j ? 0 : Math.round((data.distances[i][j] / 1000) * 10) / 10
      )
    );

    const durationMatrix: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        i === j ? 0 : Math.max(1, Math.round(data.durations[i][j] / 60))
      )
    );

    console.info(`[matrix] PROVIDER=osrm POINTS=${n} ELEMENTS=${n * n - n} TIME_MS=${elapsed} CACHE_HIT=false`);
    return { distanceMatrix, durationMatrix, usingFallback: false };
  } catch (err: unknown) {
    const reason = err instanceof DOMException && err.name === "AbortError"
      ? "osrm_timeout"
      : "osrm_error";
    console.warn(`[matrix] PROVIDER=haversine REASON=${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

---

## 2. MODIFY `src/lib/optimization.ts`

### Line 3 — add import:
```ts
import { computeOsrmRouteMatrix } from "@/lib/maps/osrm";
```

### Lines 1382-1423 — replace `fetchGoogleMapsMatrix`:
Old body: cache (apiKey-gated) → Google Matrix → Haversine (uncached)
New body: cache (always) → OSRM → Haversine (cached, 30 min)

```ts
export async function fetchGoogleMapsMatrix(
  points: Point[],
  _apiKey: string
): Promise<{ distanceMatrix: number[][]; durationMatrix: number[][]; usingFallback: boolean }> {
  const n = points.length;
  if (n === 0) return { distanceMatrix: [], durationMatrix: [], usingFallback: false };

  const cacheKey = `matrix_v2:${points.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join("|")}`;
  const cached = getSessionCache<{ dist: number[][]; dur: number[][] }>(cacheKey);
  if (cached) {
    console.info(`[matrix] CACHE_HIT POINTS=${n}`);
    return { distanceMatrix: cached.dist, durationMatrix: cached.dur, usingFallback: false };
  }

  const providerConfig = (process.env.ROUTING_PROVIDER || "auto").toLowerCase();
  const useOsrm = providerConfig === "auto" || providerConfig === "osrm";

  if (useOsrm) {
    const osrmResult = await computeOsrmRouteMatrix(points);
    if (osrmResult) {
      setSessionCache(cacheKey, { dist: osrmResult.distanceMatrix, dur: osrmResult.durationMatrix }, 30 * 60 * 1000);
      return { ...osrmResult };
    }
  }

  console.info(`[matrix] PROVIDER=haversine POINTS=${n} REASON=${useOsrm ? "osrm_failed" : "config_direct"}`);
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
  setSessionCache(cacheKey, { dist: distanceMatrix, dur: durationMatrix }, 30 * 60 * 1000);
  return { distanceMatrix, durationMatrix, usingFallback: true };
}
```

**Key differences from old:**
- `_apiKey` renamed with underscore (kept for backward compat, unused)
- Cache key uses `matrix_v2:` prefix (was `matrix:{apiKey.slice(-8)}:`)
- Cache checked unconditionally (was gated on `apiKey`)
- Google Matrix call removed entirely
- OSRM call added, gated by `ROUTING_PROVIDER` env var
- Haversine result now cached (was uncached)
- TTL 30 min (was 5 min)

---

## 3. MODIFY `src/app/api/optimization/health/route.ts`

Replace entire file. Reports both OSRM and Google status:

```ts
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const osrmBaseUrl = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
    const provider = process.env.ROUTING_PROVIDER || "auto";
    const googleKey = process.env.GOOGLE_MAPS_API_KEY || "";

    const testPoints = [
      { x: 79.0526, y: 21.0625 },
      { x: 79.0882, y: 21.1458 },
    ];
    const coords = testPoints.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(";");
    const url = `${osrmBaseUrl}/table/v1/driving/${coords}?annotations=duration,distance`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const startTime = Date.now();

    let osrmOk = false;
    let errorMsg = "";
    let testResult = null;

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.code === "Ok" && Array.isArray(data.distances) && Array.isArray(data.durations)) {
          osrmOk = true;
          testResult = {
            distanceKm: Math.round((data.distances[0][1] / 1000) * 10) / 10,
            durationMin: Math.max(1, Math.round(data.durations[0][1] / 60)),
          };
        } else {
          errorMsg = `OSRM returned code: ${data.code}`;
        }
      } else {
        errorMsg = `HTTP ${res.status}`;
      }
    } catch (err: any) {
      errorMsg = err.name === "AbortError" ? "timeout (5s)" : err.message;
    } finally {
      clearTimeout(timeoutId);
    }

    const elapsedMs = Date.now() - startTime;

    if (!osrmOk) {
      return NextResponse.json({
        status: "API_ERROR",
        message: `OSRM Table API test failed: ${errorMsg}`,
        elapsedMs,
        provider,
        googleMapsKeyConfigured: !!googleKey,
      });
    }

    return NextResponse.json({
      status: "OK",
      message: "OSRM Table API is reachable and returning data",
      elapsedMs,
      provider,
      googleMapsKeyConfigured: !!googleKey,
      testResult,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ status: "ERROR", message }, { status: 500 });
  }
}
```

**Response shape:**
```json
{
  "status": "OK",
  "message": "OSRM Table API is reachable and returning data",
  "elapsedMs": 382,
  "provider": "auto",
  "googleMapsKeyConfigured": true,
  "testResult": {
    "distanceKm": 10.5,
    "durationMin": 15
  }
}
```

---

## 4. MODIFY `src/lib/maps/googleMaps.ts`

Remove:
- Lines 13-16: `RouteMatrixResult` type definition
- Lines 144-250: `MAX_BATCH_SIZE` constant + `computeGoogleRouteMatrix()` function

After removal, the file contains:
- `MapPoint` type
- `RouteGeometryResult` type (KEPT — used by route display)
- Helper functions: `pointToLatLng`, `pointToWaypoint`, `parseGoogleDurationSeconds`, `decodeGooglePolyline`
- `computeGoogleRoute()` (KEPT — used for route polyline display)

---

## 5. MODIFY `src/lib/maps/provider.ts`

### Remove from imports (line 3, line 6):
```ts
// OLD:
import {
  computeGoogleRoute,
  computeGoogleRouteMatrix,   // ← REMOVE
  type MapPoint,
  type RouteGeometryResult,
  type RouteMatrixResult,     // ← REMOVE
} from "@/lib/maps/googleMaps";

// NEW:
import {
  computeGoogleRoute,
  type MapPoint,
  type RouteGeometryResult,
} from "@/lib/maps/googleMaps";
```

### Remove from MapsProvider interface (line 32):
```ts
// OLD:
export interface MapsProvider {
  computeRouteGeometry(points: MapPoint[], apiKey: string): Promise<RouteGeometryResult | null>;
  computeMatrix(points: MapPoint[], apiKey: string): Promise<RouteMatrixResult | null>;  // ← REMOVE
  // ...
}

// NEW:
export interface MapsProvider {
  computeRouteGeometry(points: MapPoint[], apiKey: string): Promise<RouteGeometryResult | null>;
  // ...
}
```

### Remove from class implementation (lines 196-198):
```ts
// REMOVE entire method:
  async computeMatrix(points: MapPoint[], apiKey: string) {
    return computeGoogleRouteMatrix(points, apiKey);
  }
```

---

## 6. MODIFY `src/lib/maps/index.ts`

```diff
- export type { MapPoint, RouteGeometryResult, RouteMatrixResult } from "./googleMaps";
+ export type { MapPoint, RouteGeometryResult } from "./googleMaps";
```

---

## Environment Variables

Add to `.env.local` and document in `.env.example`:

```
ROUTING_PROVIDER=auto
OSRM_BASE_URL=https://router.project-osrm.org
```

Future self-hosted: `OSRM_BASE_URL=http://localhost:5000` — no code changes needed.

---

## Verification Steps

1. `npm run typecheck` — no TypeScript/ESLint errors
2. `GET /api/optimization/health` — returns OSRM status + googleMapsKeyConfigured
3. `ROUTING_PROVIDER=osrm` — optimization, variation picker, reorder, apply sequence all work
4. `ROUTING_PROVIDER=haversine` — same workflows work
5. `ROUTING_PROVIDER=auto` — OSRM succeeds, routes generated with `[matrix] PROVIDER=osrm` logs
6. Simulate OSRM failure → `[matrix] PROVIDER=haversine REASON=osrm_failed` → routes still generated
7. Cache: second run with same points → `[matrix] CACHE_HIT`
8. `grep -r "computeMatrix\|computeGoogleRouteMatrix" src/` — should return **no matches** in non-plan files

---

## Rollback

```sh
ROUTING_PROVIDER=haversine  # immediate, no code revert, uses Haversine only

# Full revert:
git checkout src/lib/optimization.ts
git checkout src/lib/maps/googleMaps.ts
git checkout src/lib/maps/provider.ts
git checkout src/lib/maps/index.ts
git checkout src/app/api/optimization/health/route.ts
rm src/lib/maps/osrm.ts
```

Total revert: < 2 minutes. Zero DB changes, zero schema changes, zero state.
