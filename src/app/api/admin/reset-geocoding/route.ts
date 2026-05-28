import { NextResponse } from "next/server";
import { resetOSMCircuitBreaker } from "@/lib/optimization";

export async function POST() {
  resetOSMCircuitBreaker();
  return NextResponse.json({ success: true, message: "OSM Geocoding Circuit Breaker reset successfully" });
}
