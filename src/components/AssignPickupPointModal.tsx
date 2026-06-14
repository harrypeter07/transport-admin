"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { X, MapPin, Loader2 } from "lucide-react";
import LocationAutocomplete from "@/components/LocationAutocomplete";

const GoogleMapView = dynamic(() => import("./GoogleMapView"), { ssr: false });

type NearbyPickupPoint = {
  id: string;
  name: string;
  x: number;
  y: number;
  zone: string;
  subZone: string;
  employeeCount: number;
  distanceKm?: string;
};

type EmployeeTarget = {
  id: string;
  name: string;
  address: string;
  x: number;
  y: number;
  shiftId?: string | null;
};

interface AssignPickupPointModalProps {
  employee: EmployeeTarget;
  onClose: () => void;
  onAssigned: (pickupPointId: string) => void;
}

export default function AssignPickupPointModal({
  employee,
  onClose,
  onAssigned,
}: AssignPickupPointModalProps) {
  const [nearby, setNearby] = useState<NearbyPickupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [autoAddress, setAutoAddress] = useState<{
    displayName?: string;
    lat?: number;
    lon?: number;
  } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch(
        `/api/pickup-points?nearX=${employee.x}&nearY=${employee.y}&radiusKm=3`
      ).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/maps-key").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([points, keyData, settingsData]) => {
        setNearby(Array.isArray(points) ? points : []);
        setApiKey(keyData.key || "");
        setSettings(settingsData);
      })
      .catch(() => setError("Failed to load nearby pickup points"))
      .finally(() => setLoading(false));
  }, [employee.x, employee.y]);

  const mapRoutes = useMemo(
    (): any[] => [
      {
        id: `assign_${employee.id}`,
        cabId: "assign",
        vehicleNumber: employee.name,
        isPickup: true,
        stops: [
          {
            id: `stop_${employee.id}`,
            employeeId: employee.id,
            stopOrder: 1,
            etaMinutes: 0,
            status: "PENDING" as const,
            employee: { ...employee, gender: "M" },
          },
        ],
        totalDistance: 0,
        totalDuration: 0,
        cab: { driverName: employee.name, vehicleNumber: "Employee", driverPhone: "" },
      },
    ],
    [employee]
  );

  const assignTo = async (pickupPointId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupPointId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Assignment failed");
      }
      onAssigned(pickupPointId);
    } catch (e: any) {
      setError(e.message || "Assignment failed");
      setSubmitting(false);
    }
  };

  const createAndAssign = async () => {
    const lat = autoAddress?.lat ?? employee.y;
    const lon = autoAddress?.lon ?? employee.x;
    if (!newName.trim()) {
      setError("Pickup point name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await fetch("/api/pickup-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          x: lon,
          y: lat,
          address: autoAddress?.displayName || employee.address,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create pickup point");
      }
      const created = await createRes.json();
      await assignTo(created.id);
    } catch (e: any) {
      setError(e.message || "Failed to create pickup point");
      setSubmitting(false);
    }
  };

  const depotLat = settings?.defaultDepotLat ?? 21.0625;
  const depotLng = settings?.defaultDepotLng ?? 79.0526;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#e8e8e8] shadow-xl">
        <div className="flex items-start justify-between p-5 border-b border-[#e8e8e8] sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-sm font-black text-[#1c1b1f]">
              Assign pickup point for {employee.name}
            </h2>
            <p className="text-[11px] text-[#6b6b6b] mt-1">{employee.address}</p>
          </div>
          <button onClick={onClose} className="p-1 text-[#9a9a9a] hover:text-[#1c1b1f]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="h-[220px] border border-[#e8e8e8]">
            {apiKey ? (
              <GoogleMapView
                routes={mapRoutes}
                selectedRouteId={`assign_${employee.id}`}
                onSelectRoute={() => {}}
                apiKey={apiKey}
                depotLat={depotLat}
                depotLng={depotLng}
                depotName={settings?.depotName || "MIHAN Depot"}
                pickupPointMarkers={[
                  ...nearby.map((pp) => ({
                    id: pp.id,
                    name: pp.name,
                    lat: pp.y,
                    lng: pp.x,
                    selected: selectedId === pp.id,
                  })),
                ]}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#9a9a9a]">
                Loading map…
              </div>
            )}
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase text-[#9a9a9a] mb-2">
              Nearby pickup points (within 3 km)
            </h3>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-[#9a9a9a]">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : nearby.length === 0 ? (
              <p className="text-xs text-[#9a9a9a]">No pickup points within 3 km.</p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {nearby.map((pp) => (
                  <div
                    key={pp.id}
                    className={`flex items-center justify-between p-3 border text-xs ${
                      selectedId === pp.id
                        ? "border-[#059669] bg-[#ecfdf5]"
                        : "border-[#e8e8e8] bg-[#fafafa]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#059669] mt-0.5" />
                      <div>
                        <div className="font-bold text-[#1c1b1f]">{pp.name}</div>
                        <div className="text-[10px] text-[#9a9a9a] font-mono">
                          {pp.distanceKm ?? "?"} km · {pp.employeeCount} assigned · {pp.subZone}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setSelectedId(pp.id);
                        assignTo(pp.id);
                      }}
                      className="px-2 py-1 bg-[#1c1b1f] text-white text-[10px] font-bold uppercase disabled:opacity-50"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#e8e8e8] pt-4">
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="text-[10px] font-bold uppercase text-[#ff4f00] mb-3"
            >
              {showCreate ? "Hide create form" : "+ Create new pickup point"}
            </button>
            {showCreate && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#9a9a9a]">Name</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Majestic Manor Gate"
                    className="w-full mt-1 border border-[#e8e8e8] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-[#9a9a9a]">Address</label>
                  <LocationAutocomplete
                    defaultValue={employee.address}
                    onSelect={(place) =>
                      setAutoAddress({
                        displayName: place.displayName,
                        lat: place.lat,
                        lon: place.lon,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={createAndAssign}
                  className="w-full py-2 bg-[#059669] text-white text-xs font-bold disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Create & Assign"}
                </button>
              </div>
            )}
          </div>

          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-[#e8e8e8] bg-[#f7f7f7]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[#6b6b6b] border border-[#e8e8e8] bg-white"
          >
            Cancel
          </button>
          {selectedId && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => assignTo(selectedId)}
              className="px-4 py-2 text-xs font-bold text-white bg-[#1c1b1f] disabled:opacity-50"
            >
              Confirm Assignment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
