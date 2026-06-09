"use client";

import React, { useState, useEffect } from "react";
import { Route } from "@/store/useTransportStore";
import dynamic from "next/dynamic";

interface RouteVisualizerProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
  mode?: "OPTIMIZER" | "ANALYTICS";
  analysisData?: any;
  depotLat?: number;
  depotLng?: number;
  depotName?: string;
  routeViewModes?: Record<string, "pickup" | "drop">;
  selectedEmployeeId?: string | null;
  onSelectEmployee?: (id: string | null) => void;
}

const GoogleMapView = dynamic(() => import("./GoogleMapView"), {
 ssr: false,
 loading: () => (
  <div className="w-full h-full flex items-center justify-center bg-[#f7f7f7] text-[#9a9a9a] font-medium text-xs">
  Loading interactive map...
  </div>
 ),
});

export default function RouteVisualizer({
  routes,
  selectedRouteId,
  onSelectRoute,
  mode = "OPTIMIZER",
  analysisData,
  depotLat,
  depotLng,
  depotName,
  routeViewModes,
  selectedEmployeeId,
  onSelectEmployee,
}: RouteVisualizerProps) {
 const [settings, setSettings] = useState<any>(null);
 const [apiKey, setApiKey] = useState<string>("");

 useEffect(() => {
  fetch("/api/settings")
  .then((res) => res.json())
  .then((data) => setSettings(data))
  .catch(console.error);
  fetch("/api/maps-key")
  .then((res) => res.json())
  .then((data) => setApiKey(data.key || ""))
  .catch(() => {});
 }, []);

 if (!settings) {
  return (
  <div className="relative w-full h-[280px] sm:h-[380px] lg:h-[520px] bg-[#f7f7f7] border border-[#e8e8e8] rounded-none overflow-hidden shadow-xs flex items-center justify-center text-xs font-bold text-[#9a9a9a]">
  Loading interactive map...
  </div>
  );
 }

 const finalLat = depotLat ?? settings?.defaultDepotLat ?? 21.0625;
 const finalLng = depotLng ?? settings?.defaultDepotLng ?? 79.0526;
 const finalName = depotName ?? settings?.depotName ?? "Depot";

 return (
  <div className="relative w-full h-[280px] sm:h-[380px] lg:h-[520px] bg-white border border-[#e8e8e8] rounded-none overflow-hidden shadow-xs flex flex-col">
  <div className="w-full h-full flex-grow relative z-0">
    <GoogleMapView
    routes={routes}
    selectedRouteId={selectedRouteId}
    onSelectRoute={onSelectRoute}
    mode={mode}
    analysisData={analysisData}
    depotLat={finalLat}
    depotLng={finalLng}
    depotName={finalName}
    apiKey={apiKey}
    routeViewModes={routeViewModes}
    selectedEmployeeId={selectedEmployeeId}
    onSelectEmployee={onSelectEmployee}
    />
  </div>
  </div>
 );
}
