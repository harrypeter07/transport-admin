import { NextRequest, NextResponse } from "next/server";

function extractAddressComponent(
  components: { types: string[]; long_name: string; short_name: string }[],
  type: string
): string {
  return components.find((c) => c.types.includes(type))?.long_name || "";
}

export async function GET(req: NextRequest) {
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

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${apiKey}&region=in&components=country:IN`,
      { headers: { "Accept-Language": "en" } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Google Places API request failed" }, { status: res.status });
    }

    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json({ error: `Google Places API error: ${data.status}` }, { status: 500 });
    }

    const results = (data.results || []).slice(0, 5).map((place: any) => {
      const components = place.address_components || [];
      return {
        place_id: place.place_id,
        display_name: place.formatted_address || place.name || "",
        lat: String(place.geometry?.location?.lat ?? ""),
        lon: String(place.geometry?.location?.lng ?? ""),
        location_type: place.geometry?.location_type || "",
        address: {
          city: extractAddressComponent(components, "locality") ||
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
  } catch (e: any) {
    console.error("Geocoding API error:", e);
    return NextResponse.json({ error: "Internal Server Error", details: e.message }, { status: 500 });
  }
}
