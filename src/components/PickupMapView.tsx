"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapPin, Briefcase, Truck, Navigation } from "lucide-react";

interface PickupPoint {
	id: string;
	name: string;
	address: string;
	latitude: number;
	longitude: number;
	zone?: string;
}

interface Vehicle {
	id: string;
	vehicleNumber: string;
	driverName: string;
	status: string;
}

interface Employee {
	id: string;
	name: string;
	email: string;
	phone: string;
	address: string;
	pickupPoint?: PickupPoint;
	vehicle?: Vehicle;
}

interface PickupMapViewProps {
	employees: Employee[];
	pickupPoints: PickupPoint[];
	vehicles: Vehicle[];
	title?: string;
	showStats?: boolean;
	autoZoom?: boolean;
}

const NAGPUR_CENTER = { lat: 21.1442, lng: 79.0882 };

export default function PickupMapView({
	employees = [],
	pickupPoints = [],
	vehicles = [],
	title = "Employee Pickup Points & Routes",
	showStats = true,
	autoZoom = true,
}: PickupMapViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<any>(null);
	const markersRef = useRef<any[]>([]);
	const polylineRef = useRef<any>(null);

	const [stats, setStats] = useState({
		totalEmployees: 0,
		totalPickupPoints: 0,
		totalVehicles: 0,
		activeRoutes: 0,
	});

	const [selectedPoint, setSelectedPoint] = useState<PickupPoint | null>(null);
	const [hoveredEmployee, setHoveredEmployee] = useState<string | null>(null);

	// Initialize map
	useEffect(() => {
		if (!containerRef.current || mapRef.current) return;

		const script = document.createElement("script");
		script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
		script.async = true;
		script.defer = true;

		script.onload = () => {
			if (window.google) {
				initializeMap();
			}
		};

		document.head.appendChild(script);

		return () => {
			document.head.removeChild(script);
		};
	}, []);

	// Update map when data changes
	useEffect(() => {
		if (mapRef.current) {
			updateMapContent();
		}
	}, [employees, pickupPoints, vehicles, selectedPoint, hoveredEmployee]);

	// Calculate stats
	useEffect(() => {
		setStats({
			totalEmployees: employees.length,
			totalPickupPoints: pickupPoints.length,
			totalVehicles: vehicles.length,
			activeRoutes: vehicles.filter((v) => v.status === "ACTIVE").length,
		});
	}, [employees, pickupPoints, vehicles]);

	const initializeMap = () => {
		if (!window.google || !containerRef.current) return;

		mapRef.current = new window.google.maps.Map(containerRef.current, {
			center: NAGPUR_CENTER,
			zoom: 12,
			mapTypeControl: true,
			fullscreenControl: true,
			zoomControl: true,
			streetViewControl: false,
			styles: [
				{
					featureType: "poi.business",
					stylers: [{ visibility: "off" }],
				},
				{
					featureType: "transit",
					stylers: [{ visibility: "off" }],
				},
				{
					featureType: "landscape",
					stylers: [{ color: "#f2eee9" }],
				},
			],
		});
	};

	const updateMapContent = () => {
		if (!mapRef.current) return;

		// Clear existing markers
		markersRef.current.forEach((marker) => marker.setMap(null));
		markersRef.current = [];

		// Clear polyline
		if (polylineRef.current) {
			polylineRef.current.setMap(null);
			polylineRef.current = null;
		}

		// Add pickup point markers
		const bounds = new window.google.maps.LatLngBounds();
		const zoneColors: Record<string, string> = {
			N: "#3b82f6",
			S: "#ef4444",
			E: "#10b981",
			W: "#8b5cf6",
		};

		pickupPoints.forEach((point) => {
			const latlng = new window.google.maps.LatLng(
				point.latitude,
				point.longitude,
			);
			bounds.extend(latlng);

			const isSelected = selectedPoint?.id === point.id;
			const empCount = employees.filter(
				(e) => e.pickupPoint?.id === point.id,
			).length;

			const marker = new window.google.maps.Marker({
				position: latlng,
				map: mapRef.current,
				title: `${point.name} (${empCount} employees)`,
				icon: {
					path: window.google.maps.SymbolPath.CIRCLE,
					scale: isSelected ? 15 : 10,
					fillColor: zoneColors[point.zone || "N"] || "#3b82f6",
					fillOpacity: isSelected ? 1 : 0.7,
					strokeColor: "#ffffff",
					strokeWeight: 2,
				},
				clickable: true,
			});

			marker.addListener("click", () => {
				setSelectedPoint(isSelected ? null : point);
			});

			// Info window
			const infoWindow = new window.google.maps.InfoWindow({
				content: `
          <div class="p-3 max-w-xs">
            <div class="font-bold text-sm">${point.name}</div>
            <div class="text-xs text-gray-600">${point.address || "N/A"}</div>
            <div class="mt-2 text-xs">
              <span class="font-semibold">${empCount} employees</span>
            </div>
          </div>
        `,
			});

			marker.addListener("mouseover", () => {
				infoWindow.open(mapRef.current, marker);
			});

			marker.addListener("mouseout", () => {
				infoWindow.close();
			});

			markersRef.current.push(marker);
		});

		// Add employee markers
		employees.forEach((emp) => {
			if (emp.pickupPoint?.latitude && emp.pickupPoint?.longitude) {
				const latlng = new window.google.maps.LatLng(
					emp.pickupPoint.latitude,
					emp.pickupPoint.longitude,
				);
				bounds.extend(latlng);

				const isHovered = hoveredEmployee === emp.id;
				const marker = new window.google.maps.Marker({
					position: latlng,
					map: mapRef.current,
					title: emp.name,
					icon: {
						path: "M0,-32C-17.7,-32 -32,-17.7 -32,0C-32,32 0,64 0,64C0,64 32,32 32,0C32,-17.7 17.7,-32 0,-32Z",
						scale: isHovered ? 1.5 : 1,
						fillColor: isHovered ? "#ef4444" : "#64748b",
						fillOpacity: isHovered ? 1 : 0.6,
						strokeColor: "#ffffff",
						strokeWeight: 1.5,
					},
					clickable: true,
				});

				const infoWindow = new window.google.maps.InfoWindow({
					content: `
            <div class="p-2 max-w-xs text-sm">
              <div class="font-bold">${emp.name}</div>
              <div class="text-gray-600">${emp.email}</div>
              <div class="text-gray-600">${emp.phone}</div>
              <div class="text-xs text-gray-500 mt-1">${emp.pickupPoint?.name}</div>
            </div>
          `,
				});

				marker.addListener("mouseover", () => {
					infoWindow.open(mapRef.current, marker);
					setHoveredEmployee(emp.id);
				});

				marker.addListener("mouseout", () => {
					infoWindow.close();
					setHoveredEmployee(null);
				});

				markersRef.current.push(marker);
			}
		});

		// Auto-fit bounds
		if (autoZoom && markersRef.current.length > 0) {
			mapRef.current.fitBounds(bounds);
		}
	};

	return (
		<div className="w-full h-full flex flex-col bg-gray-50">
			{/* Header */}
			<div className="bg-white border-b border-gray-200 p-4 shadow-sm">
				<div className="flex items-center gap-2 mb-2">
					<Navigation className="w-5 h-5 text-blue-600" />
					<h1 className="text-2xl font-bold text-gray-900">{title}</h1>
				</div>

				{showStats && (
					<div className="grid grid-cols-4 gap-4 mt-4">
						<div className="bg-blue-50 rounded-lg p-3">
							<div className="flex items-center gap-2">
								<Briefcase className="w-4 h-4 text-blue-600" />
								<div>
									<div className="text-xs text-gray-600">Employees</div>
									<div className="text-lg font-bold text-blue-600">
										{stats.totalEmployees}
									</div>
								</div>
							</div>
						</div>

						<div className="bg-green-50 rounded-lg p-3">
							<div className="flex items-center gap-2">
								<MapPin className="w-4 h-4 text-green-600" />
								<div>
									<div className="text-xs text-gray-600">Pickup Points</div>
									<div className="text-lg font-bold text-green-600">
										{stats.totalPickupPoints}
									</div>
								</div>
							</div>
						</div>

						<div className="bg-purple-50 rounded-lg p-3">
							<div className="flex items-center gap-2">
								<Truck className="w-4 h-4 text-purple-600" />
								<div>
									<div className="text-xs text-gray-600">Vehicles</div>
									<div className="text-lg font-bold text-purple-600">
										{stats.totalVehicles}
									</div>
								</div>
							</div>
						</div>

						<div className="bg-orange-50 rounded-lg p-3">
							<div className="flex items-center gap-2">
								<Navigation className="w-4 h-4 text-orange-600" />
								<div>
									<div className="text-xs text-gray-600">Active Routes</div>
									<div className="text-lg font-bold text-orange-600">
										{stats.activeRoutes}
									</div>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Map Container */}
			<div className="flex-1 relative overflow-hidden">
				<div
					ref={containerRef}
					className="w-full h-full bg-gray-100"
					style={{ minHeight: "500px" }}
				/>

				{/* Selected Pickup Point Info */}
				{selectedPoint && (
					<div className="absolute bottom-6 left-6 bg-white rounded-lg shadow-lg p-4 max-w-xs">
						<div className="font-bold text-gray-900 mb-2">
							{selectedPoint.name}
						</div>
						<div className="text-sm text-gray-600 mb-3">
							{selectedPoint.address}
						</div>

						{/* Employees at this pickup */}
						<div className="border-t pt-3">
							<div className="text-xs font-semibold text-gray-700 mb-2">
								Employees ({employees.filter((e) => e.pickupPoint?.id === selectedPoint.id).length})
							</div>
							<div className="space-y-1 max-h-40 overflow-y-auto">
								{employees
									.filter((e) => e.pickupPoint?.id === selectedPoint.id)
									.map((emp) => (
										<div
											key={emp.id}
											className="text-xs text-gray-600 hover:bg-gray-50 p-1 rounded cursor-pointer"
											onMouseEnter={() => setHoveredEmployee(emp.id)}
											onMouseLeave={() => setHoveredEmployee(null)}
										>
											<div className="font-medium">{emp.name}</div>
											<div className="text-gray-500">{emp.email}</div>
										</div>
									))}
							</div>
						</div>

						<button
							onClick={() => setSelectedPoint(null)}
							className="mt-3 w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 rounded"
						>
							Close
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
