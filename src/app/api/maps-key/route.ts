import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY || "";
    return NextResponse.json({ key });
  } catch (e) {
    console.error("[api] ❌ GET /maps-key", { ip }, e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
