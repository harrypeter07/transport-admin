"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronRight, Plus, MapPin, Users, X, Search } from "lucide-react";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { ZONE_COLORS, haversineKm } from "@/lib/zones";

const GoogleMapView = dynamic(() => import("@/components/GoogleMapView"), { ssr: false });

type PickupPoint = {
  id: string;
  name: string;
  x: number;
  y: number;
  zone: string;
  subZone: string;
  distanceRing?: string;
  address?: string | null;
  landmark?: string | null;
  employeeCount: number;
};

type Employee = {
  id: string;
  name: string;
  employeeCode: string;
  x: number;
  y: number;
  zone?: string | null;
  subZone?: string | null;
  pickupPointId?: string | null;
  gender: string;
};

export default function PickupPointsPage() {
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [autoAddress, setAutoAddress] = useState<{
    displayName?: string;
    placeId?: string;
    lat?: number;
    lon?: number;
  } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [settings, setSettings] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ppRes, empRes, keyRes, settingsRes] = await Promise.all([
        fetch("/api/pickup-points"),
        fetch("/api/employees"),
        fetch("/api/maps-key"),
        fetch("/api/settings"),
      ]);
      if (ppRes.ok) setPickupPoints(await ppRes.json());
      if (empRes.ok) setEmployees(await empRes.json());
      if (keyRes.ok) {
        const k = await keyRes.json();
        setApiKey(k.key || "");
      }
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedPoint = pickupPoints.find((p) => p.id === selectedPointId) || null;

  const filteredPoints = useMemo(() => {
    return pickupPoints.filter((pp) => {
      if (zoneFilter && pp.zone !== zoneFilter) return false;
      if (search && !pp.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [pickupPoints, zoneFilter, search]);

  const assignedEmployees = useMemo(() => {
    if (!selectedPointId) return [];
    return employees.filter((e) => e.pickupPointId === selectedPointId);
  }, [employees, selectedPointId]);

  const nearbyUnassigned = useMemo(() => {
    if (!selectedPoint) return [];
    return employees
      .filter((e) => !e.pickupPointId)
      .map((e) => ({
        ...e,
        distKm: haversineKm(selectedPoint.y, selectedPoint.x, e.y, e.x),
      }))
      .filter((e) => e.distKm <= 2)
      .sort((a, b) => a.distKm - b.distKm);
  }, [employees, selectedPoint]);

  const unassignedEmployees = useMemo(
    () => employees.filter((e) => !e.pickupPointId),
    [employees]
  );

  const mapRoutes = useMemo((): any[] => {
    const stops = employees.map((e, i) => ({
      id: `pp_stop_${e.id}`,
      employeeId: e.id,
      stopOrder: i + 1,
      etaMinutes: 0,
      status: "PENDING" as const,
      employee: { ...e, address: "" },
    }));
    return [
      {
        id: "pickup_points_overview",
        cabId: "overview",
        vehicleNumber: "Pickup Points",
        isPickup: true,
        stops,
        totalDistance: 0,
        totalDuration: 0,
        cab: { driverName: "Pickup Points", vehicleNumber: "Overview", driverPhone: "" },
      },
    ];
  }, [employees]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const data = new FormData(e.currentTarget);
    const lat = autoAddress?.lat;
    const lon = autoAddress?.lon;
    if (lat == null || lon == null) {
      setFormError("Select an address from autocomplete to set coordinates.");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/pickup-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          address: autoAddress?.displayName || data.get("address"),
          landmark: data.get("landmark") || undefined,
          x: lon,
          y: lat,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setAutoAddress(null);
        fetchData();
      } else {
        const err = await res.json();
        setFormError(err.error || "Failed to create pickup point");
      }
    } catch {
      setFormError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const assignEmployee = async (employeeId: string, pickupPointId: string) => {
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickupPointId }),
    });
    if (res.ok) fetchData();
  };

  const removeAssignment = async (employeeId: string) => {
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickupPointId: null }),
    });
    if (res.ok) fetchData();
  };

  const depotLat = settings?.defaultDepotLat ?? 21.0625;
  const depotLng = settings?.defaultDepotLng ?? 79.0526;

  return (
    <div className="space-y-6 animate-fadeIn">
      <nav className="flex items-center gap-1.5 text-xs text-[#6b6b6b]">
        <Link href="/dashboard/admin" className="hover:text-[#1c1b1f] transition">
          Dashboard
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-[#1c1b1f]">Pickup Points</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-[#1c1b1f] tracking-tight">Pickup Points</h1>
          <p className="text-[#6b6b6b] text-sm mt-0.5">
            Manage shared pickup locations and assign employees.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setFormError(null);
            setAutoAddress(null);
          }}
          className="bg-[#1c1b1f] text-white px-4 py-2 rounded-none text-xs font-bold hover:bg-black flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Add Pickup Point
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border border-[#e8e8e8] bg-white min-h-[520px]">
        <div className="lg:col-span-1 border-r border-[#e8e8e8] flex flex-col">
          <div className="p-3 border-b border-[#e8e8e8] space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9a9a]" />
              <input
                type="text"
                placeholder="Search pickup points..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e8e8e8] bg-[#f7f7f7]"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {["", "N", "S", "E", "W"].map((z) => (
                <button
                  key={z || "all"}
                  type="button"
                  onClick={() => setZoneFilter(z)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase border ${
                    zoneFilter === z
                      ? "bg-[#1c1b1f] text-white border-[#1c1b1f]"
                      : "bg-[#f7f7f7] text-[#6b6b6b] border-[#e8e8e8]"
                  }`}
                >
                  {z || "All"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-xs text-[#9a9a9a]">Loading…</div>
            ) : filteredPoints.length === 0 ? (
              <div className="p-6 text-xs text-[#9a9a9a]">No pickup points match.</div>
            ) : (
              filteredPoints.map((pp) => (
                <button
                  key={pp.id}
                  onClick={() => {
                    setSelectedPointId(pp.id);
                    setShowDrawer(false);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-[#f0f0f0] hover:bg-[#fafafa] transition ${
                    selectedPointId === pp.id ? "bg-[#ecfdf5] border-l-2 border-l-[#059669]" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: ZONE_COLORS[pp.zone] }} />
                    <div>
                      <div className="text-xs font-bold text-[#1c1b1f]">{pp.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="text-[9px] font-black uppercase text-white px-1.5 py-0.5"
                          style={{ backgroundColor: ZONE_COLORS[pp.zone] }}
                        >
                          {pp.zone}
                        </span>
                        <span className="text-[10px] text-[#9a9a9a] font-mono">
                          {pp.distanceRing || pp.subZone} · {pp.employeeCount} emp
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          {selectedPoint && (
            <div className="border-t border-[#e8e8e8] p-3">
              <button
                type="button"
                onClick={() => setShowDrawer(true)}
                className="w-full py-2 bg-[#1c1b1f] text-white text-[10px] font-bold uppercase"
              >
                Manage assignments
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 h-[520px] relative">
          <GoogleMapView
            routes={mapRoutes}
            selectedRouteId={null}
            onSelectRoute={() => {}}
            mode="OPTIMIZER"
            depotLat={depotLat}
            depotLng={depotLng}
            depotName={settings?.depotName || "MIHAN Depot"}
            apiKey={apiKey}
            showZoneOverlay
            pickupPointMarkers={pickupPoints.map((pp) => ({
              id: pp.id,
              name: pp.name,
              lat: pp.y,
              lng: pp.x,
              selected: pp.id === selectedPointId,
            }))}
          />
          {selectedPoint && (
            <div className="absolute bottom-3 left-3 z-10 bg-white/95 border border-[#e8e8e8] p-3 text-xs shadow-sm max-w-xs">
              <div className="font-bold text-[#1c1b1f]">{selectedPoint.name}</div>
              <div className="text-[10px] text-[#6b6b6b] mt-1">
                Zone {selectedPoint.zone} · {assignedEmployees.length} employees
              </div>
              {assignedEmployees.length > 0 && (
                <div className="mt-1 text-[10px] text-[#4a4a4a] truncate">
                  {assignedEmployees.map((e) => e.name).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showDrawer && selectedPoint && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="w-full max-w-lg bg-white h-full shadow-xl flex flex-col animate-fadeIn">
            <div className="flex items-center justify-between p-4 border-b border-[#e8e8e8]">
              <div>
                <h2 className="text-sm font-bold text-[#1c1b1f]">{selectedPoint.name}</h2>
                <p className="text-[10px] text-[#9a9a9a]">Assignment management</p>
              </div>
              <button onClick={() => setShowDrawer(false)}>
                <X className="w-5 h-5 text-[#9a9a9a]" />
              </button>
            </div>
            <div className="flex-1 grid grid-cols-2 divide-x divide-[#e8e8e8] overflow-hidden">
              <div className="p-4 overflow-y-auto">
                <div className="text-[9px] font-bold uppercase text-[#9a9a9a] mb-2 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Assigned ({assignedEmployees.length})
                </div>
                {assignedEmployees.length === 0 ? (
                  <div className="text-[10px] text-[#9a9a9a]">No employees assigned.</div>
                ) : (
                  assignedEmployees.map((emp) => (
                    <div key={emp.id} className="flex items-center justify-between py-2 border-b border-[#f0f0f0] text-[11px]">
                      <span>{emp.name}</span>
                      <button
                        onClick={() => removeAssignment(emp.id)}
                        className="text-[9px] text-red-600 font-bold uppercase"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="text-[9px] font-bold uppercase text-[#9a9a9a] mb-2">
                  Nearby unassigned (≤2 km)
                </div>
                {nearbyUnassigned.length === 0 ? (
                  <div className="text-[10px] text-[#9a9a9a]">No unassigned employees within 2 km.</div>
                ) : (
                  nearbyUnassigned.map((emp) => (
                    <div key={emp.id} className="flex items-center justify-between py-2 border-b border-[#f0f0f0] text-[11px]">
                      <div>
                        <div>{emp.name}</div>
                        <div className="text-[9px] text-[#9a9a9a] font-mono">{emp.distKm.toFixed(1)} km</div>
                      </div>
                      <button
                        onClick={() => assignEmployee(emp.id, selectedPoint.id)}
                        className="text-[9px] text-[#059669] font-bold uppercase"
                      >
                        Assign here
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            {unassignedEmployees.length > nearbyUnassigned.length && (
              <div className="p-3 border-t border-[#e8e8e8] text-[10px] text-[#9a9a9a]">
                {unassignedEmployees.length - nearbyUnassigned.length} other unassigned employees are farther than 2 km.
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white w-full max-w-md border border-[#e8e8e8] shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#1c1b1f]">Add Pickup Point</h2>
              <button onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 text-[#9a9a9a]" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-[#9a9a9a]">Name</label>
                <input name="name" required className="w-full mt-1 border border-[#e8e8e8] px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-[#9a9a9a]">Address</label>
                <LocationAutocomplete
                  onSelect={(place) =>
                    setAutoAddress({
                      displayName: place.displayName,
                      placeId: place.placeId,
                      lat: place.lat,
                      lon: place.lon,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-[#9a9a9a]">Landmark (optional)</label>
                <input name="landmark" className="w-full mt-1 border border-[#e8e8e8] px-3 py-2 text-xs" />
              </div>
              {formError && <div className="text-xs text-red-600">{formError}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#1c1b1f] text-white py-2 text-xs font-bold disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save Pickup Point"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
