"use client";

import React, { useEffect, useState } from "react";
import { useTransportStore, Route, RouteStop } from "@/store/useTransportStore";
import RouteVisualizer from "@/components/RouteVisualizer";
import {
  Compass,
  Users,
  Truck,
  ShieldAlert,
  Calendar,
  AlertTriangle,
  RotateCw,
  Printer,
  Plus,
  Trash,
  FileSpreadsheet,
  Download,
  Upload,
  AlertCircle,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Phone,
  CheckCircle2,
  ShieldOff,
  MessageSquare
} from "lucide-react";

export default function TransitAdminSPA() {
  const {
    employees,
    cabs,
    shifts,
    routes,
    activeShiftId,
    selectedRouteId,
    loading,
    fetchInitialData,
    setActiveShiftId,
    setSelectedRouteId,
    runOptimization,
    reorderRouteStops,
    overrideViolation,
    addEmployee,
    deleteEmployee,
    addCab,
    deleteCab
  } = useTransportStore();

  const [activeDesk, setActiveDesk] = useState<"OPTIMIZER" | "REGISTRY" | "COMPLIANCE">("OPTIMIZER");
  const [registryTab, setRegistryTab] = useState<"EMPLOYEES" | "CABS">("EMPLOYEES");

  // State for commute routing
  const [isPickup, setIsPickup] = useState(true);
  const [optimizing, setOptimizing] = useState(false);

  // Excel bulk upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Auto-optimize loading overlay state
  const [autoOptimizingOverlay, setAutoOptimizingOverlay] = useState<"idle" | "uploading" | "optimizing">("idle");

  // Forms states
  const [employeeForm, setEmployeeForm] = useState({
    employeeCode: "",
    name: "",
    gender: "MALE" as "MALE" | "FEMALE",
    phone: "",
    email: "",
    address: "Sadar, Nagpur", // Neighborhood name
    department: "Engineering",
    shiftId: "",
  });

  const [cabForm, setCabForm] = useState({
    vehicleNumber: "",
    capacity: "4",
    vendor: "Maharaja Transport",
    driverName: "",
    driverPhone: "",
    licenseNumber: "",
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (shifts.length > 0 && !employeeForm.shiftId) {
      setEmployeeForm((prev) => ({ ...prev, shiftId: shifts[0].id }));
    }
  }, [shifts]);

  const handleRunOptimization = async () => {
    setOptimizing(true);
    try {
      await runOptimization(isPickup);
    } catch (e) {
      console.error(e);
    } finally {
      setOptimizing(false);
    }
  };

  const handleEmpInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEmployeeForm({ ...employeeForm, [e.target.name]: e.target.value });
  };

  const handleCabInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setCabForm({ ...cabForm, [e.target.name]: e.target.value });
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeForm.employeeCode || !employeeForm.name) return;

    await addEmployee(employeeForm);

    setEmployeeForm({
      employeeCode: "",
      name: "",
      gender: "MALE",
      phone: "",
      email: "",
      address: "Sadar, Nagpur",
      department: "Engineering",
      shiftId: shifts[0]?.id || "",
    });
  };

  const handleAddCab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cabForm.vehicleNumber || !cabForm.driverName) return;

    await addCab(cabForm);

    setCabForm({
      vehicleNumber: "",
      capacity: "4",
      vendor: "Maharaja Transport",
      driverName: "",
      driverPhone: "",
      licenseNumber: "",
    });
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setUploadMsg("");
    setAutoOptimizingOverlay("uploading");

    const formData = new FormData();
    formData.append("file", uploadFile);
    if (employeeForm.shiftId) {
      formData.append("shiftId", employeeForm.shiftId);
    }

    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadFile(null);
        const fileInput = document.getElementById("fileInput") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        await fetchInitialData();
        // Switch to optimizer desk immediately
        setActiveDesk("OPTIMIZER");
        // Now auto-optimize
        setAutoOptimizingOverlay("optimizing");
        setOptimizing(true);
        try {
          await runOptimization(isPickup);
        } catch (optErr) {
          console.error("Auto-optimization error:", optErr);
        } finally {
          setOptimizing(false);
        }
        setUploadMsg(data.message || "Bulk import completed. Routes optimized automatically.");
      } else {
        setUploadMsg(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      setUploadMsg("Upload failed.");
    } finally {
      setUploading(false);
      setAutoOptimizingOverlay("idle");
    }
  };

  // Calculations for selected and active items
  const activeRoutes = routes.filter((r) => r.shiftId === activeShiftId && r.isPickup === isPickup);
  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const totalViolations = routes.reduce(
    (acc, r) => acc + r.violations.filter((v) => !v.resolved).length,
    0
  );

  // Calculate unassigned employees for active shift
  const activeEmployees = employees.filter((emp) => emp.shiftId === activeShiftId && emp.status === "ACTIVE");
  const assignedEmployeeIds = new Set(activeRoutes.flatMap((r) => r.stops.map((s) => s.employeeId)));
  const unassignedEmployees = activeEmployees.filter((emp) => !assignedEmployeeIds.has(emp.id));

  // Filter lists
  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCabs = cabs.filter((cab) =>
    cab.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (cab.driver?.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeViolationsList = routes.flatMap((r) =>
    r.violations.map((v) => ({
      ...v,
      routeId: r.id,
      vehicleNumber: r.cab.vehicleNumber,
      driverName: r.cab.driver?.name || "N/A",
      driverPhone: r.cab.driver?.phone || "N/A",
      totalStops: r.stops.length,
    }))
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 selection:bg-slate-900 selection:text-white font-sans antialiased">

      {/* Full-page overlay during upload + auto-optimize flow */}
      {autoOptimizingOverlay !== "idle" && (
        <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-6 animate-fadeIn">
          <div className="relative flex items-center justify-center">
            {/* Outer ring spinner */}
            <div className="w-16 h-16 rounded-full border-4 border-slate-100 border-t-slate-800 animate-spin" />
            {/* Inner icon */}
            <div className="absolute w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white font-black text-sm">
              TA
            </div>
          </div>
          <div className="text-center flex flex-col gap-1.5">
            <p className="text-base font-extrabold text-slate-900 tracking-tight">
              {autoOptimizingOverlay === "uploading" ? "Importing Roster…" : "Optimizing Routes…"}
            </p>
            <p className="text-xs text-slate-500 font-medium max-w-xs leading-relaxed">
              {autoOptimizingOverlay === "uploading"
                ? "Reading your Excel file and geocoding employee addresses in Nagpur."
                : "Computing safest & shortest routes for all cab-employee clusters."}
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className={`w-2 h-2 rounded-full bg-slate-300 ${autoOptimizingOverlay === "uploading" ? "bg-slate-800" : "bg-slate-300"}`} />
              <span className={`w-2 h-2 rounded-full ${autoOptimizingOverlay === "optimizing" ? "bg-slate-800" : "bg-slate-300"}`} />
            </div>
            <div className="flex gap-2 justify-center mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span className={autoOptimizingOverlay === "uploading" ? "text-slate-700" : ""}>1 · Import</span>
              <span>→</span>
              <span className={autoOptimizingOverlay === "optimizing" ? "text-slate-700" : ""}>2 · Optimize</span>
            </div>
          </div>
        </div>
      )}
      {/* Header (Renamed to Transit Admin, Strictly Light-Mode) */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-black text-sm">
              TA
            </div>
            <span className="font-extrabold tracking-tight text-slate-900 text-base">Transit Admin</span>
            <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded font-mono font-bold">
              Nagpur Hub
            </span>
          </div>

          {/* SPA Desk Tabs */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveDesk("OPTIMIZER")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all
                ${
                  activeDesk === "OPTIMIZER"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }
              `}
            >
              Route Optimizer
            </button>
            <button
              onClick={() => setActiveDesk("REGISTRY")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all
                ${
                  activeDesk === "REGISTRY"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }
              `}
            >
              Roster & Cabs Desk
            </button>
            <button
              onClick={() => setActiveDesk("COMPLIANCE")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all
                ${
                  activeDesk === "COMPLIANCE"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }
              `}
            >
              Compliance Warnings
              {totalViolations > 0 && (
                <span className="bg-red-100 border border-red-200 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {totalViolations}
                </span>
              )}
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchInitialData()}
              className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-500 transition"
              title="Sync Database"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        
        {/* DESK 1: ROUTE OPTIMIZER */}
        {activeDesk === "OPTIMIZER" && (
          <div className="flex flex-col gap-6 text-left animate-fadeIn">
            {/* Top Workspace Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Transit Optimization Workspace</h1>
                <p className="text-xs text-slate-500">
                  Select morning incoming or evening outgoing shifts to map routes.
                </p>
              </div>

              {/* Controls bar */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-2 border border-slate-200 rounded-xl shadow-xs">
                <div className="flex items-center gap-1.5 px-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={activeShiftId}
                    onChange={(e) => {
                      setActiveShiftId(e.target.value);
                      setSelectedRouteId(null);
                    }}
                    className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id} className="bg-white text-slate-800">
                        {s.name} ({s.startTime})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="h-4 w-px bg-slate-200"></div>

                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200">
                  <button
                    onClick={() => {
                      setIsPickup(true);
                      setSelectedRouteId(null);
                    }}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase transition-all
                      ${isPickup ? "bg-white text-slate-950 shadow-xs" : "text-slate-500 hover:text-slate-800"}
                    `}
                  >
                    To MIHAN (Pickup)
                  </button>
                  <button
                    onClick={() => {
                      setIsPickup(false);
                      setSelectedRouteId(null);
                    }}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase transition-all
                      ${!isPickup ? "bg-white text-slate-950 shadow-xs" : "text-slate-500 hover:text-slate-800"}
                    `}
                  >
                    From MIHAN (Drop)
                  </button>
                </div>

                <button
                  onClick={handleRunOptimization}
                  disabled={optimizing || loading}
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${optimizing ? "animate-spin" : ""}`} />
                  {optimizing ? "Solving..." : "Optimize Routing"}
                </button>
              </div>
            </div>

            {/* Auto-import success toast */}
            {uploadMsg && !uploading && activeDesk === "OPTIMIZER" && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="font-semibold">{uploadMsg}</span>
                </div>
                <button
                  onClick={() => setUploadMsg("")}
                  className="text-emerald-500 hover:text-emerald-700 text-lg leading-none font-bold"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

            {/* Cabs Availability & Capacity Edge Cases Alert Banners */}
            {cabs.filter(c => c.status === "AVAILABLE").length === 0 ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800 animate-fadeIn">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col text-left">
                  <span className="font-bold text-red-900">No Vehicles Available</span>
                  <span className="mt-0.5 text-red-700 font-medium">
                    There are no cabs marked as AVAILABLE in the registry. Please go to the **Roster & Cabs Desk** to add and register vehicles.
                  </span>
                </div>
              </div>
            ) : unassignedEmployees.length > 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-amber-800 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5 animate-pulse" />
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-amber-900">Fleet Capacity Exceeded — Overflow Alert</span>
                    <span className="mt-0.5 text-amber-700 font-medium">
                      {unassignedEmployees.length} employee(s) could not be accommodated on this shift due to insufficient available cab capacity.
                    </span>
                    <span className="mt-1.5 text-[10px] text-amber-600 font-mono font-bold">
                      Waitlisted: {unassignedEmployees.map((emp) => `${emp.name} (${emp.address.split(",")[0]})`).join(", ")}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveDesk("REGISTRY");
                    setRegistryTab("CABS");
                  }}
                  className="whitespace-nowrap px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-bold hover:bg-amber-700 transition self-start md:self-auto cursor-pointer"
                >
                  Register More Cabs
                </button>
              </div>
            ) : null}

            {/* Split View Map + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Map */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                <RouteVisualizer
                  routes={activeRoutes}
                  selectedRouteId={selectedRouteId}
                  onSelectRoute={setSelectedRouteId}
                />
              </div>

              {/* Sidebar stops timeline */}
              <div className="lg:col-span-4 p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-5 justify-between">
                {!selectedRoute ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <Compass className="w-8 h-8 text-slate-400 mb-1.5 animate-pulse" />
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      No Path Selected
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                      Click on any route path in the Nagpur map visualizer to view stop sequences and driver manifest details.
                    </p>
                  </div>
                ) : (
                  <div className="flex-grow flex flex-col gap-4">
                    <div className="border-b border-slate-100 pb-3 flex justify-between items-start">
                      <div className="flex flex-col text-left">
                        <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">
                          Allocated Vehicle
                        </span>
                        <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                          <Truck className="w-4 h-4 text-slate-400" />
                          {selectedRoute.cab.vehicleNumber}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400">
                          Score
                        </span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                          {selectedRoute.optimizationScore}/100
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center font-mono text-[11px] text-slate-600">
                      <div className="flex flex-col items-center border-r border-slate-200/80">
                        <span className="text-[8px] uppercase font-bold text-slate-400">
                          Total Distance
                        </span>
                        <span className="text-xs text-slate-900 font-semibold mt-0.5">
                          {selectedRoute.totalDistance} km
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] uppercase font-bold text-slate-400">
                          Est. Commute
                        </span>
                        <span className="text-xs text-slate-900 font-semibold mt-0.5">
                          {selectedRoute.totalDuration} mins
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 flex flex-col gap-1 text-left">
                      <p>
                        <span className="text-slate-400">Driver:</span> {selectedRoute.cab.driver?.name || "N/A"}
                      </p>
                      <p>
                        <span className="text-slate-400">Cab Capacity:</span> {selectedRoute.stops.length} / {selectedRoute.cab.capacity} passengers
                      </p>
                      <p>
                        <span className="text-slate-400">Contact:</span> {selectedRoute.cab.driver?.phone || "N/A"}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400 text-left">
                        Commute Manifest Itinerary Timeline
                      </div>
                      
                      <div className="relative pl-6 flex flex-col gap-4 text-left max-h-[220px] overflow-y-auto pr-1 select-none scrollbar-thin">
                        {/* Connecting Line */}
                        <div className="absolute left-[10px] top-2 bottom-2 w-px border-l-2 border-dashed border-slate-200"></div>

                        {/* Origin Node for Drop (From MIHAN) */}
                        {!selectedRoute.isPickup && (
                          <div className="relative flex items-start gap-3">
                            {/* Depot Marker */}
                            <span className="absolute -left-6 w-5 h-5 rounded-full bg-slate-900 border border-slate-700 text-white flex items-center justify-center z-10">
                              <Truck className="w-3 h-3" />
                            </span>
                            <div className="flex-1 p-2 bg-slate-100/80 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800">
                              <div className="flex justify-between items-center">
                                <span>MIHAN Depot Office</span>
                                <span className="text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-bold tracking-wider uppercase font-mono">
                                  Depart
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-400 font-mono mt-0.5">Central Corporate Hub</p>
                            </div>
                          </div>
                        )}

                        {/* Stops */}
                        {selectedRoute.stops.map((stop, idx) => {
                          const isFirst = idx === 0;
                          const isLast = idx === selectedRoute.stops.length - 1;
                          const isFemale = stop.employee.gender === "FEMALE";

                          return (
                            <div key={stop.id} className="relative flex items-start gap-3">
                              {/* Stop number Marker */}
                              <span className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center font-mono font-black text-[9px] border z-10 transition-colors
                                ${
                                  isFemale 
                                    ? "bg-purple-600 border-purple-500 text-white" 
                                    : "bg-white border-slate-300 text-slate-600"
                                }
                              `}>
                                {stop.stopOrder}
                              </span>

                              <div className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-[11px] transition-all hover:bg-slate-100/50">
                                <div className="flex flex-col text-left">
                                  <span className="font-bold text-slate-800 flex items-center gap-1">
                                    {stop.employee.name}
                                    {isFemale && <span className="text-[8px] bg-purple-50 text-purple-600 border border-purple-100 px-1 rounded-full font-bold">F</span>}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-medium truncate max-w-[130px]" title={stop.employee.address}>
                                    {stop.employee.address.split(",")[0]}
                                  </span>
                                  <span className="text-[8px] text-slate-400 font-mono mt-0.5">
                                    ETA: +{stop.etaMinutes} mins
                                  </span>
                                </div>

                                {/* Reordering buttons */}
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => reorderRouteStops(selectedRoute.id, stop.id, "up")}
                                    disabled={isFirst}
                                    className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-500 disabled:opacity-30 transition cursor-pointer"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => reorderRouteStops(selectedRoute.id, stop.id, "down")}
                                    disabled={isLast}
                                    className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-500 disabled:opacity-30 transition cursor-pointer"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Destination Node for Pickup (To MIHAN) */}
                        {selectedRoute.isPickup && (
                          <div className="relative flex items-start gap-3">
                            {/* Depot Marker */}
                            <span className="absolute -left-6 w-5 h-5 rounded-full bg-slate-900 border border-slate-700 text-white flex items-center justify-center z-10">
                              <Truck className="w-3 h-3" />
                            </span>
                            <div className="flex-1 p-2 bg-slate-100/80 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800">
                              <div className="flex justify-between items-center">
                                <span>MIHAN Depot Office</span>
                                <span className="text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-bold tracking-wider uppercase font-mono">
                                  Arrive
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                ETA: +{selectedRoute.totalDuration} mins
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>

            {/* Print Manifest Section */}
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-4 print:p-0 print:border-none print:shadow-none">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex flex-col text-left">
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4 text-slate-400" />
                    Driver Dispatch Manifest Table
                  </h2>
                  <p className="text-[10px] text-slate-400">
                    Calculated sequence for Nagpur suburbs pickup/drop schedules.
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold transition print:hidden"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Manifest
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                      <th className="p-3">Driver Details</th>
                      <th className="p-3">Vehicle Number</th>
                      <th className="p-3">Load Info</th>
                      <th className="p-3">Route Type</th>
                      <th className="p-3">Itinerary Stop sequence list</th>
                      <th className="p-3">Alert Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {activeRoutes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 bg-slate-50/20">
                          No active routes optimized. Select shift and click Optimize.
                        </td>
                      </tr>
                    ) : (
                      activeRoutes.map((route) => {
                        const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);
                        const activeViolationsCount = route.violations.filter(v => !v.resolved).length;
                        const isSelected = selectedRouteId === route.id;

                        return (
                          <tr
                            key={route.id}
                            onClick={() => setSelectedRouteId(route.id)}
                            className={`cursor-pointer border-l-4 transition-all duration-150
                              ${
                                isSelected
                                  ? "bg-blue-50/70 border-l-blue-600 hover:bg-blue-50"
                                  : "border-l-transparent hover:bg-slate-50/50"
                              }
                            `}
                          >
                            <td className="p-3">
                              <div className="flex flex-col text-left">
                                <span className="text-slate-900 font-bold">{route.cab.driver?.name || "N/A"}</span>
                                <span className="text-[9px] text-slate-400 font-mono">{route.cab.driver?.phone || "N/A"}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-900">{route.cab.vehicleNumber}</td>
                            <td className="p-3 text-slate-500">
                              {route.stops.length} / {route.cab.capacity} seats
                            </td>
                            <td className="p-3">
                              <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                                {route.isPickup ? "Pickup (To MIHAN)" : "Drop (From MIHAN)"}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap items-center gap-1.5 font-sans font-bold text-[10px]">
                                {route.isPickup ? (
                                  <>
                                    {sortedStops.map((s, idx) => {
                                      const isFem = s.employee.gender === "FEMALE";
                                      return (
                                        <React.Fragment key={s.id}>
                                          <span className={`border px-2 py-0.5 rounded flex items-center gap-1
                                            ${
                                              isFem
                                                ? "bg-purple-50 border-purple-200 text-purple-700"
                                                : "bg-slate-50 border-slate-200 text-slate-700"
                                            }
                                          `}>
                                            <span className={`text-[8px] font-mono ${isFem ? "text-purple-400" : "text-slate-400"}`}>#{idx + 1}</span>
                                            {s.employee.name.split(" ")[0]} ({s.employee.address.split(",")[0]})
                                          </span>
                                          <span className="text-slate-400 font-mono text-[9px]">➔</span>
                                        </React.Fragment>
                                      );
                                    })}
                                    <span className="bg-slate-900 border border-slate-900 text-white px-2 py-0.5 rounded flex items-center gap-1 font-extrabold">
                                      🏢 MIHAN Depot
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="bg-slate-900 border border-slate-900 text-white px-2 py-0.5 rounded flex items-center gap-1 font-extrabold">
                                      🏢 MIHAN Depot
                                    </span>
                                    <span className="text-slate-400 font-mono text-[9px]">➔</span>
                                    {sortedStops.map((s, idx) => {
                                      const isFem = s.employee.gender === "FEMALE";
                                      return (
                                        <React.Fragment key={s.id}>
                                          <span className={`border px-2 py-0.5 rounded flex items-center gap-1
                                            ${
                                              isFem
                                                ? "bg-purple-50 border-purple-200 text-purple-700"
                                                : "bg-slate-50 border-slate-200 text-slate-700"
                                            }
                                          `}>
                                            <span className={`text-[8px] font-mono ${isFem ? "text-purple-400" : "text-slate-400"}`}>#{idx + 1}</span>
                                            {s.employee.name.split(" ")[0]} ({s.employee.address.split(",")[0]})
                                          </span>
                                          {idx < sortedStops.length - 1 && <span className="text-slate-400 font-mono text-[9px]">➔</span>}
                                        </React.Fragment>
                                      );
                                    })}
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              {activeViolationsCount > 0 ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 animate-pulse">
                                  {activeViolationsCount} Alert(s)
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
                                  Clear
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* DESK 2: ROSTER & CABS REGISTRY */}
        {activeDesk === "REGISTRY" && (
          <div className="flex flex-col gap-6 text-left animate-fadeIn">
            {/* Header tab */}
            <div className="flex gap-4 border-b border-slate-200">
              <button
                onClick={() => setRegistryTab("EMPLOYEES")}
                className={`pb-2 text-xs font-bold tracking-wider uppercase border-b-2 transition-all
                  ${
                    registryTab === "EMPLOYEES"
                      ? "border-slate-950 text-slate-950 font-black"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }
                `}
              >
                Employee Roster ({employees.length})
              </button>
              <button
                onClick={() => setRegistryTab("CABS")}
                className={`pb-2 text-xs font-bold tracking-wider uppercase border-b-2 transition-all
                  ${
                    registryTab === "CABS"
                      ? "border-slate-950 text-slate-950 font-black"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }
                `}
              >
                Cab Fleet & Drivers ({cabs.length})
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300 w-64"
              />
            </div>

            {registryTab === "EMPLOYEES" ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Employees Table */}
                <div className="lg:col-span-8 p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-4">
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-400" />
                    Roster Directory
                  </h2>

                  <div className="overflow-x-auto border border-slate-100 rounded-lg max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                          <th className="p-3">Code</th>
                          <th className="p-3">Name</th>
                          <th className="p-3">Gender</th>
                          <th className="p-3">Address (Nagpur Area)</th>
                          <th className="p-3">Dept</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredEmployees.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400 bg-slate-50/20">
                              No employees found. Add or upload roster.
                            </td>
                          </tr>
                        ) : (
                          filteredEmployees.map((emp) => (
                            <tr key={emp.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-3 font-mono font-bold text-slate-500">{emp.employeeCode}</td>
                              <td className="p-3 text-slate-900">{emp.name}</td>
                              <td className="p-3">
                                <span
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full border
                                    ${
                                      emp.gender === "FEMALE"
                                        ? "bg-purple-50 text-purple-600 border-purple-200"
                                        : "bg-slate-50 text-slate-500 border-slate-200"
                                    }
                                  `}
                                >
                                  {emp.gender}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600">{emp.address}</td>
                              <td className="p-3 text-slate-500">{emp.department}</td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => deleteEmployee(emp.id)}
                                  className="p-1.5 bg-red-50 border border-red-200 rounded-md text-red-600 hover:bg-red-100 transition"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Employee inputs */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  {/* Excel import */}
                  <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-4">
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <FileSpreadsheet className="w-4.5 h-4.5 text-slate-500" />
                      Excel Roster Upload
                    </h2>
                    <form onSubmit={handleFileUpload} className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Shift Target
                        </label>
                        <select
                          name="shiftId"
                          value={employeeForm.shiftId}
                          onChange={handleEmpInputChange}
                          className="w-full bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                        >
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.startTime})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-200 bg-slate-50 rounded-lg hover:border-slate-300 transition cursor-pointer relative group">
                        <input
                          type="file"
                          id="fileInput"
                          required
                          accept=".xlsx, .xls, .csv"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Upload className="w-5 h-5 text-slate-400 group-hover:text-slate-600 mb-1" />
                        <span className="text-[10px] text-slate-500 font-medium">
                          {uploadFile ? uploadFile.name : "Select Excel File"}
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={uploading || !uploadFile}
                        className="w-full flex items-center justify-center gap-1.5 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        Import File
                      </button>
                    </form>

                    <a
                      href="/api/employees/template"
                      className="flex items-center gap-1 text-[9px] text-blue-600 hover:text-blue-800 font-bold self-start border-b border-transparent hover:border-blue-800 pb-0.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Example Excel File
                    </a>

                    {uploadMsg && (
                      <div className="p-3 bg-slate-50 border border-slate-200 text-[10px] rounded-lg text-slate-600 flex items-start gap-1.5">
                        <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span>{uploadMsg}</span>
                      </div>
                    )}
                  </div>

                  {/* Manual employee add */}
                  <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-4">
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Plus className="w-4 h-4 text-slate-500" />
                      Add Employee Manually
                    </h2>

                    <form onSubmit={handleAddEmployee} className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Employee Code
                        </label>
                        <input
                          type="text"
                          name="employeeCode"
                          required
                          value={employeeForm.employeeCode}
                          onChange={handleEmpInputChange}
                          placeholder="EMP201"
                          className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                        />
                      </div>

                      <div className="col-span-2 flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Full Name
                        </label>
                        <input
                          type="text"
                          name="name"
                          required
                          value={employeeForm.name}
                          onChange={handleEmpInputChange}
                          placeholder="Alice Smith"
                          className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Gender
                        </label>
                        <select
                          name="gender"
                          value={employeeForm.gender}
                          onChange={handleEmpInputChange}
                          className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                        >
                          <option value="MALE">MALE</option>
                          <option value="FEMALE">FEMALE</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Department
                        </label>
                        <input
                          type="text"
                          name="department"
                          value={employeeForm.department}
                          onChange={handleEmpInputChange}
                          placeholder="Engineering"
                          className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                        />
                      </div>

                      <div className="col-span-2 flex flex-col gap-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Nagpur Area / Neighborhood Address
                        </label>
                        <input
                          type="text"
                          name="address"
                          required
                          value={employeeForm.address}
                          onChange={handleEmpInputChange}
                          placeholder="Sadar, Nagpur"
                          className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                        />
                        <span className="text-[8px] text-slate-400">
                          Example: Manish Nagar, Dharampeth, Besa, Nandanvan, Sadar, Dhantoli.
                        </span>
                      </div>

                      <button
                        type="submit"
                        className="col-span-2 mt-2 bg-slate-900 text-white py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition"
                      >
                        Register Employee
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
                {/* Cabs Table */}
                <div className="lg:col-span-8 p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-4">
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-slate-400" />
                    Fleet Directory
                  </h2>

                  <div className="overflow-x-auto border border-slate-100 rounded-lg max-h-[460px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                          <th className="p-3">Vehicle Number</th>
                          <th className="p-3">Capacity</th>
                          <th className="p-3">Driver Name</th>
                          <th className="p-3">Contact</th>
                          <th className="p-3">Vendor</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredCabs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400 bg-slate-50/20">
                              No cabs registered. Manual add one below.
                            </td>
                          </tr>
                        ) : (
                          filteredCabs.map((cab) => (
                            <tr key={cab.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-3 font-mono font-bold text-slate-900">{cab.vehicleNumber}</td>
                              <td className="p-3">{cab.capacity} seats</td>
                              <td className="p-3 text-slate-900">{cab.driver?.name}</td>
                              <td className="p-3 font-mono text-slate-500">{cab.driver?.phone}</td>
                              <td className="p-3 text-slate-500">{cab.vendor}</td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => deleteCab(cab.id)}
                                  className="p-1.5 bg-red-50 border border-red-200 rounded-md text-red-600 hover:bg-red-100 transition"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cab Manual Add */}
                <div className="lg:col-span-4 p-5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col gap-4">
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Plus className="w-4 h-4 text-slate-500" />
                    Register Cab & Driver
                  </h2>

                  <form onSubmit={handleAddCab} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 flex flex-col gap-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Vehicle Number
                      </label>
                      <input
                        type="text"
                        name="vehicleNumber"
                        required
                        value={cabForm.vehicleNumber}
                        onChange={handleCabInputChange}
                        placeholder="MH-31-TR-6666"
                        className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Capacity
                      </label>
                      <select
                        name="capacity"
                        value={cabForm.capacity}
                        onChange={handleCabInputChange}
                        className="w-full bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                      >
                        <option value="4">4 seats</option>
                        <option value="6">6 seats</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Vendor
                      </label>
                      <input
                        type="text"
                        name="vendor"
                        value={cabForm.vendor}
                        onChange={handleCabInputChange}
                        placeholder="Maharaja Transport"
                        className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Driver Full Name
                      </label>
                      <input
                        type="text"
                        name="driverName"
                        required
                        value={cabForm.driverName}
                        onChange={handleCabInputChange}
                        placeholder="David Miller"
                        className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                      />
                    </div>

                    <div className="col-span-2 flex flex-col gap-1">
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Driver Contact Phone
                      </label>
                      <input
                        type="text"
                        name="driverPhone"
                        value={cabForm.driverPhone}
                        onChange={handleCabInputChange}
                        placeholder="+91 98765 00000"
                        className="bg-white border border-slate-200 rounded-lg text-xs py-2 px-3 focus:outline-none focus:border-slate-300"
                      />
                    </div>

                    <button
                      type="submit"
                      className="col-span-2 mt-2 bg-slate-900 text-white py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition"
                    >
                      Register Vehicle
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DESK 3: COMPLIANCE WARNINGS */}
        {activeDesk === "COMPLIANCE" && (
          <div className="flex flex-col gap-6 text-left animate-fadeIn">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Safety Compliance Ledger</h1>
              <p className="text-xs text-slate-500">
                Track warnings such as female first pickups, last drops, or isolated transits.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {activeViolationsList.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-slate-200 rounded-xl bg-white shadow-xs flex flex-col items-center justify-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 animate-pulse" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                    Compliance Status: Clear
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed text-center">
                    All routes satisfy security checks. Female passengers have guards or male passenger overrides.
                  </p>
                </div>
              ) : (
                activeViolationsList.map((v) => (
                  <div
                    key={v.id}
                    className={`p-5 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all bg-white border-slate-200 shadow-xs`}
                  >
                    <div className="flex-1 flex flex-col gap-1.5 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider
                            ${
                              v.resolved
                                ? "bg-slate-100 border border-slate-200 text-slate-500"
                                : "bg-red-100 text-red-700 border border-red-200"
                            }
                          `}
                        >
                          {v.type}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500 font-bold uppercase">
                          Vehicle: {v.vehicleNumber}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500 font-bold uppercase">
                          Severity: {v.severity}
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 leading-relaxed font-semibold mt-1">
                        {v.notes}
                      </p>

                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span>Driver: {v.driverName} ({v.driverPhone})</span>
                        <span>•</span>
                        <span>Stops: {v.totalStops}</span>
                      </div>

                      {v.resolved && v.notes?.includes("override") && (
                        <div className="mt-2.5 p-2.5 bg-slate-50 rounded border border-slate-200 text-[10px] text-slate-600 flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-slate-800">Audit Trail:</strong> Manual override authorized by Transport Admin.
                          </span>
                        </div>
                      )}
                    </div>

                    {!v.resolved && (
                      <div className="flex flex-col gap-1.5 w-full md:w-auto">
                        <button
                          onClick={() => overrideViolation(v.id)}
                          className="whitespace-nowrap bg-slate-900 text-white hover:bg-slate-800 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition"
                        >
                          Authorize Override
                        </button>
                        <span className="text-[9px] text-slate-400 text-center font-mono uppercase tracking-wider block">
                          Logs Audit Trail
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
        <p>© 2026 Transit Admin. Nagpur-MIHAN Corporate Route Optimizers.</p>
      </footer>
    </div>
  );
}
