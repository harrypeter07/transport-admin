"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, MapPin } from "lucide-react";

interface LocationResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  location_type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    street?: string;
    streetNumber?: string;
    pincode?: string;
  };
}

interface LocationAutocompleteProps {
  name?: string;
  id?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  onSelect?: (location: {
    lat: number;
    lon: number;
    city: string;
    country: string;
    displayName: string;
    placeId?: string;
    street?: string;
    pincode?: string;
    locationType?: string;
  }) => void;
}

export default function LocationAutocomplete({
  name,
  id,
  defaultValue = "",
  placeholder = "Search location...",
  required = false,
  className = "",
  onSelect,
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [placesLoaded, setPlacesLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const placesServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (typeof google !== "undefined" && google.maps?.places?.AutocompleteService) {
      placesServiceRef.current = new google.maps.places.AutocompleteService();
      setPlacesLoaded(true);
    } else {
      const checkInterval = setInterval(() => {
        if (typeof google !== "undefined" && google.maps?.places?.AutocompleteService) {
          placesServiceRef.current = new google.maps.places.AutocompleteService();
          setPlacesLoaded(true);
          clearInterval(checkInterval);
        }
      }, 1000);
      setTimeout(() => clearInterval(checkInterval), 15000);
      return () => clearInterval(checkInterval);
    }
  }, []);

  const searchLocation = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);

    if (placesLoaded && placesServiceRef.current) {
      try {
        const predictions = await new Promise<google.maps.places.QueryAutocompletePrediction[]>((resolve, reject) => {
          placesServiceRef.current!.getQueryPredictions(
            { input: `${searchQuery}, India` },
            (results, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                resolve(results);
              } else {
                reject(new Error(`Places status: ${status}`));
              }
            }
          );
        });

        const mapped: LocationResult[] = predictions.map((p) => ({
          place_id: p.place_id || "",
          display_name: p.description,
          lat: "",
          lon: "",
          location_type: "",
        }));
        setResults(mapped);
        setShowDropdown(true);
      } catch {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setShowDropdown(true);
        }
      }
    } else {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setShowDropdown(true);
        }
      } catch (e) {
        console.error("Geocoding fetch error:", e);
      }
    }
    setLoading(false);
  }, [placesLoaded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => searchLocation(val), 500);
  };

  const resolvePlaceDetails = async (item: LocationResult): Promise<{
    lat: number; lon: number; city: string; country: string;
    displayName: string; placeId?: string; street?: string; pincode?: string; locationType?: string;
  }> => {
    if (item.lat && item.lon) {
      const cityName = item.address?.city || item.address?.town || item.address?.village || "";
      return {
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        city: cityName,
        country: item.address?.country || "",
        displayName: item.display_name,
        placeId: item.place_id,
        street: item.address?.street,
        pincode: item.address?.pincode,
        locationType: item.location_type,
      };
    }

    if (typeof google !== "undefined" && google.maps?.places?.PlacesService && item.place_id) {
      const dummyDiv = document.createElement("div");
      const service = new google.maps.places.PlacesService(dummyDiv);
      try {
        const details = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
          service.getDetails(
            { placeId: item.place_id, fields: ["geometry", "address_components", "formatted_address"] },
            (result, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && result) {
                resolve(result);
              } else {
                reject(new Error(`Place details status: ${status}`));
              }
            }
          );
        });

        const components = details.address_components || [];
        const findComp = (type: string) => components.find((c) => c.types.includes(type))?.long_name || "";

        let locationType: string | undefined;
        if (details.geometry) {
          locationType = (details.geometry as { location_type?: string }).location_type;
        }

        return {
          lat: details.geometry?.location?.lat() || 0,
          lon: details.geometry?.location?.lng() || 0,
          city: findComp("locality") || findComp("sublocality") || findComp("administrative_area_level_2"),
          country: findComp("country"),
          displayName: details.formatted_address || item.display_name,
          placeId: item.place_id,
          street: findComp("route"),
          pincode: findComp("postal_code"),
          locationType,
        };
      } catch {
        // fall through
      }
    }

    const res = await fetch(`/api/geocode?q=${encodeURIComponent(item.display_name)}`);
    if (res.ok) {
      const data = await res.json();
      const first = data?.[0];
      if (first) {
        const cityName = first.address?.city || first.address?.town || first.address?.village || "";
        return {
          lat: parseFloat(first.lat),
          lon: parseFloat(first.lon),
          city: cityName,
          country: first.address?.country || "",
          displayName: first.display_name,
          placeId: first.place_id,
          street: first.address?.street,
          pincode: first.address?.pincode,
          locationType: first.location_type,
        };
      }
    }
    return { lat: 0, lon: 0, city: "", country: "", displayName: item.display_name };
  };

  const handleSelect = async (item: LocationResult) => {
    setQuery(item.display_name);
    setShowDropdown(false);
    setLoading(true);
    const location = await resolvePlaceDetails(item);
    setLoading(false);
    if (onSelect) onSelect(location);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          id={id}
          name={name}
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          required={required}
          className={className}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin-fast text-[#9a9a9a]" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <ul className="absolute z-[100] w-full mt-1 bg-white border border-[#e8e8e8] rounded-none shadow-sm max-h-60 overflow-y-auto divide-y divide-slate-50">
          {results.map((item) => {
            const precisionLabel = item.location_type === "ROOFTOP" ? "Exact"
              : item.location_type === "RANGE_INTERPOLATED" ? "Approx"
              : item.location_type === "GEOMETRIC_CENTER" ? "Area"
              : item.location_type === "APPROXIMATE" ? "Rough"
              : null;
            const precisionColor = item.location_type === "ROOFTOP" ? "bg-emerald-100 text-emerald-700"
              : item.location_type === "RANGE_INTERPOLATED" ? "bg-blue-100 text-blue-700"
              : item.location_type === "GEOMETRIC_CENTER" ? "bg-amber-100 text-amber-700"
              : item.location_type === "APPROXIMATE" ? "bg-red-100 text-red-700"
              : "";
            return (
              <li
                key={item.place_id}
                onClick={() => handleSelect(item)}
                className="px-4 py-2.5 hover:bg-[#f7f7f7] cursor-pointer flex items-start gap-2.5 transition"
              >
                <MapPin className="w-4 h-4 text-[#9a9a9a] mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#4a4a4a] font-medium leading-tight line-clamp-2">
                    {item.display_name}
                  </div>
                  {precisionLabel && (
                    <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 leading-none font-medium ${precisionColor}`}>
                      {precisionLabel}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
