export const dynamic = "force-dynamic";
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
    } catch (err) {
      errorMsg = err instanceof DOMException && err.name === "AbortError" ? "timeout (5s)" : err instanceof Error ? err.message : "Unknown error";
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
