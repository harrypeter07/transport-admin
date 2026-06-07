"use client";

import React, { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Route } from "@/store/useTransportStore";

const STRATEGY_COLORS: Record<string, string> = {
  DISTANCE: "#ef4444",
  TIME: "#3b82f6",
  BALANCED: "#8b5cf6",
  NORMAL: "#64748b",
};

// Shift-color palette — distinct vivid colors
const SHIFT_PALETTE = [
  "#3b82f6", // blue
  "#f97316", // orange
  "#8b5cf6", // purple
  "#10b981", // green
  "#ec4899", // pink
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#f43f5e", // rose
  "#84cc16", // lime
  "#d946ef", // fuchsia
  "#ef4444", // red
  "#64748b", // slate
];

// Module-level cache to ensure stable and unique colors across the session
const shiftColorCache = new Map<string, string>();
let nextColorIdx = 0;

/** Returns a stable shiftId → color map built from the routes currently rendered */
function buildShiftColorMap(routes: Route[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of routes) {
    if (r.shiftId) {
      if (!shiftColorCache.has(r.shiftId)) {
        shiftColorCache.set(r.shiftId, SHIFT_PALETTE[nextColorIdx % SHIFT_PALETTE.length]);
        nextColorIdx++;
      }
      map.set(r.shiftId, shiftColorCache.get(r.shiftId)!);
    }
  }
  return map;
}

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", stylers: [{ color: "#f2eee9" }] },
  { featureType: "landscape.natural.landcover", stylers: [{ color: "#e8e0d5" }] },
  { featureType: "landscape.natural.terrain", stylers: [{ color: "#e8e0d5" }] },
  { featureType: "poi.park", stylers: [{ color: "#d4e5c8", visibility: "on" }] },
  { featureType: "water", stylers: [{ color: "#c8e0f0" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#f7d9c4" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e8c8b0" }] },
  { featureType: "road.highway", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#f5f3f0" }] },
  { featureType: "road.local", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.locality", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
];

function svgToUri(svg: string): string {
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function depotSvg(size: number): string {
  const s = size;
  return svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <rect width="${s}" height="${s}" rx="${s * 0.15}" fill="#1c1b1f" stroke="#ffffff" stroke-width="2.5"/>
      <text x="${s / 2}" y="${s / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="${s * 0.45}">⚑</text>
    </svg>
  `);
}

function employeeSvg(size: number, label: string, color: string, gender: string, isSelected: boolean, opacity = 1, isHighlighted = false): string {
  const stroke = isSelected ? "#ffffff" : "transparent";
  const strokeW = isSelected ? "2" : "0";
  const isFemale = gender === "F";
  const innerR = size / 2 - (isHighlighted ? 3 : 1);
  const shape = isFemale
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${innerR}" fill="${color}" stroke="${stroke}" stroke-width="${strokeW}"/>`
    : `<rect x="${isHighlighted ? 3 : 0}" y="${isHighlighted ? 3 : 0}" width="${size - (isHighlighted ? 6 : 0)}" height="${size - (isHighlighted ? 6 : 0)}" rx="${(size - (isHighlighted ? 6 : 0)) * 0.2}" fill="${color}" stroke="${stroke}" stroke-width="${strokeW}"/>`;
  const ring = isHighlighted
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 0.5}" fill="none" stroke="#ff4f00" stroke-width="2.5" opacity="0.9"/>`
    : '';
  return svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" opacity="${opacity}">
      ${ring}
      ${shape}
      <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="${Math.max(size * 0.38, 8)}" font-weight="900" font-family="sans-serif">${label}</text>
    </svg>
  `);
}

function driverStartSvg(size: number, color: string): string {
  return svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 5}" fill="#1c1b1f"/>
      <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="${size * 0.4}" font-weight="900" font-family="sans-serif">⌂</text>
    </svg>
  `);
}

interface GoogleMapViewProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
  mode?: "OPTIMIZER" | "ANALYTICS";
  analysisData?: any;
  depotLat?: number;
  depotLng?: number;
  depotName?: string;
  apiKey: string;
  routeViewModes?: Record<string, "pickup" | "drop">;
  selectedEmployeeId?: string | null;
  onSelectEmployee?: (id: string | null) => void;
  canonicalSequences?: Record<string, string[]>;
}

export default function GoogleMapView({
  routes,
  selectedRouteId,
  onSelectRoute,
  mode = "OPTIMIZER",
  analysisData,
  depotLat = 21.0625,
  depotLng = 79.0526,
  depotName = "Depot",
  apiKey,
  routeViewModes,
  selectedEmployeeId,
  onSelectEmployee,
  canonicalSequences,
}: GoogleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const lastFitKeyRef = useRef<string>("");

  const [mapReady, setMapReady] = useState(false);
  const [variationsData, setVariationsData] = useState<any[]>([]);

  const isWithinBounds = (lat: number, lng: number) =>
    lat >= depotLat - 1.0 && lat <= depotLat + 1.0 && lng >= depotLng - 1.0 && lng <= depotLng + 1.0;

  const isDepotLatLng = (lat: number, lng: number) =>
    Math.abs(lat - depotLat) < 0.00001 && Math.abs(lng - depotLng) < 0.00001;

  const isAirportVenueIntent = (value: string) => {
    const text = value.toLowerCase();
    return /\b(airport|terminal|aerodrome)\b/.test(text) && !/\bairport\s+road\b/.test(text);
  };

  const isNearNagpurAirport = (lat: number, lng: number) => {
    const airportLat = 21.0922;
    const airportLng = 79.0472;
    const latKm = (lat - airportLat) * 111;
    const lngKm = (lng - airportLng) * 103;
    return Math.sqrt(latKm * latKm + lngKm * lngKm) < 0.5;
  };

  const hasPreciseDriverStart = (route: Route) => {
    const cab = route.cab;
    const address = cab?.driverAddress?.trim() ?? "";
    if ((route.tripSequence || 1) > 1 || !address) return false;
    if (typeof cab?.driverX !== "number" || typeof cab?.driverY !== "number") return false;
    const lat = cab.driverY;
    const lng = cab.driverX;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (!isWithinBounds(lat, lng) || isDepotLatLng(lat, lng)) return false;
    if (isNearNagpurAirport(lat, lng) && !isAirportVenueIntent(address)) return false;
    return true;
  };

  const getRouteStartLatLng = (route: Route): google.maps.LatLngLiteral => {
    const cab = route.cab;
    if (hasPreciseDriverStart(route)) {
      return { lat: cab!.driverY!, lng: cab!.driverX! };
    }
    return { lat: depotLat, lng: depotLng };
  };

  const getDisplayOrderedStops = (route: Route, isPickup: boolean): any[] => {
    const sorted = [...route.stops].sort((a: any, b: any) => a.stopOrder - b.stopOrder);
    const canonical = canonicalSequences?.[route.id];
    if (canonical) {
      const stopMap = new Map(sorted.map(s => [s.employee.id, s]));
      const ordered = canonical.map(id => stopMap.get(id)).filter(Boolean);
      return isPickup ? ordered : [...ordered].reverse();
    }
    return isPickup ? sorted : [...sorted].reverse();
  };

  useEffect(() => {
    if (mode !== "OPTIMIZER" || !selectedRouteId) {
      setVariationsData([]);
      return;
    }
    const fetchVariations = async () => {
      try {
        const route = routes.find((r) => r.id === selectedRouteId);
        if (!route || selectedRouteId.startsWith("preview-")) {
          setVariationsData([]);
          return;
        }
        const res = await fetch(`/api/routes/${selectedRouteId}/variations`);
        if (!res.ok) {
          setVariationsData([]);
          return;
        }
        const vars = await res.json();
        setVariationsData(vars);
      } catch (err) {
        setVariationsData([]);
      }
    };
    fetchVariations();
  }, [selectedRouteId, routes, mode]);

  useEffect(() => {
    if (!containerRef.current || !apiKey) return;
    if (mapRef.current) return;

    let active = true;
    const init = async () => {
      setOptions({ key: apiKey, v: "weekly" });
      const [{ Map }, { ControlPosition }] = await Promise.all([
        importLibrary("maps"),
        importLibrary("core"),
      ]);
      if (!active || !containerRef.current) return;

      const map = new Map(containerRef.current, {
        center: { lat: depotLat, lng: depotLng },
        zoom: 13,
        minZoom: 9,
        maxZoom: 18,
        restriction: {
          latLngBounds: {
            north: depotLat + 1.0,
            south: depotLat - 1.0,
            east: depotLng + 1.0,
            west: depotLng - 1.0,
          },
          strictBounds: true,
        },
        zoomControl: true,
        zoomControlOptions: { position: ControlPosition.BOTTOM_RIGHT },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: MAP_STYLES,
        backgroundColor: "#f0f0f0",
      });

      mapRef.current = map;
      setMapReady(true);
    };
    init();
    return () => { active = false; };
  }, [apiKey, depotLat, depotLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const google = window.google;
    if (!google) return;

    const overlays: (google.maps.Marker | null)[] = [];
    const infoWindows: google.maps.InfoWindow[] = [];

    const fitCoords: google.maps.LatLngLiteral[] = [{ lat: depotLat, lng: depotLng }];

    const depotMarker = new google.maps.Marker({
      position: { lat: depotLat, lng: depotLng },
      map,
      icon: {
        url: depotSvg(44),
        anchor: new google.maps.Point(22, 22),
      },
      title: `${depotName} (Hub)`,
      zIndex: 1000,
    });
    overlays.push(depotMarker);

    const depotInfo = new google.maps.InfoWindow({
      content: `<div style="padding:6px 10px;border-left:4px solid #ff4f00;"><strong style="font-size:14px;">${depotName}</strong><div style="font-size:12px;color:#666;">Central Hub</div></div>`,
    });
    infoWindows.push(depotInfo);
    depotMarker.addListener("click", () => {
      depotInfo.open({ map, anchor: depotMarker });
    });

    const overviewSeenCoords: Record<string, number> = {};

    const shiftColorMap = buildShiftColorMap(routes);

    routes.forEach((route, idx) => {
      if (selectedRouteId && route.id !== selectedRouteId) return;

      const overviewMode = routeViewModes?.[route.id]
        ? routeViewModes[route.id] === "pickup"
        : route.isPickup;
      const sortedStops = getDisplayOrderedStops(route, overviewMode);
      if (sortedStops.length === 0) return;

      // Color by shift — all routes in the same shift share the same color
      const routeColor = shiftColorMap.get(route.shiftId) ?? SHIFT_PALETTE[idx % SHIFT_PALETTE.length];
      const isSelectedOverviewRoute = selectedRouteId === route.id;
      const routeStart = getRouteStartLatLng(route);

      sortedStops.forEach((stop) => {
        if (isWithinBounds(stop.employee.y, stop.employee.x)) {
          fitCoords.push({ lat: stop.employee.y, lng: stop.employee.x });
        }
        if (isSelectedOverviewRoute) return;

        const coordKey = `${stop.employee.y.toFixed(5)}_${stop.employee.x.toFixed(5)}`;
        const overlapCount = overviewSeenCoords[coordKey] || 0;
        overviewSeenCoords[coordKey] = overlapCount + 1;

        let markerY = stop.employee.y;
        let markerX = stop.employee.x;
        if (overlapCount > 0) {
          const offsetDist = 0.0002;
          const angle = overlapCount * (Math.PI / 3);
          markerY += Math.sin(angle) * offsetDist;
          markerX += Math.cos(angle) * offsetDist;
        }

        const empMarker = new google.maps.Marker({
          position: { lat: markerY, lng: markerX },
          map,
          icon: {
            url: employeeSvg(20, "", routeColor, stop.employee.gender, false, 0.4),
            anchor: new google.maps.Point(10, 10),
          },
          zIndex: 10,
        });
        overlays.push(empMarker);

        empMarker.addListener("click", () => {
          onSelectRoute(route.id);
        });
      });

      if (!isSelectedOverviewRoute && !isDepotLatLng(routeStart.lat, routeStart.lng) && isWithinBounds(routeStart.lat, routeStart.lng)) {
        fitCoords.push(routeStart);
        const startMarker = new google.maps.Marker({
          position: routeStart,
          map,
          icon: {
            url: driverStartSvg(48, routeColor),
            anchor: new google.maps.Point(24, 24),
          },
          zIndex: 15,
        });
        overlays.push(startMarker);
        startMarker.addListener("click", () => {
          onSelectRoute(route.id);
        });
      }
    });

    if (selectedRouteId) {
      const selectedRoute = routes.find((r) => r.id === selectedRouteId);
      if (selectedRoute && selectedRoute.stops.length > 0) {
        const selectedRouteIdx = routes.findIndex((r) => r.id === selectedRouteId);
        const selectedRouteColor = shiftColorMap.get(selectedRoute.shiftId) ?? SHIFT_PALETTE[selectedRouteIdx % SHIFT_PALETTE.length];
        const stopsList = [...selectedRoute.stops].sort((a, b) => a.stopOrder - b.stopOrder);
        const effectiveIsPickup = routeViewModes?.[selectedRoute.id]
          ? routeViewModes[selectedRoute.id] === "pickup"
          : true;
        const canonical = canonicalSequences?.[selectedRoute.id];
        let orderedStops: any[];
        if (canonical) {
          const stopMap = new Map(stopsList.map(s => [s.employee.id, s]));
          const ordered = canonical.map(id => stopMap.get(id)).filter(Boolean);
          orderedStops = effectiveIsPickup ? ordered : [...ordered].reverse();
        } else {
          orderedStops = effectiveIsPickup ? stopsList : [...stopsList].reverse();
        }
        const routeStart = getRouteStartLatLng(selectedRoute);
        const seenCoords: Record<string, number> = {};

        if (!isDepotLatLng(routeStart.lat, routeStart.lng) && isWithinBounds(routeStart.lat, routeStart.lng)) {
          fitCoords.push(routeStart);
          const startMarker = new google.maps.Marker({
            position: routeStart,
            map,
            icon: {
              url: driverStartSvg(48, selectedRouteColor),
              anchor: new google.maps.Point(24, 24),
            },
            zIndex: 35,
          });
          overlays.push(startMarker);

          const startInfo = new google.maps.InfoWindow({
            content: `<strong style="font-size:14px;">${selectedRoute.cab.driverName || "Driver"}</strong><br/><span style="font-size:12px;color:#666;">${selectedRoute.cab.formattedAddress || selectedRoute.cab.driverAddress || "Starting Point"}</span>`,
          });
          infoWindows.push(startInfo);
          startMarker.addListener("click", () => {
            startInfo.open({ map, anchor: startMarker });
          });
        }

        orderedStops.forEach((stop, displayIdx) => {
          const isViolation = selectedRoute.violations.some(
            (v) =>
              !v.resolved &&
              ((v.type === "FEMALE_FIRST_PICKUP" && stop.stopOrder === 1) ||
                (v.type === "FEMALE_LAST_DROP" && stop.stopOrder === selectedRoute.stops.length))
          );

          if (isWithinBounds(stop.employee.y, stop.employee.x)) {
            fitCoords.push({ lat: stop.employee.y, lng: stop.employee.x });
          }

          const empAddress = stop.employee.formattedAddress || stop.employee.address;
          const parts = empAddress.split(" | ");
          const pickupLabel = parts[0];
          const homeLabel = parts[1] || parts[0];
          const phoneParts = stop.employee.phone.split("/");
          const primaryPhone = phoneParts[0].trim();
          const secondaryPhone = phoneParts[1] ? phoneParts[1].trim() : null;
          const phoneDisplay = secondaryPhone
            ? `<span title="Alt: ${secondaryPhone}">${primaryPhone} ℹ</span>`
            : primaryPhone;

          const coordKey = `${stop.employee.y.toFixed(5)}_${stop.employee.x.toFixed(5)}`;
          const overlapCount = seenCoords[coordKey] || 0;
          seenCoords[coordKey] = overlapCount + 1;

          let markerY = stop.employee.y;
          let markerX = stop.employee.x;
          if (overlapCount > 0) {
            const offsetDist = 0.0002;
            const angle = overlapCount * (Math.PI / 3);
            markerY += Math.sin(angle) * offsetDist;
            markerX += Math.cos(angle) * offsetDist;
          }

          const isHighlighted = stop.employee.id === selectedEmployeeId;

          const empMarker = new google.maps.Marker({
            position: { lat: markerY, lng: markerX },
            map,
            icon: {
              url: employeeSvg(isHighlighted ? 32 : 26, String(displayIdx + 1), selectedRouteColor, stop.employee.gender, true, 1, isHighlighted),
              anchor: new google.maps.Point(isHighlighted ? 16 : 13, isHighlighted ? 16 : 13),
            },
            zIndex: isHighlighted ? 40 : 30,
          });
          overlays.push(empMarker);

          const empInfo = new google.maps.InfoWindow({
            content: `<div style="padding:6px 10px;border-left:4px solid ${selectedRouteColor};"><span style="display:inline-block;background:${selectedRouteColor};color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-right:6px;">r${selectedRouteIdx + 1}</span><strong style="font-size:14px;">${stop.employee.name}</strong><div style="margin:4px 0;font-size:11px;color:#666;">Stop #${displayIdx + 1} (${stop.etaMinutes} min)</div><div style="font-size:12px;">Pickup: ${pickupLabel}<br/>Home: ${homeLabel}<br/>Phone: ${phoneDisplay}</div></div>`,
          });
          infoWindows.push(empInfo);
          empMarker.addListener("click", () => {
            infoWindows.forEach((iw) => iw.close());
            empInfo.open({ map, anchor: empMarker });
          });

          if (isHighlighted) {
            empInfo.open({ map, anchor: empMarker });
          }
        });

        /* Polylines removed — the platform is a transport allocation system,
           not a navigation system. Drivers know the roads. */
      }
    }

    const fitKey = selectedRouteId
      ? `selected:${selectedRouteId}`
      : `all:${routes.map((route) => `${route.id}:${route.stops.length}`).join("|")}`;

    if (lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      if (fitCoords.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        fitCoords.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, 40);
      } else {
        map.setCenter({ lat: depotLat, lng: depotLng });
        map.setZoom(13);
      }
    }

    return () => {
      overlays.forEach((o) => o?.setMap?.(null));
      infoWindows.forEach((iw) => iw.close());
    };
  }, [routes, selectedRouteId, mode, routeViewModes, selectedEmployeeId, canonicalSequences]);

  const shiftLegend = buildShiftColorMap(routes);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full z-0 bg-[#f7f7f7]" />

      {/* Shift color legend — top-left */}
      {shiftLegend.size > 1 && (
        <div className="absolute top-3 left-3 z-[1000] p-2.5 bg-white/95 backdrop-blur-xs border border-[#e8e8e8] shadow-none flex flex-col gap-1.5 text-[10px] animate-fadeIn">
          <div className="font-bold text-[#1c1b1f] uppercase tracking-wider text-[9px] border-b border-slate-100 pb-1 mb-0.5">Shifts</div>
          {Array.from(shiftLegend.entries()).map(([shiftId, color]) => {
            const shiftRoute = routes.find(r => r.shiftId === shiftId);
            const shiftName = shiftRoute?.shift?.name || shiftId;
            const shiftTime = shiftRoute?.shift?.startTime ? ` · ${shiftRoute.shift.startTime}` : "";
            return (
              <div key={shiftId} className="flex items-center gap-1.5 font-semibold text-[#4a4a4a]">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                <span>{shiftName}{shiftTime}</span>
              </div>
            );
          })}
        </div>
      )}

      {selectedRouteId && (
        mode === "ANALYTICS" ? (
          <div className="absolute top-4 right-4 z-[1000] p-4 bg-white/95 backdrop-blur-xs border border-[#e8e8e8] rounded-none shadow-none flex flex-col gap-2.5 text-xs text-left animate-fadeIn">
            <div className="font-bold text-[#1c1b1f] border-b border-slate-100 pb-1.5 uppercase tracking-wider text-[10px]">
              Optimization Comparison
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <span className="w-4 h-1.5 rounded-none bg-[#1c1b1f]"></span>
                <span className="text-[#4a4a4a] w-24">Optimized Route</span>
                <span className="text-[#6b6b6b] font-mono text-[10px] ml-auto font-bold text-[#1c1b1f]">
                  {(() => {
                    const breakdown = analysisData?.routeBreakdowns?.find((rb: { routeId: string; optimizedKm: number; unoptimizedKm: number }) => rb.routeId === selectedRouteId);
                    return breakdown ? `${breakdown.optimizedKm} km` : "";
                  })()}
                </span>
              </div>
              <div className="flex items-center gap-2 font-semibold">
                <span className="w-4 h-1.5 rounded-none bg-slate-400"></span>
                <span className="text-[#4a4a4a] w-24">Normal (Naive)</span>
                <span className="text-[#6b6b6b] font-mono text-[10px] ml-auto font-bold text-[#6b6b6b]">
                  {(() => {
                    const breakdown = analysisData?.routeBreakdowns?.find((rb: { routeId: string; optimizedKm: number; unoptimizedKm: number }) => rb.routeId === selectedRouteId);
                    return breakdown ? `${breakdown.unoptimizedKm} km` : "";
                  })()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          variationsData.length > 0 && (
            <div className="absolute top-4 right-4 z-[1000] p-4 bg-white/95 backdrop-blur-xs border border-[#e8e8e8] rounded-none shadow-none flex flex-col gap-2.5 text-xs text-left animate-fadeIn">
              <div className="font-bold text-[#1c1b1f] border-b border-slate-100 pb-1.5 uppercase tracking-wider text-[10px]">
                Route Variation Comparison
              </div>
              <div className="flex flex-col gap-2">
                {variationsData.map((v) => {
                  const color = STRATEGY_COLORS[v.strategy as keyof typeof STRATEGY_COLORS];
                  return (
                    <div key={v.strategy} className="flex items-center gap-2 font-semibold">
                      <span className="w-4 h-1.5 rounded-none" style={{ backgroundColor: color }}></span>
                      <span className="text-[#4a4a4a] capitalize w-16">{v.strategy.toLowerCase()}</span>
                      <span className="text-[#6b6b6b] font-mono text-[10px] ml-auto">
                        {v.totalDistance} km · {v.totalDuration}m
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}
