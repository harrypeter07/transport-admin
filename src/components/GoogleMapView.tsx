/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Route } from "@/store/useTransportStore";
import { MIHAN, getZoneBounds, ZONE_COLORS } from "@/lib/zones";

const STRATEGY_COLORS: Record<string, string> = {
	DISTANCE: "#ef4444",
	TIME: "#3b82f6",
	BALANCED: "#8b5cf6",
	NORMAL: "#64748b",
};

// ── FIX #1: Stable hash-based shift colors ────────────────────────────────
/**
 * Hash function for deterministic color assignment.
 * Same shiftId always returns same color across sessions, refreshes, dates.
 */
function hashStringToNumber(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
}

/**
 * Get deterministic color for shiftId using hash.
 * Replaces sequential SHIFT_PALETTE assignment.
 */
function getShiftColorByHash(shiftId: string, palette: string[]): string {
	const hash = hashStringToNumber(shiftId);
	return palette[hash % palette.length];
}

// ── FIX #2: Driver location confidence levels ──────────────────────────────
type DriverLocationConfidence = "HIGH" | "MEDIUM" | "LOW";

function getDriverLocationConfidence(
	hasPreciseDriverStart: boolean,
	isNearAirport: boolean,
	hasValidAddress: boolean,
): DriverLocationConfidence {
	if (!hasPreciseDriverStart) return "LOW"; // Moved to depot
	if (isNearAirport && !hasValidAddress) return "LOW"; // Airport heuristic triggered
	if (isNearAirport) return "MEDIUM"; // Near airport but has address
	if (!hasValidAddress) return "MEDIUM"; // Has coords but no address context
	return "HIGH"; // All data present and validated
}

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

/**
 * Build shift color map using deterministic hash-based assignment.
 * FIX #1: Replaces sequential nextColorIdx — now stable across sessions.
 */
function buildShiftColorMap(routes: Route[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const r of routes) {
		if (r.shiftId && !map.has(r.shiftId)) {
			const color = getShiftColorByHash(r.shiftId, SHIFT_PALETTE);
			map.set(r.shiftId, color);
		}
	}
	return map;
}

// Module-level cache — removed (unused)
// Shift colors now use deterministic hash function (FIX #1)

// Ensures setOptions is only called once across all GoogleMapView instances
let loaderConfigured = false;

