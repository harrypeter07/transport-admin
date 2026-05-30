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
}

// Dynamically import the Leaflet Map component with SSR disabled
const LeafletMap = dynamic(() => import("./NagpurLeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400 font-medium text-xs">
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
}: RouteVisualizerProps) {
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setSettings(data))
      .catch(console.error);
  }, []);

  if (!settings) {
    return (
      <div className="relative w-full h-[520px] bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex items-center justify-center text-xs font-bold text-slate-400">
        Loading interactive map...
      </div>
    );
  }

  const finalLat = depotLat ?? settings?.defaultDepotLat ?? 21.0625;
  const finalLng = depotLng ?? settings?.defaultDepotLng ?? 79.0526;
  const finalName = depotName ?? settings?.depotName ?? "Depot";

  return (
    <div className="relative w-full h-[520px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col">
      {/* Render Leaflet Map */}
      <div className="w-full h-full flex-grow relative z-0">
        <LeafletMap
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
          mode={mode}
          analysisData={analysisData}
          depotLat={finalLat}
          depotLng={finalLng}
          depotName={finalName}
        />
      </div>
    </div>
  );
}
