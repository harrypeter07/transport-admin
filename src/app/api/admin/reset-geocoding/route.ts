import { NextResponse } from "next/server";
import { resetOSMCircuitBreaker } from "@/lib/optimization";
import { requireApiRole } from "@/lib/apiAuth";

export async function POST() {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 resetOSMCircuitBreaker();
 return NextResponse.json({ success: true, message: "OSM Geocoding Circuit Breaker reset successfully" });
}
