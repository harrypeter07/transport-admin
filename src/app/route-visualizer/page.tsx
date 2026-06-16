'use client';

import React, { useEffect, useState } from 'react';
import PickupMapView from '@/components/PickupMapView';
import { useRouter } from 'next/navigation';
import { LogOut, Home } from 'lucide-react';

interface PickupPoint {
	id: string;
	name: string;
	address: string;
	x: number;
	y: number;
	zone: string;
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
	pickupPointId: string | null;
	pickupPoint: PickupPoint | null;
}

export default function RouteVisualizerPage() {
	const router = useRouter();
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
	const [vehicles, setVehicles] = useState<Vehicle[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchData();
	}, []);

	const fetchData = async () => {
		try {
			setLoading(true);

			// Fetch employees
			const empRes = await fetch('/api/employees');
			if (!empRes.ok) throw new Error('Failed to fetch employees');
			const empData = await empRes.json();
			setEmployees(empData.employees || []);

			// Fetch pickup points
			const ppRes = await fetch('/api/pickup-points');
			if (!ppRes.ok) throw new Error('Failed to fetch pickup points');
			const ppData = await ppRes.json();
			setPickupPoints(ppData.pickupPoints || []);

			// Fetch vehicles
			const vehicleRes = await fetch('/api/cabs');
			if (!vehicleRes.ok) throw new Error('Failed to fetch vehicles');
			const vehicleData = await vehicleRes.json();
			setVehicles(vehicleData.cabs || []);

			setError(null);
		} catch (err) {
			console.error('Error fetching data:', err);
			setError(
				err instanceof Error
					? err.message
					: 'Failed to load data. Please try again.',
			);
		} finally {
			setLoading(false);
		}
	};

	const handleLogout = async () => {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			router.push('/login');
		} catch (error) {
			console.error('Logout error:', error);
		}
	};

	if (loading) {
		return (
			<div className="w-full h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading route visualizer...</p>
				</div>
			</div>
		);
	}

	const transformPickupPoints = pickupPoints.map((pp) => ({
		id: pp.id,
		name: pp.name,
		address: pp.address || '',
		latitude: pp.y || 0,
		longitude: pp.x || 0,
		zone: pp.zone,
	}));

	const transformVehicles = vehicles.map((v) => ({
		id: v.id,
		vehicleNumber: v.vehicleNumber,
		driverName: v.driverName,
		status: v.status,
	}));

	const transformEmployees = employees.map((emp) => {
		const pickupPoint = pickupPoints.find((pp) => pp.id === emp.pickupPointId);
		return {
			id: emp.id,
			name: emp.name,
			email: emp.email,
			phone: emp.phone,
			address: emp.address,
			pickupPoint: pickupPoint
				? {
						id: pickupPoint.id,
						name: pickupPoint.name,
						address: pickupPoint.address,
						latitude: pickupPoint.y,
						longitude: pickupPoint.x,
						zone: pickupPoint.zone,
					}
				: undefined,
		};
	});

	return (
		<div className="w-full h-screen flex flex-col bg-gray-50">
			{/* Top Navigation */}
			<div className="bg-white border-b border-gray-200 shadow-sm">
				<div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Home className="w-6 h-6 text-blue-600" />
						<h1 className="text-xl font-bold text-gray-900">
							Route Visualizer Dashboard
						</h1>
					</div>
					<button
						onClick={handleLogout}
						className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
					>
						<LogOut className="w-4 h-4" />
						Logout
					</button>
				</div>
			</div>

			{/* Content */}
			{error ? (
				<div className="flex-1 flex items-center justify-center p-4">
					<div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center">
						<div className="text-red-600 font-semibold mb-2">Error Loading Data</div>
						<p className="text-red-600 text-sm mb-4">{error}</p>
						<button
							onClick={fetchData}
							className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
						>
							Try Again
						</button>
					</div>
				</div>
			) : (
				<div className="flex-1 overflow-hidden">
					<PickupMapView
						employees={transformEmployees}
						pickupPoints={transformPickupPoints}
						vehicles={transformVehicles}
						title="📍 All Employees & Pickup Points"
						showStats={true}
						autoZoom={true}
					/>
				</div>
			)}

			{/* Footer Stats */}
			<div className="bg-white border-t border-gray-200 px-4 py-3 text-center text-sm text-gray-600">
				Last updated: {new Date().toLocaleTimeString()} | Total Employees:{' '}
				<span className="font-semibold text-blue-600">{transformEmployees.length}</span> |
				Pickup Points:{' '}
				<span className="font-semibold text-green-600">{transformPickupPoints.length}</span> |
				Vehicles:{' '}
				<span className="font-semibold text-purple-600">{transformVehicles.length}</span>
			</div>
		</div>
	);
}
