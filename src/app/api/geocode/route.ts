import { NextRequest, NextResponse } from "next/server";

type NominatimResult = {
 display_name?: string;
 class?: string;
 type?: string;
};

function isAirportVenueIntent(value: string) {
 const text = value.toLowerCase();
 return /\b(airport|terminal|aerodrome)\b/.test(text) && !/\bairport\s+road\b/.test(text);
}

function isAirportLike(result: NominatimResult) {
 const text = `${result.display_name ?? ""} ${result.class ?? ""} ${result.type ?? ""}`.toLowerCase();
 return /\b(airport|aerodrome|terminal|runway|aeroway)\b/.test(text);
}

export async function GET(req: NextRequest) {
 try {
 const { searchParams } = new URL(req.url);
 const q = searchParams.get("q");

 if (!q) {
 return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
 }

 const res = await fetch(
 `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(q)}`,
 {
 headers: {
 "User-Agent": "TransitAdminPOC/1.0",
 "Accept-Language": "en-US,en;q=0.9",
 },
 }
 );

 if (!res.ok) {
 return NextResponse.json({ error: "Failed to fetch from Nominatim" }, { status: res.status });
 }

 const data = await res.json();
 const filtered = Array.isArray(data)
 ? data.filter((item: NominatimResult) => isAirportVenueIntent(q) || !isAirportLike(item)).slice(0, 5)
 : [];
 return NextResponse.json(filtered);
 } catch (e: any) {
 console.error("Geocoding API error:", e);
 return NextResponse.json({ error: "Internal Server Error", details: e.message }, { status: 500 });
 }
}