const MAP_STYLES: any[] = [
	{ featureType: "poi.business", stylers: [{ visibility: "off" }] },
	{ featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
	{ featureType: "poi.medical", stylers: [{ visibility: "off" }] },
	{ featureType: "poi.school", stylers: [{ visibility: "off" }] },
	{ featureType: "transit", stylers: [{ visibility: "off" }] },
	{ featureType: "landscape", stylers: [{ color: "#f2eee9" }] },
	{
		featureType: "landscape.natural.landcover",
		stylers: [{ color: "#e8e0d5" }],
	},
	{ featureType: "landscape.natural.terrain", stylers: [{ color: "#e8e0d5" }] },
	{
		featureType: "poi.park",
		stylers: [{ color: "#d4e5c8", visibility: "on" }],
	},
	{ featureType: "water", stylers: [{ color: "#c8e0f0" }] },
	{
		featureType: "road.highway",
		elementType: "geometry.fill",
		stylers: [{ color: "#f7d9c4" }],
	},
	{
		featureType: "road.highway",
		elementType: "geometry.stroke",
		stylers: [{ color: "#e8c8b0" }],
	},
	{
		featureType: "road.highway",
		elementType: "labels.text",
		stylers: [{ visibility: "on" }],
	},
	{
		featureType: "road.arterial",
		elementType: "geometry",
		stylers: [{ color: "#ffffff" }],
	},
	{
		featureType: "road.arterial",
		elementType: "labels.text",
		stylers: [{ visibility: "on" }],
	},
	{
		featureType: "road.local",
		elementType: "geometry",
		stylers: [{ color: "#f5f3f0" }],
	},
	{
		featureType: "road.local",
		elementType: "labels.text",
		stylers: [{ visibility: "on" }],
	},
	{ featureType: "administrative.locality", stylers: [{ visibility: "on" }] },
	{
		featureType: "administrative.neighborhood",
		stylers: [{ visibility: "on" }],
	},
	{
		featureType: "administrative.land_parcel",
		stylers: [{ visibility: "off" }],
	},
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

function employeeSvg(
	size: number,
	label: string,
	color: string,
	gender: string,
	isSelected: boolean,
	opacity = 1,
	isHighlighted = false,
	isViolation = false,
): string {
	const stroke = isSelected ? "#ffffff" : "transparent";
	const strokeW = isSelected ? "2" : "0";
	const isFemale = gender === "F";
	const fillColor = isViolation ? "#f59e0b" : color;
	const innerR = size / 2 - (isHighlighted ? 3 : 1);
	const shape = isFemale
		? `<circle cx="${size / 2}" cy="${size / 2}" r="${innerR}" fill="${fillColor}" stroke="${stroke}" stroke-width="${strokeW}"/>`
		: `<rect x="${isHighlighted ? 3 : 0}" y="${isHighlighted ? 3 : 0}" width="${size - (isHighlighted ? 6 : 0)}" height="${size - (isHighlighted ? 6 : 0)}" rx="${(size - (isHighlighted ? 6 : 0)) * 0.2}" fill="${fillColor}" stroke="${stroke}" stroke-width="${strokeW}"/>`;
	const ring = isHighlighted
		? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 0.5}" fill="none" stroke="#ff4f00" stroke-width="2.5" opacity="0.9"/>`
		: "";
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

/**
 * Pin/teardrop marker for pickup points.
 * The tip of the pin is at the bottom-center of the bounding box.
 * fillColor: main pin color
 * selected: when true, use a green accent
 */
function pickupPinSvg(w: number, h: number, fillColor: string, selected: boolean): string {
	// Pin shape: rounded top, pointed bottom tip
	const cx = w / 2;
	const r = w * 0.42; // radius of the round part
	const ry = r + 2;    // center y of the round part
	const tipY = h - 2;  // Y of the pointed tip
	const strokeColor = selected ? "#059669" : "#ffffff";
	const strokeW = selected ? "2.5" : "1.5";
	const accentColor = selected ? "#ecfdf5" : "#ffffff";
	// Teardrop path: circle top + triangle pointing down
	const path = `M ${cx} ${tipY} C ${cx - r * 0.7} ${ry + r * 0.5}, ${cx - r * 1.1} ${ry - r * 0.5}, ${cx - r} ${ry} A ${r} ${r} 0 1 1 ${cx + r} ${ry} C ${cx + r * 1.1} ${ry - r * 0.5}, ${cx + r * 0.7} ${ry + r * 0.5}, ${cx} ${tipY} Z`;
	return svgToUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <filter id="shadow" x="-30%" y="-10%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.35)"/>
      </filter>
      <path d="${path}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeW}" filter="url(#shadow)"/>
      <circle cx="${cx}" cy="${ry}" r="${r * 0.35}" fill="${accentColor}" opacity="0.9"/>
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
	pickupPointMarkers?: {
		id: string;
		name: string;
		lat: number;
		lng: number;
		selected?: boolean;
	}[];
	showZoneOverlay?: boolean;
	// FIX #4: Auto-fit control — ON by default
	autoFitRoutes?: boolean;
	// FIX #5: OSRM geometry support — polylines with actual road geometry
	osrmGeometry?: Record<string, { lat: number; lng: number }[]>;
	// FIX #6: Performance tracking callback
	onPerformanceMetrics?: (metrics: {
		renderTimeMs: number;
		markerCount: number;
		polylineCount: number;
	}) => void;
	searchQuery?: string;
}

export default function GoogleMapView({
	routes,
	selectedRouteId,
	onSelectRoute,
	mode = "OPTIMIZER",
	analysisData,
	depotLat = MIHAN.lat,
	depotLng = MIHAN.lng,
	depotName = "Depot",
	apiKey,
	routeViewModes,
	selectedEmployeeId,
	pickupPointMarkers,
	showZoneOverlay = false,
	autoFitRoutes = true,
	osrmGeometry,
	onPerformanceMetrics,
	searchQuery,
}: GoogleMapViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<any | null>(null);
	const lastFitKeyRef = useRef<string>("");
	// mapReady triggers the markers effect to re-run after the map is initialized
	const [mapReady, setMapReady] = useState(false);
	const [variationsData, setVariationsData] = useState<any[]>([]);

	// ── helpers ────────────────────────────────────────────────────────────────

	const isWithinBounds = (lat: number, lng: number) =>
		lat >= depotLat - 1.0 &&
		lat <= depotLat + 1.0 &&
		lng >= depotLng - 1.0 &&
		lng <= depotLng + 1.0;

	const isDepotLatLng = (lat: number, lng: number) =>
		Math.abs(lat - depotLat) < 0.00001 && Math.abs(lng - depotLng) < 0.00001;

	const isAirportVenueIntent = (value: string) => {
		const text = value.toLowerCase();
		return (
			/\b(airport|terminal|aerodrome)\b/.test(text) &&
			!/\bairport\s+road\b/.test(text)
		);
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
		if (typeof cab?.driverX !== "number" || typeof cab?.driverY !== "number")
			return false;
		const lat = cab.driverY;
		const lng = cab.driverX;
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
		if (!isWithinBounds(lat, lng) || isDepotLatLng(lat, lng)) return false;
		if (isNearNagpurAirport(lat, lng) && !isAirportVenueIntent(address))
			return false;
		return true;
	};

	const getRouteStartLatLng = (route: Route): any => {
		const cab = route.cab;
		if (hasPreciseDriverStart(route)) {
			return { lat: cab!.driverY!, lng: cab!.driverX! };
		}
		return { lat: depotLat, lng: depotLng };
	};

	const getDisplayOrderedStops = (route: Route, isPickup: boolean): any[] => {
		const sorted = [...route.stops].sort(
			(a: any, b: any) => a.stopOrder - b.stopOrder,
		);
		return isPickup ? sorted : [...sorted].reverse();
	};

	// ── effect: fetch route variations ────────────────────────────────────────

	useEffect(() => {
		let cancelled = false;

		const fetchVariations = async () => {
			// All bail-outs go inside the async fn so setState is never synchronous
			if (
				mode !== "OPTIMIZER" ||
				!selectedRouteId ||
				selectedRouteId.startsWith("preview-") ||
				selectedRouteId.startsWith("manual_route_") ||
				selectedRouteId.startsWith("manual-") ||
				selectedRouteId.startsWith("assign_") ||
				selectedRouteId.startsWith("baseline_") ||
				selectedRouteId.startsWith("excel-") ||
				!routes.find((r) => r.id === selectedRouteId)
			) {
				if (!cancelled) setVariationsData([]);
				return;
			}

			try {
				const res = await fetch(`/api/routes/${selectedRouteId}/variations`);
				if (cancelled) return;
				if (!res.ok) {
					setVariationsData([]);
					return;
				}
				const vars = await res.json();
				if (!cancelled) setVariationsData(vars);
			} catch {
				if (!cancelled) setVariationsData([]);
			}
		};

		fetchVariations();
		return () => {
			cancelled = true;
		};
	}, [selectedRouteId, routes, mode]);

	// ── effect: initialise Google Map ──────────────────────────────────────────

	useEffect(() => {
		if (!containerRef.current || !apiKey) return;
		if (mapRef.current) return;

		let active = true;
		const init = async () => {
			if (!loaderConfigured) {
				setOptions({ key: apiKey, v: "weekly" });
				loaderConfigured = true;
			}
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
			setMapReady(true); // signal markers effect to run now that map exists
		};
		init();
		return () => {
			active = false;
		};
	}, [apiKey, depotLat, depotLng]);

	// ── effect: draw markers, polylines, zones ─────────────────────────────────
	useEffect(() => {
		const perfStart = performance.now();
		const map = mapRef.current;
		if (!map) return;

		const google = (window as any).google;
		if (!google) return;

		const overlays: any[] = [];
		const polylines: any[] = [];
		const infoWindows: any[] = [];

		const fitCoords: any[] = [{ lat: depotLat, lng: depotLng }];
		let markerCount = 0;
		let polylineCount = 0;

		// Zone overlay rectangles
		if (showZoneOverlay) {
			const ZONES = ["N", "S", "E", "W"];
			ZONES.forEach((zone) => {
				const bounds = getZoneBounds(zone);
				const rect = new google.maps.Rectangle({
					map,
					bounds: new google.maps.LatLngBounds(
						{ lat: bounds.south, lng: bounds.west },
						{ lat: bounds.north, lng: bounds.east },
					),
					fillColor: ZONE_COLORS[zone],
					fillOpacity: 0.08,
					strokeColor: ZONE_COLORS[zone],
					strokeOpacity: 0.4,
					strokeWeight: 1.5,
					clickable: false,
				});
				overlays.push(rect);

				const centerLat = (bounds.north + bounds.south) / 2;
				const centerLng = (bounds.east + bounds.west) / 2;
				const labelMarker = new google.maps.Marker({
					map,
					position: { lat: centerLat, lng: centerLng },
					icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
					label: {
						text: zone,
						color: ZONE_COLORS[zone],
						fontSize: "20px",
						fontWeight: "bold",
					},
					clickable: false,
				});
				overlays.push(labelMarker);
			});
		}

		// Depot marker
		const depotMarker = new google.maps.Marker({
			position: { lat: depotLat, lng: depotLng },
			map,
			icon: { url: depotSvg(44), anchor: new google.maps.Point(22, 22) },
			title: `${depotName} (Hub)`,
			zIndex: 1000,
		});
		overlays.push(depotMarker);
		markerCount++;
		const depotInfo = new google.maps.InfoWindow({
			content: `<div style="padding:6px 10px;border-left:4px solid #ff4f00;"><strong style="font-size:14px;">${depotName}</strong><div style="font-size:12px;color:#666;">Central Hub</div></div>`,
		});
		infoWindows.push(depotInfo);
		depotMarker.addListener("click", () =>
			depotInfo.open({ map, anchor: depotMarker }),
		);

		// ── FIX #5: Pickup clustering — cluster markers at same coordinates ──
		const pickupClusters = new Map<string, typeof pickupPointMarkers>();
		(pickupPointMarkers || []).forEach((pp) => {
			if (!isWithinBounds(pp.lat, pp.lng)) return;
			fitCoords.push({ lat: pp.lat, lng: pp.lng });
			const coordKey = `${pp.lat.toFixed(5)}_${pp.lng.toFixed(5)}`;
			if (!pickupClusters.has(coordKey)) {
				pickupClusters.set(coordKey, []);
			}
			const cluster = pickupClusters.get(coordKey);
			if (cluster) {
				cluster.push(pp);
			}
		});

		// Render pickup clusters
		pickupClusters.forEach((cluster, coordKey) => {
			if (!cluster) return;
			const [latStr, lngStr] = coordKey.split("_");
			const lat = parseFloat(latStr);
			const lng = parseFloat(lngStr);

			if (cluster.length > 1) {
				// FIX #5: Show cluster marker instead of offsetting
				const clusterMarker = new google.maps.Marker({
					position: { lat, lng },
					map,
					icon: {
						path: google.maps.SymbolPath.CIRCLE,
						scale: 16,
						fillColor: "#7c3aed",
						fillOpacity: 0.9,
						strokeColor: "#ffffff",
						strokeWeight: 2,
					},
					label: {
						text: String(cluster.length),
						color: "#ffffff",
						fontSize: "14px",
						fontWeight: "bold",
					},
					title: `${cluster.length} pickup points`,
					zIndex: 500,
				});
				overlays.push(clusterMarker);
				markerCount++;

				const clusterInfo = new google.maps.InfoWindow({
					content: `<div style="padding:8px;"><strong style="font-size:12px;">Pickup Cluster (${cluster.length})</strong><div style="font-size:11px;max-height:150px;overflow-y:auto;">${cluster.map((p) => `<div>• ${p.name}</div>`).join("")}</div></div>`,
				});
				infoWindows.push(clusterInfo);
				clusterMarker.addListener("click", () =>
					clusterInfo.open({ map, anchor: clusterMarker }),
				);
		} else if (cluster.length === 1) {
				const pp = cluster[0];
				const pinW = pp.selected ? 32 : 26;
				const pinH = pp.selected ? 44 : 36;
				const pinColor = pp.selected ? "#059669" : "#7c3aed";
				const ppMarker = new google.maps.Marker({
					position: { lat, lng },
					map,
					icon: {
						url: pickupPinSvg(pinW, pinH, pinColor, pp.selected ?? false),
						scaledSize: new google.maps.Size(pinW, pinH),
						// Anchor the tip of the pin at the location (bottom-center)
						anchor: new google.maps.Point(pinW / 2, pinH - 2),
					},
					title: pp.name,
					zIndex: 500,
				});
				overlays.push(ppMarker);
				markerCount++;
				const ppInfo = new google.maps.InfoWindow({
					content: `<div style="padding:6px 10px;border-left:4px solid ${pinColor};font-size:12px;font-weight:bold;">${pp.name}</div>`,
				});
				infoWindows.push(ppInfo);
				ppMarker.addListener("click", () =>
					ppInfo.open({ map, anchor: ppMarker }),
				);
			}
		});

		const overviewSeenCoords: Record<string, number> = {};
		const shiftColorMap = buildShiftColorMap(routes);

		const getStopLatLng = (stop: any) => {
			const emp = stop.employee;
			if (emp?.pickupPointId && emp?.pickupPoint) {
				return { lat: emp.pickupPoint.y, lng: emp.pickupPoint.x };
			}
			return { lat: emp?.y ?? stop.y ?? 21.0625, lng: emp?.x ?? stop.x ?? 79.0526 };
		};

		// Overview pass: all routes (or just selected)
		routes.forEach((route, idx) => {
			const isSelectedOverview = selectedRouteId === route.id;

			const overviewMode = routeViewModes?.[route.id]
				? routeViewModes[route.id] === "pickup"
				: route.isPickup;
			const sortedStops = getDisplayOrderedStops(route, overviewMode);
			if (sortedStops.length === 0) return;

			const routeColor =
				shiftColorMap.get(route.shiftId) ??
				SHIFT_PALETTE[idx % SHIFT_PALETTE.length];
			const overviewOpacity =
				selectedRouteId && !isSelectedOverview ? 0.25 : 0.4;
			const routeStart = getRouteStartLatLng(route);

			// Employee dot markers (overview — dim, no label)
			sortedStops.forEach((stop) => {
				const pos = getStopLatLng(stop);
				if (isWithinBounds(pos.lat, pos.lng)) {
					fitCoords.push(pos);
				}
				if (isSelectedOverview) return; // selected route gets its own detailed markers below

				const coordKey = `${pos.lat.toFixed(5)}_${pos.lng.toFixed(5)}`;
				const overlapCount = overviewSeenCoords[coordKey] || 0;
				overviewSeenCoords[coordKey] = overlapCount + 1;

				let markerY = pos.lat;
				let markerX = pos.lng;
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
						url: employeeSvg(
							20,
							"",
							routeColor,
							stop.employee.gender,
							false,
							overviewOpacity,
						),
						anchor: new google.maps.Point(10, 10),
					},
					zIndex: 10,
				});
				overlays.push(empMarker);
				empMarker.addListener("click", () => onSelectRoute(route.id));
			});

			// Overview polyline (thin, semi-transparent)
			if (!isSelectedOverview) {
				const overviewPath: any[] = [routeStart];
				sortedStops.forEach((stop) => {
					const pos = getStopLatLng(stop);
					if (isWithinBounds(pos.lat, pos.lng)) {
						overviewPath.push(pos);
					}
				});
				overviewPath.push({ lat: depotLat, lng: depotLng });

				if (overviewPath.length > 1) {
					const overviewPoly = new google.maps.Polyline({
						path: overviewPath,
						map,
						strokeColor: routeColor,
						strokeOpacity: selectedRouteId && !isSelectedOverview ? 0.15 : 0.35,
						strokeWeight: 1.5,
						zIndex: 2,
						icons: [
							{
								icon: {
									path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
									scale: 2,
									strokeColor: routeColor,
									strokeOpacity: 0.6,
									fillColor: routeColor,
									fillOpacity: 0.6,
								},
								offset: "60%",
							},
						],
					});
					overviewPoly.addListener("click", () => onSelectRoute(route.id));
					polylines.push(overviewPoly);
				}
			}

			// Overview driver-start marker (only when driver has real home coords)
			if (
				!isSelectedOverview &&
				!isDepotLatLng(routeStart.lat, routeStart.lng) &&
				isWithinBounds(routeStart.lat, routeStart.lng)
			) {
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
				startMarker.addListener("click", () => onSelectRoute(route.id));
			}
		});

		// ── Selected route: detailed markers + bold polyline ──────────────────────
		if (selectedRouteId) {
			const selectedRoute = routes.find((r) => r.id === selectedRouteId);
			if (selectedRoute && selectedRoute.stops.length > 0) {
				const selectedRouteIdx = routes.findIndex(
					(r) => r.id === selectedRouteId,
				);
				const selectedRouteColor =
					shiftColorMap.get(selectedRoute.shiftId) ??
					SHIFT_PALETTE[selectedRouteIdx % SHIFT_PALETTE.length];
				const stopsList = [...selectedRoute.stops].sort(
					(a, b) => a.stopOrder - b.stopOrder,
				);
				const effectiveIsPickup = routeViewModes?.[selectedRoute.id]
					? routeViewModes[selectedRoute.id] === "pickup"
					: true;
				const orderedStops = effectiveIsPickup
					? stopsList
					: [...stopsList].reverse();

				const routeStart = getRouteStartLatLng(selectedRoute);
				const seenCoords: Record<string, number> = {};

				// FIX #2: Driver start marker with confidence levels
				const hasPrecise = hasPreciseDriverStart(selectedRoute);
				const isNearAirport = isNearNagpurAirport(
					routeStart.lat,
					routeStart.lng,
				);
				const hasValidAddress = !!selectedRoute.cab.driverAddress?.trim();
				const driverConfidence = getDriverLocationConfidence(
					hasPrecise,
					isNearAirport,
					hasValidAddress,
				);

				const driverPos = hasPrecise
					? routeStart
					: { lat: depotLat + 0.0006, lng: depotLng - 0.0006 };

				fitCoords.push(driverPos);
				const startMarker = new google.maps.Marker({
					position: driverPos,
					map,
					icon: {
						url: driverStartSvg(48, selectedRouteColor),
						anchor: new google.maps.Point(24, 24),
					},
					zIndex: 35,
					title: selectedRoute.cab.driverName || "Driver",
				});
				overlays.push(startMarker);
				markerCount++;

				const startAddress = hasPrecise
					? selectedRoute.cab.formattedAddress ||
						selectedRoute.cab.driverAddress ||
						"Driver Location"
					: "Depot (Starting Point)";

				const confidenceBadge =
					driverConfidence === "LOW"
						? `<span style="font-size:10px;color:#f59e0b;margin-left:6px;">⚠ Low Confidence</span>`
						: driverConfidence === "MEDIUM"
							? `<span style="font-size:10px;color:#f59e0b;margin-left:6px;">ℹ Medium Confidence</span>`
							: "";

				const startInfo = new google.maps.InfoWindow({
					content: [
						`<div style="padding:6px 10px;border-left:4px solid ${selectedRouteColor};min-width:160px;">`,
						`<div style="font-size:13px;font-weight:700;color:#1c1b1f;">`,
						selectedRoute.cab.driverName || "Driver",
						confidenceBadge,
						`</div>`,
						`<div style="font-size:11px;color:#6b6b6b;margin-top:2px;">${selectedRoute.cab.vehicleNumber || ""}</div>`,
						selectedRoute.cab.driverPhone
							? `<div style="font-size:11px;color:#4a4a4a;margin-top:4px;">📞 ${selectedRoute.cab.driverPhone}</div>`
							: "",
						`<div style="font-size:11px;color:#6b6b6b;margin-top:4px;">📍 ${startAddress}</div>`,
						`</div>`,
					].join(""),
				});
				infoWindows.push(startInfo);
				startMarker.addListener("click", () => {
					infoWindows.forEach((iw) => iw.close());
					startInfo.open({ map, anchor: startMarker });
				});
				// Auto-open driver card when route is selected
				startInfo.open({ map, anchor: startMarker });

				orderedStops.forEach((stop, displayIdx) => {
					const isViolation = selectedRoute.violations.some(
						(v) =>
							!v.resolved &&
							((v.type === "FEMALE_FIRST_PICKUP" && stop.stopOrder === 1) ||
								(v.type === "FEMALE_LAST_DROP" &&
									stop.stopOrder === selectedRoute.stops.length)),
					);

					const pos = getStopLatLng(stop);
					if (isWithinBounds(pos.lat, pos.lng)) {
						fitCoords.push(pos);
					}

					const empAddress =
						(stop.employee.pickupPointId && stop.employee.pickupPoint)
							? `${stop.employee.pickupPoint.name} (Pickup Point) | ${stop.employee.address}`
							: (stop.employee.formattedAddress || stop.employee.address || "");
					const parts = empAddress.split(" | ");
					const pickupLabel = parts[0];
					const homeLabel = parts[1] || parts[0];
					const phone = stop.employee.phone || "N/A";
					const phoneParts = phone.split("/");
					const primaryPhone = phoneParts[0].trim();
					const secondaryPhone = phoneParts[1] ? phoneParts[1].trim() : null;
					const phoneDisplay = secondaryPhone
						? `<span title="Alt: ${secondaryPhone}">${primaryPhone} ℹ</span>`
						: primaryPhone;

					const coordKey = `${pos.lat.toFixed(5)}_${pos.lng.toFixed(5)}`;
					const overlapCount = seenCoords[coordKey] || 0;
					seenCoords[coordKey] = overlapCount + 1;

					let markerY = pos.lat;
					let markerX = pos.lng;
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
							url: employeeSvg(
								isHighlighted ? 32 : 26,
								String(displayIdx + 1),
								selectedRouteColor,
								stop.employee.gender,
								true,
								1,
								isHighlighted,
								isViolation,
							),
							anchor: new google.maps.Point(
								isHighlighted ? 16 : 13,
								isHighlighted ? 16 : 13,
							),
						},
						zIndex: isHighlighted ? 40 : 30,
					});
					overlays.push(empMarker);
					markerCount++;

					const empInfo = new google.maps.InfoWindow({
						content: [
							`<div style="padding:6px 10px;border-left:4px solid ${isViolation ? "#f59e0b" : selectedRouteColor};">`,
							`<span style="display:inline-block;background:${selectedRouteColor};color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-right:6px;">r${selectedRouteIdx + 1}</span>`,
							`<strong style="font-size:14px;">${stop.employee.name}</strong>`,
							isViolation
								? `<span style="font-size:10px;color:#d97706;margin-left:6px;">⚠ Safety violation</span>`
								: "",
							`<div style="margin:4px 0;font-size:11px;color:#666;">Stop #${displayIdx + 1} (${stop.etaMinutes} min)</div>`,
							`<div style="font-size:12px;">Pickup: ${pickupLabel}<br/>Home: ${homeLabel}<br/>Phone: ${phoneDisplay}</div>`,
							`</div>`,
						].join(""),
					});
					infoWindows.push(empInfo);
					empMarker.addListener("click", () => {
						infoWindows.forEach((iw) => iw.close());
						empInfo.open({ map, anchor: empMarker });
					});
					if (isHighlighted) empInfo.open({ map, anchor: empMarker });
				});

				// ── FIX #7: Bold polyline with OSRM geometry support ──
				let polyPath: any[];
				let isApproximateRoute = false;

				// Check if OSRM geometry exists for this route
				if (osrmGeometry && osrmGeometry[selectedRoute.id]) {
					polyPath = osrmGeometry[selectedRoute.id];
				} else {
					// Fallback to straight-line geometry
					isApproximateRoute = true;
					polyPath = [routeStart];
					orderedStops.forEach((stop) => {
						const pos = getStopLatLng(stop);
						if (isWithinBounds(pos.lat, pos.lng)) {
							polyPath.push(pos);
						}
					});
					polyPath.push({ lat: depotLat, lng: depotLng });
				}

				if (polyPath.length > 1) {
					const poly = new google.maps.Polyline({
						path: polyPath,
						map,
						strokeColor: selectedRouteColor,
						strokeOpacity: 0.85,
						strokeWeight: 3,
						zIndex: 5,
						icons: [
							{
								icon: {
									path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
									scale: 3,
									strokeColor: selectedRouteColor,
									strokeWeight: 1.5,
									fillColor: selectedRouteColor,
									fillOpacity: 1,
								},
								offset: "50%",
								repeat: "120px",
							},
						],
					});
					poly.addListener("click", () =>
						onSelectRoute(selectedRouteId ? null : selectedRoute.id),
					);
					polylines.push(poly);
					polylineCount++;
				}

				// FIX #7: Show "Approximate Route" badge if using straight-line geometry
				if (isApproximateRoute && polyPath.length > 0) {
					const midPoint = polyPath[Math.floor(polyPath.length / 2)];
					const badge = new google.maps.Marker({
						position: midPoint,
						map,
						icon: {
							path: google.maps.SymbolPath.CIRCLE,
							scale: 0,
						},
						label: {
							text: "≈ Approx",
							color: "#f59e0b",
							fontSize: "11px",
							fontWeight: "bold",
						},
						zIndex: 20,
						clickable: false,
					});
					overlays.push(badge);
				}
			}
		}

		// ── FIX #4: Auto-fit bounds based on autoFitRoutes setting ──
		const fitKey = selectedRouteId
			? `selected:${selectedRouteId}`
			: `all:${routes.map((r) => `${r.id}:${r.stops.length}`).join("|")}`;

		if (lastFitKeyRef.current !== fitKey && autoFitRoutes !== false && !searchQuery?.trim()) {
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

		// ── FIX #6: Performance metrics collection ──
		const perfEnd = performance.now();
		const renderTimeMs = Math.round((perfEnd - perfStart) * 10) / 10;
		if (onPerformanceMetrics && (markerCount > 0 || polylineCount > 0)) {
			onPerformanceMetrics({
				renderTimeMs,
				markerCount,
				polylineCount,
			});
		}

		return () => {
			overlays.forEach((o) => o.setMap(null));
			polylines.forEach((p) => p.setMap(null));
			infoWindows.forEach((iw) => iw.close());
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		mapReady,
		routes,
		selectedRouteId,
		mode,
		routeViewModes,
		selectedEmployeeId,
		pickupPointMarkers,
		depotLat,
		depotLng,
		depotName,
		showZoneOverlay,
		autoFitRoutes,
		osrmGeometry,
		onPerformanceMetrics,
	]);

	// ── render ─────────────────────────────────────────────────────────────────

	const shiftLegend = buildShiftColorMap(routes);

	return (
		<div className="relative w-full h-full">
			<div ref={containerRef} className="w-full h-full z-0 bg-[#f7f7f7]" />

			{/* Shift color legend */}
			{shiftLegend.size > 1 && (
				<div className="absolute top-3 left-3 z-[1000] p-2.5 bg-white/95 backdrop-blur-xs border border-[#e8e8e8] shadow-none flex flex-col gap-1.5 text-[10px] animate-fadeIn">
					<div className="font-bold text-[#1c1b1f] uppercase tracking-wider text-[9px] border-b border-slate-100 pb-1 mb-0.5">
						Shifts
					</div>
					{Array.from(shiftLegend.entries()).map(([shiftId, color]) => {
						const shiftRoute = routes.find((r) => r.shiftId === shiftId);
						const shiftName = shiftRoute?.shift?.startTime || shiftId;
						return (
							<div
								key={shiftId}
								className="flex items-center gap-1.5 font-semibold text-[#4a4a4a]"
							>
								<span
									className="w-3 h-3 rounded-sm flex-shrink-0"
									style={{ backgroundColor: color }}
								/>
								<span>{shiftName}</span>
							</div>
						);
					})}
				</div>
			)}

			{/* Route info panel (top-right) */}
			{selectedRouteId &&
				(mode === "ANALYTICS" ? (
					<div className="absolute top-4 right-4 z-[1000] p-4 bg-white/95 backdrop-blur-xs border border-[#e8e8e8] rounded-none shadow-none flex flex-col gap-2.5 text-xs text-left animate-fadeIn">
						<div className="font-bold text-[#1c1b1f] border-b border-slate-100 pb-1.5 uppercase tracking-wider text-[10px]">
							Optimization Comparison
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2 font-semibold">
								<span className="w-4 h-1.5 rounded-none bg-[#1c1b1f]" />
								<span className="text-[#4a4a4a] w-24">Optimized Route</span>
								<span className="text-[#6b6b6b] font-mono text-[10px] ml-auto font-bold text-[#1c1b1f]">
									{(() => {
										const bd = analysisData?.routeBreakdowns?.find(
											(rb: { routeId: string; optimizedKm: number }) =>
												rb.routeId === selectedRouteId,
										);
										return bd ? `${bd.optimizedKm} km` : "";
									})()}
								</span>
							</div>
							<div className="flex items-center gap-2 font-semibold">
								<span className="w-4 h-1.5 rounded-none bg-slate-400" />
								<span className="text-[#4a4a4a] w-24">Normal (Naive)</span>
								<span className="text-[#6b6b6b] font-mono text-[10px] ml-auto font-bold text-[#6b6b6b]">
									{(() => {
										const bd = analysisData?.routeBreakdowns?.find(
											(rb: { routeId: string; unoptimizedKm: number }) =>
												rb.routeId === selectedRouteId,
										);
										return bd ? `${bd.unoptimizedKm} km` : "";
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
									const color =
										STRATEGY_COLORS[v.strategy as keyof typeof STRATEGY_COLORS];
									return (
										<div
											key={v.strategy}
											className="flex items-center gap-2 font-semibold"
										>
											<span
												className="w-4 h-1.5 rounded-none"
												style={{ backgroundColor: color }}
											/>
											<span className="text-[#4a4a4a] capitalize w-16">
												{v.strategy.toLowerCase()}
											</span>
											<span className="text-[#6b6b6b] font-mono text-[10px] ml-auto">
												{v.totalDistance} km · {v.totalDuration}m
											</span>
										</div>
									);
								})}
							</div>
						</div>
					)
				))}
		</div>
	);
}
