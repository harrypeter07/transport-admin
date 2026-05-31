"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, MapPin } from "lucide-react";

interface LocationResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchLocation = async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setShowDropdown(true);
      }
    } catch (e) {
      console.error("Geocoding fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      searchLocation(val);
    }, 500);
  };

  const handleSelect = (item: LocationResult) => {
    const cityName = item.address?.city || item.address?.town || item.address?.village || "";
    const countryName = item.address?.country || "";

    setQuery(item.display_name);
    setShowDropdown(false);

    if (onSelect) {
      onSelect({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        city: cityName,
        country: countryName,
        displayName: item.display_name,
      });
    }
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
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          required={required}
          className={className}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin-fast text-slate-400" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <ul className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-50">
          {results.map((item) => (
            <li
              key={item.place_id}
              onClick={() => handleSelect(item)}
              className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex items-start gap-2.5 transition"
            >
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-slate-700 font-medium leading-tight line-clamp-2">
                {item.display_name}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
