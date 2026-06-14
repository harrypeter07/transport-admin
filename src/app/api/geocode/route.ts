export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

function extractAddressComponent(
  components: { types: string[]; long_name: string; short_name: string }[],
  type: string
): string {
  return components.find((c) => c.types.includes(type))?.long_name || "";
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";

    if (!q) {
      return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Google Maps API key not configured" }, { status: 500 });
    }

    const address = q.toLowerCase().includes("nagpur") ? q : `${q}, Nagpur, India`;
    const params = new URLSearchParams({
      address,
      region: "in",
      components: "country:IN",
      key: apiKey,
    });

    console.log("[MAPS API] Geocoding API called", { timestamp: new Date().toISOString(), query: q });

    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      headers: { "Accept-Language": "en" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Geocoding API request failed" }, { status: res.status });
    }

    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json({ error: `Geocoding API error: ${data.status}` }, { status: 500 });
    }

    const results = (data.results || []).slice(0, 5).map((place: {
      place_id?: string;
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
      address_components?: { types: string[]; long_name: string; short_name: string }[];
    }) => {
      const components = place.address_components || [];
      return {
        place_id: place.place_id || "",
        display_name: place.formatted_address || q,
        lat: String(place.geometry?.location?.lat ?? ""),
        lon: String(place.geometry?.location?.lng ?? ""),
        location_type: place.geometry?.location_type || "",
        address: {
          city:
            extractAddressComponent(components, "locality") ||
            extractAddressComponent(components, "sublocality") ||
            extractAddressComponent(components, "administrative_area_level_3") ||
            extractAddressComponent(components, "administrative_area_level_2"),
          town: extractAddressComponent(components, "locality"),
          village: extractAddressComponent(components, "sublocality"),
          state: extractAddressComponent(components, "administrative_area_level_1"),
          country: extractAddressComponent(components, "country"),
          street: extractAddressComponent(components, "route"),
          streetNumber: extractAddressComponent(components, "street_number"),
          pincode: extractAddressComponent(components, "postal_code"),
        },
      };
    });

    return NextResponse.json(results);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ GET /geocode", { ip }, e);
    return NextResponse.json({ error: "Internal Server Error", details: message }, { status: 500 });
  }
}
