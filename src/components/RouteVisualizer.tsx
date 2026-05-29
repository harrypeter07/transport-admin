"use client";

import React from "react";
import { Route } from "@/store/useTransportStore";
import { Map } from "lucide-react";
import dynamic from "next/dynamic";

interface RouteVisualizerProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
  mode?: "OPTIMIZER" | "ANALYTICS";
  analysisData?: any;
}

// Dynamically import the Leaflet Map component with SSR disabled
const NagpurLeafletMap = dynamic(() => import("./NagpurLeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400 font-medium text-xs">
      Loading interactive Nagpur map...
    </div>
  ),
});

export default function RouteVisualizer({
  routes,
  selectedRouteId,
  onSelectRoute,
  mode = "OPTIMIZER",
  analysisData,
}: RouteVisualizerProps) {
  return (
    <div className="relative w-full h-[520px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col">


      {/* Render Leaflet Map */}
      <div className="w-full h-full flex-grow relative z-0">
        <NagpurLeafletMap
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
          mode={mode}
          analysisData={analysisData}
        />
      </div>
    </div>
  );
}
