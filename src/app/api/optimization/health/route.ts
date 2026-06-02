import { NextResponse } from "next/server";
import { mapsProvider } from "@/lib/maps";
import { requireApiRole } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({
        status: "MISSING_KEY",
        message: "GOOGLE_MAPS_API_KEY is not configured",
      });
    }

    // Test with a simple 2-point matrix call using Nagpur depot coords
    const testPoints = [
      { x: 79.0526, y: 21.0625 },
      { x: 79.0882, y: 21.1458 },
    ];

    const startTime = Date.now();
    const result = await mapsProvider.computeMatrix(testPoints, apiKey);
    const elapsedMs = Date.now() - startTime;

    if (!result) {
      return NextResponse.json({
        status: "API_ERROR",
        message: "Google Routes Matrix API returned null — check API key validity and billing",
        elapsedMs,
      });
    }

    const dist = result.distanceMatrix[0][1];
    const dur = result.durationMatrix[0][1];

    return NextResponse.json({
      status: "OK",
      message: "Google Routes Matrix API is reachable and returning data",
      elapsedMs,
      testResult: {
        distanceKm: dist,
        durationMin: dur,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { status: "ERROR", message },
      { status: 500 }
    );
  }
}
