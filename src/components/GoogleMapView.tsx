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

const OVERVIEW_COLORS = [
  "#64748b", "#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f97316",
];

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", stylers: [{ color: "#f0f0f0" }] },
  { featureType: "water", stylers: [{ color: "#aad3df" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.locality", stylers: [{ visibility: "on" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "on" }] },
];

function svgToUri(svg: string): string {
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function depotSvg(size: number): string {
  const s = size;
  return svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <rect width="${s}" height="${s}" fill="#1c1b1f" stroke="#ffffff" stroke-width="2"/>
      <text x="${s/2}" y="${s/2 + 1}" text-anchor="middle" dominant-baseline="central" fill="#ffd700" font-size="${s * 0.5}">★</text>
    </svg>
  `);
}

function employeeSvg(size: number, label: string, color: string, gender: string, isSelected: boolean): string {
  const stroke = isSelected ? "#ffffff" : "transparent";
  const strokeW = isSelected ? "2" : "0";
  const isFemale = gender === "F";
  const shape = isFemale
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="${stroke}" stroke-width="${strokeW}"/>`
    : `<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${color}" stroke="${stroke}" stroke-width="${strokeW}"/>`;
  return svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${shape}
      <text x="${size/2}" y="${size/2 + 1}" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="${size * 0.45}" font-weight="900" font-family="sans-serif">${label}</text>
    </svg>
  `);
}

function driverStartSvg(size: number, color: string): string {
  return svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#ffffff" stroke="${color}" stroke-width="3"/>
      <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="${size * 0.4}" font-weight="900" font-family="sans-serif">⌂</text>
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
}: GoogleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const lastFitKeyRef = useRef<string>("");

  const [mapReady, setMapReady] = useState(false);
  const [variationsData, setVariationsData] = useState<any[]>([]);
  const [variationGeometries, setVariationGeometries] = useState<Record<string, [number, number][]>>({});
  const [routeGeometries, setRouteGeometries] = useState<Record<string, [number, number][]>>({});
  const [loadingGeometries, setLoadingGeometries] = useState(false);
  const [analyticsOptimizedGeom, setAnalyticsOptimizedGeom] = useState<[number, number][]>([]);
  const [analyticsNormalGeom, setAnalyticsNormalGeom] = useState<[number, number][]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

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
    return Math.sqrt(latKm * latKm + lngKm * lngKm) < 1.2;
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

  const buildRouteLatLngs = (
    route: Route,
    stopCoords: google.maps.LatLngLiteral[]
  ): google.maps.LatLngLiteral[] => {
    const start = getRouteStartLatLng(route);
    const depot = { lat: depotLat, lng: depotLng };
    if (route.isPickup) {
      return [start, ...stopCoords, depot];
    }
    return isDepotLatLng(start.lat, start.lng)
      ? [depot, ...stopCoords]
      : [start, depot, ...stopCoords];
  };

  const fetchRouteGeometry = async (coords: google.maps.LatLngLiteral[]): Promise<[number, number][]> => {
    if (coords.length <= 1) return coords.map((c) => [c.lat, c.lng]);

    if (typeof google !== "undefined" && google.maps?.DirectionsService) {
      try {
        const result = await new Promise<google.maps.DirectionsResult | null>((resolve) => {
          const service = new google.maps.DirectionsService();
          service.route(
            {
              origin: coords[0],
              destination: coords[coords.length - 1],
              waypoints: coords.slice(1, -1).map((c) => ({
                location: c,
                stopover: true,
              })),
              travelMode: google.maps.TravelMode.DRIVING,
              optimizeWaypoints: false,
            },
            (result, status) => {
              resolve(status === google.maps.DirectionsStatus.OK ? result : null);
            }
          );
        });

        if (result?.routes?.[0]?.overview_path) {
          const path = result.routes[0].overview_path.map(
            (ll) => [ll.lat(), ll.lng()] as [number, number]
          );
          if (path.length > coords.length) return path;
        }
      } catch (e) {
        console.error("Google DirectionsService failed:", e);
      }
    }

    try {
      const res = await fetch("/api/routing/geometry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.coordinates) && data.coordinates.length > coords.length) {
          return data.coordinates;
        }
      }
    } catch (e) {
      console.error("Route geometry fetch failed:", e);
    }
    return coords.map((c) => [c.lat, c.lng]);
  };

  useEffect(() => {
    if (routes.length === 0) {
      setRouteGeometries({});
      return;
    }
    let active = true;
    const fetchRouteGeometries = async () => {
      const selectedRoute = selectedRouteId
        ? routes.find((route) => route.id === selectedRouteId)
        : null;
      const orderedRoutes = selectedRoute
        ? [selectedRoute, ...routes.filter((route) => route.id !== selectedRoute.id)]
        : routes;
      setRouteGeometries({});
      for (const route of orderedRoutes) {
        const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
        if (sortedStops.length === 0) continue;
        const coords = buildRouteLatLngs(
          route,
          sortedStops.map((s) => ({ lat: s.employee.y, lng: s.employee.x }))
        );
        const geometry = await fetchRouteGeometry(coords);
        if (!active) return;
        setRouteGeometries((prev) => ({ ...prev, [route.id]: geometry }));
      }
    };
    fetchRouteGeometries();
    return () => { active = false; };
  }, [routes, selectedRouteId, depotLat, depotLng, mapReady]);

  useEffect(() => {
    if (mode !== "ANALYTICS" || !selectedRouteId) {
      setAnalyticsOptimizedGeom([]);
      setAnalyticsNormalGeom([]);
      return;
    }
    const fetchAnalyticsGeometries = async () => {
      setAnalyticsLoading(true);
      try {
        const route = routes.find((r) => r.id === selectedRouteId);
        if (!route) return;
        const stopsList = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
        const optCoords = buildRouteLatLngs(
          route,
          stopsList.map((s) => ({ lat: s.employee.y, lng: s.employee.x }))
        );
        const normalStopsList = [...route.stops].sort((a, b) => a.employee.name.localeCompare(b.employee.name));
        const normCoords = buildRouteLatLngs(
          route,
          normalStopsList.map((s) => ({ lat: s.employee.y, lng: s.employee.x }))
        );
        const [optGeom, normGeom] = await Promise.all([
          fetchRouteGeometry(optCoords),
          fetchRouteGeometry(normCoords),
        ]);
        setAnalyticsOptimizedGeom(optGeom);
        setAnalyticsNormalGeom(normGeom);
      } catch (err) {
        console.error("Error fetching analytics geometries:", err);
      } finally {
        setAnalyticsLoading(false);
      }
    };
    fetchAnalyticsGeometries();
  }, [selectedRouteId, routes, mode, mapReady]);

  useEffect(() => {
    if (mode !== "OPTIMIZER" || !selectedRouteId) {
      setVariationsData([]);
      setVariationGeometries({});
      return;
    }
    const fetchVariationsAndGeometries = async () => {
      setLoadingGeometries(true);
      try {
        const route = routes.find((r) => r.id === selectedRouteId);
        if (!route || selectedRouteId.startsWith("preview-")) {
          setVariationsData([]);
          setVariationGeometries({});
          return;
        }
        const res = await fetch(`/api/routes/${selectedRouteId}/variations`);
        if (!res.ok) {
          setVariationsData([]);
          setVariationGeometries({});
          return;
        }
        const vars = await res.json();
        setVariationsData(vars);
        const geometries: Record<string, [number, number][]> = {};
        for (const v of vars) {
          const stopsList = [...v.stops].sort((a, b) => a.stopOrder - b.stopOrder);
          const coords = buildRouteLatLngs(
            route,
            stopsList.map((s) => ({ lat: s.y, lng: s.x }))
          );
          geometries[v.strategy] = await fetchRouteGeometry(coords);
        }
        setVariationGeometries(geometries);
      } catch (err) {
        setVariationsData([]);
        setVariationGeometries({});
      } finally {
        setLoadingGeometries(false);
      }
    };
    fetchVariationsAndGeometries();
  }, [selectedRouteId, routes, mode, mapReady]);

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

    const overlays: (google.maps.Marker | google.maps.Polyline | null)[] = [];
    const infoWindows: google.maps.InfoWindow[] = [];

    const fitCoords: google.maps.LatLngLiteral[] = [{ lat: depotLat, lng: depotLng }];

    const depotMarker = new google.maps.Marker({
      position: { lat: depotLat, lng: depotLng },
      map,
      icon: {
        url: depotSvg(40),
        anchor: new google.maps.Point(20, 20),
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

    routes.forEach((route, idx) => {
      if (selectedRouteId && route.id !== selectedRouteId) return;

      const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
      if (sortedStops.length === 0) return;

      const routeColor = OVERVIEW_COLORS[idx % OVERVIEW_COLORS.length];
      const isSelectedOverviewRoute = selectedRouteId === route.id;

      const lineCoords = buildRouteLatLngs(
        route,
        sortedStops.map((s) => ({ lat: s.employee.y, lng: s.employee.x }))
      );
      const roadCoords = routeGeometries[route.id] || lineCoords.map((c) => [c.lat, c.lng]);
      const routeStart = getRouteStartLatLng(route);

      const path = new google.maps.Polyline({
        path: roadCoords.map(([lat, lng]) => ({ lat, lng })),
        map,
        strokeColor: routeColor,
        strokeWeight: isSelectedOverviewRoute ? 4 : 3,
        strokeOpacity: isSelectedOverviewRoute ? 0.35 : 0.65,
        zIndex: isSelectedOverviewRoute ? 10 : 5,
      });
      overlays.push(path);

      path.addListener("click", () => {
        onSelectRoute(isSelectedOverviewRoute ? null : route.id);
      });

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
            url: employeeSvg(28, "", routeColor, stop.employee.gender, false),
            anchor: new google.maps.Point(14, 14),
          },
          zIndex: 20,
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
            url: driverStartSvg(32, routeColor),
            anchor: new google.maps.Point(16, 16),
          },
          zIndex: 20,
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
        const selectedRouteColor = OVERVIEW_COLORS[selectedRouteIdx % OVERVIEW_COLORS.length];
        const stopsList = [...selectedRoute.stops].sort((a, b) => a.stopOrder - b.stopOrder);
        const routeStart = getRouteStartLatLng(selectedRoute);
        const selectedRouteCoords = buildRouteLatLngs(
          selectedRoute,
          stopsList.map((s) => ({ lat: s.employee.y, lng: s.employee.x }))
        );
        const selectedRoadCoords = routeGeometries[selectedRoute.id] || selectedRouteCoords.map((c) => [c.lat, c.lng]);
        const seenCoords: Record<string, number> = {};

        if (!isDepotLatLng(routeStart.lat, routeStart.lng) && isWithinBounds(routeStart.lat, routeStart.lng)) {
          fitCoords.push(routeStart);
          const startMarker = new google.maps.Marker({
            position: routeStart,
            map,
          icon: {
            url: driverStartSvg(32, selectedRouteColor),
            anchor: new google.maps.Point(16, 16),
          },
          zIndex: 30,
          });
          overlays.push(startMarker);

          const startInfo = new google.maps.InfoWindow({
            content: `<strong style="font-size:14px;">${selectedRoute.cab.driverName || "Driver"}</strong><br/><span style="font-size:12px;color:#666;">${selectedRoute.cab.driverAddress || "Starting Point"}</span>`,
          });
          infoWindows.push(startInfo);
          startMarker.addListener("click", () => {
            startInfo.open({ map, anchor: startMarker });
          });
        }

        stopsList.forEach((stop) => {
          const isViolation = selectedRoute.violations.some(
            (v) =>
              !v.resolved &&
              ((v.type === "FEMALE_FIRST_PICKUP" && stop.stopOrder === 1) ||
                (v.type === "FEMALE_LAST_DROP" && stop.stopOrder === selectedRoute.stops.length))
          );

          if (isWithinBounds(stop.employee.y, stop.employee.x)) {
            fitCoords.push({ lat: stop.employee.y, lng: stop.employee.x });
          }

          const parts = stop.employee.address.split(" | ");
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

          const empMarker = new google.maps.Marker({
            position: { lat: markerY, lng: markerX },
            map,
            icon: {
              url: employeeSvg(28, String(stop.stopOrder), selectedRouteColor, stop.employee.gender, true),
              anchor: new google.maps.Point(14, 14),
            },
            zIndex: 30,
          });
          overlays.push(empMarker);

          const empInfo = new google.maps.InfoWindow({
            content: `<div style="padding:6px 10px;border-left:4px solid ${selectedRouteColor};"><strong style="font-size:14px;">${stop.employee.name}</strong><div style="margin:4px 0;font-size:11px;color:#666;">Stop #${stop.stopOrder} (${stop.etaMinutes} min)</div><div style="font-size:12px;">Pickup: ${pickupLabel}<br/>Home: ${homeLabel}<br/>Phone: ${phoneDisplay}</div></div>`,
          });
          infoWindows.push(empInfo);
          empMarker.addListener("click", () => {
            infoWindows.forEach((iw) => iw.close());
            empInfo.open({ map, anchor: empMarker });
          });
        });

        if (mode === "ANALYTICS") {
          if (analyticsOptimizedGeom.length > 0) {
            const optPoly = new google.maps.Polyline({
              path: analyticsOptimizedGeom.map(([lat, lng]) => ({ lat, lng })),
              map,
              strokeColor: "#10b981",
              strokeWeight: 5,
              strokeOpacity: 0.9,
              zIndex: 40,
            });
            overlays.push(optPoly);
          }
          if (analyticsNormalGeom.length > 0) {
            const normPoly = new google.maps.Polyline({
              path: analyticsNormalGeom.map(([lat, lng]) => ({ lat, lng })),
              map,
              strokeColor: "#64748b",
              strokeWeight: 4,
              strokeOpacity: 0.75,
              icons: [{
                icon: { path: "" },
                offset: "0",
                repeat: "15px",
              }],
              zIndex: 39,
            });
            overlays.push(normPoly);
          }
        } else {
          const selectedPoly = new google.maps.Polyline({
            path: selectedRoadCoords.map(([lat, lng]) => ({ lat, lng })),
            map,
            strokeColor: "#111827",
            strokeWeight: 6,
            strokeOpacity: 0.9,
            zIndex: 50,
          });
          overlays.push(selectedPoly);

          Object.entries(variationGeometries).forEach(([strategy, pathCoords]) => {
            const color = STRATEGY_COLORS[strategy] || "#94a3b8";
            const varPoly = new google.maps.Polyline({
              path: pathCoords.map(([lat, lng]) => ({ lat, lng })),
              map,
              strokeColor: color,
              strokeWeight: 4,
              strokeOpacity: 0.85,
              zIndex: 45,
            });
            overlays.push(varPoly);
          });
        }
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
  }, [routes, selectedRouteId, routeGeometries, variationGeometries, analyticsOptimizedGeom, analyticsNormalGeom, mode]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full z-0 bg-[#f7f7f7]" />

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
            {analyticsLoading && (
              <div className="text-[9px] text-[#9a9a9a] italic mt-1 flex items-center gap-1">
                <span className="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-none animate-spin-fast"></span>
                Fetching Nagpur road curves...
              </div>
            )}
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
              {loadingGeometries && (
                <div className="text-[9px] text-[#9a9a9a] italic mt-1 flex items-center gap-1">
                  <span className="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-none animate-spin-fast"></span>
                  Fetching Nagpur road curves...
                </div>
              )}
            </div>
          )
        )
      )}
    </div>
  );
}
