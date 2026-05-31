"use client";

import React, { useEffect, useRef, useState } from "react";
import { Route, RouteStop } from "@/store/useTransportStore";
import "leaflet/dist/leaflet.css";

// Nagpur bounds constraint helper
const isWithinBounds = (lat: number, lng: number) => {
 return lat >= 20.5 && lat <= 21.5 && lng >= 78.5 && lng <= 79.5;
};

interface LeafletMapProps {
 routes: Route[];
 selectedRouteId: string | null;
 onSelectRoute: (id: string | null) => void;
 mode?: "OPTIMIZER" | "ANALYTICS";
 analysisData?: any;
 // Dynamic depot from system settings
 depotLat?: number;
 depotLng?: number;
 depotName?: string;
}

// Strategy Colors
const STRATEGY_COLORS = {
 DISTANCE: "#ef4444", // Red
 TIME: "#3b82f6", // Blue
 BALANCED: "#8b5cf6", // Purple
 NORMAL: "#64748b", // Slate-gray
};

export default function LeafletMap({
 routes,
 selectedRouteId,
 onSelectRoute,
 mode = "OPTIMIZER",
 analysisData,
 depotLat = 21.0625,
 depotLng = 79.0526,
 depotName = "Depot",
}: LeafletMapProps) {
 const DEPOT_LAT = depotLat;
 const DEPOT_LNG = depotLng;

 const isWithinBounds = (lat: number, lng: number) => {
 return lat >= DEPOT_LAT - 1.0 && lat <= DEPOT_LAT + 1.0 &&
 lng >= DEPOT_LNG - 1.0 && lng <= DEPOT_LNG + 1.0;
 };

 const mapContainerRef = useRef<HTMLDivElement>(null);
 const mapInstanceRef = useRef<any>(null);
 const layerGroupRef = useRef<any>(null);
 const LRef = useRef<any>(null);

 const [variationsData, setVariationsData] = useState<any[]>([]);
 const [variationGeometries, setVariationGeometries] = useState<Record<string, [number, number][]>>({});
 const [loadingGeometries, setLoadingGeometries] = useState(false);

 // Analytics mode states for optimized vs normal route comparison
 const [analyticsOptimizedGeom, setAnalyticsOptimizedGeom] = useState<[number, number][]>([]);
 const [analyticsNormalGeom, setAnalyticsNormalGeom] = useState<[number, number][]>([]);
 const [analyticsLoading, setAnalyticsLoading] = useState(false);

 // Helper to fetch route geometry from OSRM
 const fetchOSRMGeometry = async (coords: [number, number][]) => {
 if (coords.length <= 1) return coords;
 try {
 const coordsStr = coords.map((c) => `${c[1]},${c[0]}`).join(";");
 const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
 const res = await fetch(url);
 if (res.ok) {
 const data = await res.json();
 if (data && data.routes && data.routes[0]) {
 const geomCoords = data.routes[0].geometry.coordinates;
 return geomCoords.map((c: any) => [c[1], c[0]]); // convert to [lat, lng]
 }
 }
 } catch (e) {
 console.error("OSRM fetch failed:", e);
 }
 return coords; // fallback to straight lines
 };

 // Fetch OSRM geometry for Analytics mode
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

 // 1. Build actual optimized coordinates
 const stopsList = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
 const optCoords: [number, number][] = [];

 if (route.isPickup) {
 stopsList.forEach((s) => optCoords.push([s.employee.y, s.employee.x]));
 optCoords.push([DEPOT_LAT, DEPOT_LNG]);
 } else {
 optCoords.push([DEPOT_LAT, DEPOT_LNG]);
 stopsList.forEach((s) => optCoords.push([s.employee.y, s.employee.x]));
 }

 // 2. Build normal (naive alphabetical) coordinates
 const normalStopsList = [...route.stops].sort((a, b) => a.employee.name.localeCompare(b.employee.name));
 const normCoords: [number, number][] = [];

 if (route.isPickup) {
 normalStopsList.forEach((s) => normCoords.push([s.employee.y, s.employee.x]));
 normCoords.push([DEPOT_LAT, DEPOT_LNG]);
 } else {
 normCoords.push([DEPOT_LAT, DEPOT_LNG]);
 normalStopsList.forEach((s) => normCoords.push([s.employee.y, s.employee.x]));
 }

 const optGeom = await fetchOSRMGeometry(optCoords);
 const normGeom = await fetchOSRMGeometry(normCoords);

 setAnalyticsOptimizedGeom(optGeom);
 setAnalyticsNormalGeom(normGeom);
 } catch (err) {
 console.error("Error fetching analytics geometries:", err);
 } finally {
 setAnalyticsLoading(false);
 }
 };

 fetchAnalyticsGeometries();
 }, [selectedRouteId, routes, mode]);

 // Fetch variations list and their OSRM geometries when selection changes (Optimizer mode)
 useEffect(() => {
 if (mode !== "OPTIMIZER" || !selectedRouteId) {
 setVariationsData([]);
 setVariationGeometries({});
 return;
 }

 const fetchVariationsAndGeometries = async () => {
 setLoadingGeometries(true);
 try {
 const res = await fetch(`/api/routes/${selectedRouteId}/variations`);
 if (!res.ok) throw new Error("Failed to fetch variations");
 const vars = await res.json();
 setVariationsData(vars);

 const route = routes.find((r) => r.id === selectedRouteId);
 if (!route) return;

 // Fetch OSRM geometry for each strategy
 const geometries: Record<string, [number, number][]> = {};
 for (const v of vars) {
 const stopsList = [...v.stops].sort((a, b) => a.stopOrder - b.stopOrder);
 const coords: [number, number][] = [];



 if (route.isPickup) {
 // Pickup starts at Driver/Passenger stops, ends at Depot
 stopsList.forEach((s) => coords.push([s.y, s.x])); // [lat, lng]
 coords.push([DEPOT_LAT, DEPOT_LNG]);
 } else {
 // Drop starts at Driver -> Depot, goes to passenger stops
 coords.push([DEPOT_LAT, DEPOT_LNG]);
 stopsList.forEach((s) => coords.push([s.y, s.x]));
 }

 // Fetch curve details from OpenStreetMap OSRM geometry endpoint
 try {
 const coordsStr = coords.map((c) => `${c[1]},${c[0]}`).join(";"); // OSRM takes lng,lat
 const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
 const routeRes = await fetch(url);
 if (routeRes.ok) {
 const routeData = await routeRes.json();
 if (routeData && routeData.routes && routeData.routes[0]) {
 const geomCoords = routeData.routes[0].geometry.coordinates;
 geometries[v.strategy] = geomCoords.map((c: any) => [c[1], c[0]]); // convert to [lat, lng]
 }
 }
 } catch (e) {
 console.error(`OSRM fetch failed for strategy ${v.strategy}:`, e);
 }

 // Fallback to straight lines if OSRM failed
 if (!geometries[v.strategy]) {
 geometries[v.strategy] = coords;
 }
 }
 setVariationGeometries(geometries);
 } catch (err) {
 console.error("Error fetching variations geometries:", err);
 } finally {
 setLoadingGeometries(false);
 }
 };

 fetchVariationsAndGeometries();
 }, [selectedRouteId, routes]);

 // Initialize Leaflet Map Instance
 useEffect(() => {
 if (!mapContainerRef.current) return;

 let active = true;

 const initMap = async () => {
 const L = await import("leaflet");
 if (!active) return;
 LRef.current = L;

 // Prevent map duplicate initialization on the same element container
 if ((mapContainerRef.current as any)?._leaflet_id) {
 return;
 }

 // Dynamic bounds around the depot (approx 100km radius box)
 const bounds = L.latLngBounds([
 [DEPOT_LAT - 1.0, DEPOT_LNG - 1.0],
 [DEPOT_LAT + 1.0, DEPOT_LNG + 1.0]
 ]);
 const map = L.map(mapContainerRef.current!, {
 center: [DEPOT_LAT, DEPOT_LNG],
 zoom: 13,
 minZoom: 9, // lower min zoom to allow zooming out further
 maxZoom: 18,
 maxBounds: bounds,
 maxBoundsViscosity: 1.0,
 zoomControl: false,
 });

 L.control.zoom({ position: "bottomright" }).addTo(map);

 // Load free OpenStreetMap map tiles
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
 attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
 }).addTo(map);

 layerGroupRef.current = L.layerGroup().addTo(map);
 mapInstanceRef.current = map;

 // Force refresh size
 setTimeout(() => {
 if (active && map) {
 map.invalidateSize();
 }
 }, 200);
 };

 initMap();

 return () => {
 active = false;
 if (mapInstanceRef.current) {
 mapInstanceRef.current.remove();
 mapInstanceRef.current = null;
 }
 };
 }, []);

 // Render Markers and Paths onto Map
 useEffect(() => {
 const map = mapInstanceRef.current;
 const L = LRef.current;
 const layerGroup = layerGroupRef.current;

 if (!map || !L || !layerGroup) return;

 layerGroup.clearLayers();

 // Custom Marker Icons Builder
 const createDepotIcon = () => {
 return L.divIcon({
 html: `
 <div class="flex items-center justify-center w-8 h-8 rounded-none bg-black border-2 border-white shadow-none text-white">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4.5 h-4.5 text-[#6b6b6b]">
 <path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clip-rule="evenodd" />
 </svg>
 </div>
 `,
 className: "custom-depot-marker",
 iconSize: [32, 32],
 iconAnchor: [16, 16],
 });
 };

 const createEmployeeIcon = (gender: string, isViolation: boolean, isSelected: boolean, stopOrder?: number) => {
 let bgColor = "bg-slate-500 border-slate-600";
 if (isViolation) {
 bgColor = "bg-[#1c1b1f] border-[#1c1b1f]";
 } else if (gender === "FEMALE") {
 bgColor = "bg-[#1c1b1f] border-[#1c1b1f]";
 }
 
 const ringClass = isSelected ? "ring-2 ring-slate-900 ring-offset-1" : "";
 const label = stopOrder !== undefined ? `${stopOrder}` : "";

 return L.divIcon({
 html: `
 <div class="flex items-center justify-center w-6 h-6 rounded-none border border-white shadow-xs text-[10px] font-black font-mono text-white ${bgColor} ${ringClass}">
 ${label}
 </div>
 `,
 className: "custom-emp-marker",
 iconSize: [24, 24],
 iconAnchor: [12, 12],
 });
 };

 const createDriverStartIcon = () => {
 return L.divIcon({
 html: `
 <div class="flex items-center justify-center w-6 h-6 rounded-none border border-white shadow-xs bg-[#1c1b1f] text-white">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5">
 <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
 <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
 </svg>
 </div>
 `,
 className: "custom-driver-marker",
 iconSize: [24, 24],
 iconAnchor: [12, 12],
 });
 };

 // 1. Draw Depot Marker
 L.marker([DEPOT_LAT, DEPOT_LNG], { icon: createDepotIcon() })
 .bindTooltip(`${depotName} (Hub)`, {
 permanent: true,
 direction: "top",
 className: "depot-tooltip",
 offset: [0, -28],
 })
 .bindPopup(`<strong>${depotName}</strong><br/>Central Hub`)
 .addTo(layerGroup);

 const fitCoords: [number, number][] = [[DEPOT_LAT, DEPOT_LNG]];

 // 2. DETAILED VIEW: 1 Cab Selected -> Show 3 variations side-by-side
 if (selectedRouteId) {
 const selectedRoute = routes.find((r) => r.id === selectedRouteId);
 if (selectedRoute && selectedRoute.stops.length > 0) {
 const stopsList = [...selectedRoute.stops].sort((a, b) => a.stopOrder - b.stopOrder);
 
 // Track seen coordinates to apply a small jitter offset for overlapping markers
 const seenCoords: Record<string, number> = {};

 // Draw stops markers
 stopsList.forEach((stop) => {
 const isViolation = selectedRoute.violations.some(
 (v) =>
 !v.resolved &&
 ((v.type === "FEMALE_FIRST_PICKUP" && stop.stopOrder === 1) ||
 (v.type === "FEMALE_LAST_DROP" && stop.stopOrder === selectedRoute.stops.length))
 );

 if (isWithinBounds(stop.employee.y, stop.employee.x)) {
 fitCoords.push([stop.employee.y, stop.employee.x]);
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
 // Apply a small circular offset (roughly 15-20 meters)
 const offsetDist = 0.0002; 
 const angle = overlapCount * (Math.PI / 3); // spread by 60 degrees
 markerY += Math.sin(angle) * offsetDist;
 markerX += Math.cos(angle) * offsetDist;
 }

 L.marker([markerY, markerX], {
 icon: createEmployeeIcon(stop.employee.gender, isViolation, true, stop.stopOrder),
 })
 .bindPopup(`
 <strong>${stop.employee.name}</strong><br/>
 Phone: ${phoneDisplay}<br/>
 Pickup Point: ${pickupLabel}<br/>
 Home Address: ${homeLabel}<br/>
 Stop Order: #${stop.stopOrder} (ETA: ${stop.etaMinutes} mins)
 `)
 .addTo(layerGroup);
 });

 // Plot paths: comparison for ANALYTICS mode, or variations for OPTIMIZER mode
 if (mode === "ANALYTICS") {
 // Plot Actual Optimized path in Emerald Green
 if (analyticsOptimizedGeom.length > 0) {
 L.polyline(analyticsOptimizedGeom, {
 color: "#10b981", // Emerald-green
 weight: 5,
 opacity: 0.9,
 lineJoin: "round",
 })
 .bindPopup(`<strong>Optimized Route</strong>`)
 .addTo(layerGroup);
 }

 // Plot Normal (Naive alphabetical) path in Slate Gray dashed
 if (analyticsNormalGeom.length > 0) {
 L.polyline(analyticsNormalGeom, {
 color: "#64748b", // Slate-gray
 weight: 4,
 opacity: 0.75,
 dashArray: "6, 8",
 lineJoin: "round",
 })
 .bindPopup(`<strong>Normal Route (Naive Alphabetical)</strong>`)
 .addTo(layerGroup);
 }
 } else {
 // Plot the 3 variations paths
 Object.entries(variationGeometries).forEach(([strategy, pathCoords]) => {
 const color = STRATEGY_COLORS[strategy as keyof typeof STRATEGY_COLORS] || "#94a3b8";
 
 // Draw offset or slightly thicker polyline for balanced comparison
 L.polyline(pathCoords, {
 color,
 weight: 4,
 opacity: 0.85,
 lineJoin: "round",
 })
 .bindPopup(`<strong>${strategy} Route</strong>`)
 .addTo(layerGroup);
 });
 }



 // Zoom map to fit selected route stops and depot
 if (fitCoords.length > 1) {
 map.fitBounds(L.latLngBounds(fitCoords), { padding: [50, 50] });
 }
 }
 } 
 // 3. OVERVIEW: No Cab Selected -> Plot all active cabs as thin lines
 else {
 const overviewSeenCoords: Record<string, number> = {};
 routes.forEach((route, idx) => {
 const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
 if (sortedStops.length === 0) return;

 const routeColor = [
 "#64748b", "#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f97316"
 ][idx % 6];

 const lineCoords: [number, number][] = [];
 


 if (route.isPickup) {
 sortedStops.forEach((s) => lineCoords.push([s.employee.y, s.employee.x]));
 lineCoords.push([DEPOT_LAT, DEPOT_LNG]);
 } else {
 lineCoords.push([DEPOT_LAT, DEPOT_LNG]);
 sortedStops.forEach((s) => lineCoords.push([s.employee.y, s.employee.x]));
 }

 // Draw simple thin polyline connecting stops
 L.polyline(lineCoords, {
 color: routeColor,
 weight: 2,
 opacity: 0.5,
 dashArray: "4, 6",
 })
 .on("click", () => onSelectRoute(route.id))
 .addTo(layerGroup);



 // Draw minor markers for stops
 sortedStops.forEach((stop) => {
 if (isWithinBounds(stop.employee.y, stop.employee.x)) {
 fitCoords.push([stop.employee.y, stop.employee.x]);
 }

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
 
 L.marker([markerY, markerX], {
 icon: createEmployeeIcon(stop.employee.gender, false, false),
 })
 .on("click", () => onSelectRoute(route.id))
 .addTo(layerGroup);
 });
 });

 // Fit map bounds to show all active employees across Nagpur
 if (fitCoords.length > 1) {
 map.fitBounds(L.latLngBounds(fitCoords), { padding: [40, 40] });
 } else {
 // Reset viewport directly to depot when no routes exist, keeping it centered
 map.setView([DEPOT_LAT, DEPOT_LNG], 13, { animate: true });
 }
 }
 }, [routes, selectedRouteId, variationGeometries, analyticsOptimizedGeom, analyticsNormalGeom, mode]);

 return (
 <div className="relative w-full h-full">
 {/* Leaflet Map Div */}
 <div ref={mapContainerRef} className="w-full h-full z-0 bg-[#f7f7f7]" />

 {/* Map Legend Overlay */}
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
 const breakdown = analysisData?.routeBreakdowns?.find((rb: any) => rb.routeId === selectedRouteId);
 return breakdown ? `${breakdown.optimizedKm} km` : "";
 })()}
 </span>
 </div>
 <div className="flex items-center gap-2 font-semibold">
 <span className="w-4 h-1.5 rounded-none bg-slate-400"></span>
 <span className="text-[#4a4a4a] w-24">Normal (Naive)</span>
 <span className="text-[#6b6b6b] font-mono text-[10px] ml-auto font-bold text-[#6b6b6b]">
 {(() => {
 const breakdown = analysisData?.routeBreakdowns?.find((rb: any) => rb.routeId === selectedRouteId);
 return breakdown ? `${breakdown.unoptimizedKm} km` : "";
 })()}
 </span>
 </div>
 </div>

 {analyticsLoading && (
 <div className="text-[9px] text-[#9a9a9a] italic mt-1 flex items-center gap-1">
 <span className="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin-fast"></span>
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
 <span className="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin-fast"></span>
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
