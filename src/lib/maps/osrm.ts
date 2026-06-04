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
