/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapPin, Briefcase, Truck, Navigation, X } from "lucide-react";
import EmployeeSearchBar from "./EmployeeSearchBar";

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
	const [hoveredVehicle, setHoveredVehicle] = useState<string | null>(null);
	const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
	const [shifts, setShifts] = useState<any[]>([]);

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

	// Fetch shifts
	useEffect(() => {
		const fetchShifts = async () => {
			try {
				const res = await fetch("/api/shifts");
				if (res.ok) {
					const data = await res.json();
					setShifts(data);
				}
			} catch (error) {
				console.error("Failed to fetch shifts:", error);
			}
		};
		fetchShifts();
	}, []);

	// Update map when data changes
	useEffect(() => {
		if (mapRef.current) {
			updateMapContent();
		}
	}, [
		employees,
		pickupPoints,
		vehicles,
		selectedPoint,
		hoveredEmployee,
		selectedEmployee,
	]);

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

			// Create SVG pin marker using canvas
			const zoneColor = zoneColors[point.zone || "N"] || "#3b82f6";

			// Create marker using canvas for better compatibility
			const canvas = document.createElement("canvas");
			canvas.width = 32;
			canvas.height = 45;
			const ctx = canvas.getContext("2d");
			if (ctx) {
				// Draw pin shape
				ctx.fillStyle = zoneColor;
				ctx.beginPath();
				ctx.moveTo(16, 0);
				ctx.bezierCurveTo(16, 0, 8, 8, 8, 15);
				ctx.bezierCurveTo(8, 25, 16, 45, 16, 45);
				ctx.bezierCurveTo(16, 45, 24, 25, 24, 15);
				ctx.bezierCurveTo(24, 8, 16, 0, 16, 0);
				ctx.fill();

				// Draw white circle in center
				ctx.fillStyle = "white";
				ctx.beginPath();
				ctx.arc(16, 13, 3.5, 0, Math.PI * 2);
				ctx.fill();
			}

			const iconUrl = canvas.toDataURL("image/png");

			const marker = new window.google.maps.Marker({
				position: latlng,
				map: mapRef.current,
				title: `${point.name} (${empCount} employees)`,
				icon: {
					url: iconUrl,
					scaledSize: new window.google.maps.Size(32, 45),
					anchor: new window.google.maps.Point(16, 45),
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

		// Add employee markers with zone colors
		const zoneEmpColors: Record<string, string> = {
			N: "#3b82f6", // Blue
			S: "#ef4444", // Red
			E: "#10b981", // Green
			W: "#f59e0b", // Amber/Orange
		};

		employees.forEach((emp) => {
			if (emp.pickupPoint?.latitude && emp.pickupPoint?.longitude) {
				const latlng = new window.google.maps.LatLng(
					emp.pickupPoint.latitude,
					emp.pickupPoint.longitude,
				);
				bounds.extend(latlng);

				const isHovered = hoveredEmployee === emp.id;
				const isSelected = selectedEmployee?.id === emp.id;
				const empZone = emp.zone || "N";
				const baseColor = zoneEmpColors[empZone];

				const marker = new window.google.maps.Marker({
					position: latlng,
					map: mapRef.current,
					title: emp.name,
					icon: {
						path: "M0,-24C-13.3,-24 -24,-13.3 -24,0C-24,24 0,48 0,48C0,48 24,24 24,0C24,-13.3 13.3,-24 0,-24Z",
						scale: isSelected ? 1.8 : isHovered ? 1.4 : 1,
						fillColor: isSelected ? "#000000" : baseColor,
						fillOpacity: isSelected ? 1 : isHovered ? 0.9 : 0.75,
						strokeColor: isSelected ? "#ffff00" : "#ffffff",
						strokeWeight: isSelected ? 4 : 2,
					},
					clickable: true,
				});

				const infoWindow = new window.google.maps.InfoWindow({
					content: `
          <div class="p-3 max-w-xs text-sm bg-white rounded shadow-lg border-l-4" style="border-color: ${baseColor}">
            <div class="font-bold text-gray-900 text-base">${emp.name}</div>
            <div class="text-xs text-gray-600 mt-2">📧 ${emp.email || "N/A"}</div>
            <div class="text-xs text-gray-600">📱 ${emp.phone || "N/A"}</div>
            <div class="text-xs text-gray-600 mt-1">📍 ${emp.address || "N/A"}</div>
            <div class="mt-3 px-2 py-1 rounded text-xs font-semibold" style="background-color: ${baseColor}20; color: ${baseColor}">
              ✓ Zone ${empZone}
            </div>
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

		// Auto-zoom to selected employee
		if (selectedEmployee?.lat && selectedEmployee?.lng) {
			const empLatlng = new window.google.maps.LatLng(
				selectedEmployee.lat,
				selectedEmployee.lng,
			);
			mapRef.current.setZoom(15);
			mapRef.current.panTo(empLatlng);
		}

		// Add vehicle/driver markers
		vehicles.forEach((vehicle) => {
			const driver_emoji = "🚕";
			const isHovered = hoveredVehicle === vehicle.id;
			const driverLat = 21.14 + Math.random() * 0.05;
			const driverLng = 79.09 + Math.random() * 0.05;

			const latlng = new window.google.maps.LatLng(driverLat, driverLng);
			bounds.extend(latlng);

			const marker = new window.google.maps.Marker({
				position: latlng,
				map: mapRef.current,
				title: `${vehicle.vehicleNumber} - ${vehicle.driverName}`,
				icon: {
					path: "M0,-24C-13.3,-24 -24,-13.3 -24,0C-24,24 0,48 0,48C0,48 24,24 24,0C24,-13.3 13.3,-24 0,-24Z",
					scale: isHovered ? 1.3 : 1,
					fillColor: isHovered ? "#ff9800" : "#ff6b35",
					fillOpacity: isHovered ? 1 : 0.7,
					strokeColor: "#ffffff",
					strokeWeight: 2,
				},
				clickable: true,
			});

			const infoWindow = new window.google.maps.InfoWindow({
				content: `
          <div class="p-2 max-w-xs text-sm bg-orange-50">
            <div class="font-bold text-orange-700">${vehicle.vehicleNumber}</div>
            <div class="text-gray-700">Driver: ${vehicle.driverName}</div>
            <div class="text-xs text-gray-600 mt-1 font-semibold">
              Status: <span class="text-green-600">${vehicle.status}</span>
            </div>
          </div>
        `,
			});

			marker.addListener("mouseover", () => {
				infoWindow.open(mapRef.current, marker);
				setHoveredVehicle(vehicle.id);
			});

			marker.addListener("mouseout", () => {
				infoWindow.close();
				setHoveredVehicle(null);
			});

			markersRef.current.push(marker);
		});

		// Draw route polylines
		const routePoints = pickupPoints.map((p) => ({
			lat: p.latitude,
			lng: p.longitude,
		}));

		if (routePoints.length > 1) {
			const polylineColors = ["#00bcd4", "#2196f3", "#9c27b0", "#f44336"];
			const polyline = new window.google.maps.Polyline({
				path: routePoints,
				geodesic: true,
				strokeColor: polylineColors[0],
				strokeOpacity: 0.7,
				strokeWeight: 3,
				map: mapRef.current,
				icons: [
					{
						icon: {
							path: "M 0,-1 0,1",
							strokeOpacity: 0.8,
							scale: 4,
						},
						offset: "0",
						repeat: "20px",
					},
				],
			});
			polylineRef.current = polyline;
		}

		// Auto-fit bounds
		if (autoZoom && markersRef.current.length > 0) {
			mapRef.current.fitBounds(bounds);
		}
	};

	return (
		<div className="w-full h-full flex flex-col bg-gray-50">
			{/* Header */}
			<div className="bg-white border-b border-gray-200 p-4 shadow-sm">
				<div className="flex items-center justify-between mb-2">
					<div className="flex items-center gap-2">
						<Navigation className="w-5 h-5 text-blue-600" />
						<h1 className="text-2xl font-bold text-gray-900">{title}</h1>
					</div>
					<div className="w-full max-w-md">
						<EmployeeSearchBar
							employees={employees}
							shifts={shifts}
							onSelectEmployee={setSelectedEmployee}
						/>
					</div>
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
								Employees (
								{
									employees.filter(
										(e) => e.pickupPoint?.id === selectedPoint.id,
									).length
								}
								)
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

				{/* Selected Employee Info Panel */}
				{selectedEmployee && (
					<div className="absolute bottom-6 right-6 bg-white rounded-lg shadow-lg p-4 max-w-sm border-l-4 border-red-500">
						<div className="flex items-center justify-between mb-3">
							<div className="font-bold text-gray-900 text-lg">
								{selectedEmployee.name}
							</div>
							<button
								onClick={() => setSelectedEmployee(null)}
								className="text-gray-500 hover:text-gray-700"
							>
								<X size={20} />
							</button>
						</div>

						{/* Zone Badge */}
						<div className="mb-3">
							<span
								className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
									selectedEmployee.zone === "N"
										? "bg-blue-100 text-blue-800"
										: selectedEmployee.zone === "S"
											? "bg-red-100 text-red-800"
											: selectedEmployee.zone === "E"
												? "bg-green-100 text-green-800"
												: "bg-purple-100 text-purple-800"
								}`}
							>
								Zone {selectedEmployee.zone}
							</span>
						</div>

						{/* Contact Info */}
						<div className="text-sm space-y-2 mb-3 border-b pb-3">
							<div className="flex items-center gap-2">
								<span className="text-gray-600">📧</span>
								<span className="text-gray-700">{selectedEmployee.email}</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-gray-600">📱</span>
								<span className="text-gray-700">{selectedEmployee.phone}</span>
							</div>
							<div className="flex items-start gap-2">
								<span className="text-gray-600">📍</span>
								<span className="text-gray-700 text-xs">
									{selectedEmployee.address}
								</span>
							</div>
						</div>

						{/* Shift Info */}
						<div className="mb-3 bg-blue-50 rounded p-3">
							<div className="text-xs font-semibold text-gray-700 mb-1">
								📅 Shift Information
							</div>
							<div className="text-sm font-bold text-blue-700">
								{selectedEmployee.shift}
							</div>
							<div className="text-xs text-gray-600">
								🕐 {selectedEmployee.shiftTime}
							</div>
						</div>

						{/* Coordinates */}
						<div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
							<div className="font-semibold mb-1">Coordinates</div>
							<div>Lat: {selectedEmployee.lat?.toFixed(4)}</div>
							<div>Lng: {selectedEmployee.lng?.toFixed(4)}</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
