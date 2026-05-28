"use client";

import React from "react";
import { Route } from "@/store/useTransportStore";
import { Map } from "lucide-react";
import dynamic from "next/dynamic";

interface RouteVisualizerProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
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
}: RouteVisualizerProps) {
  return (
    <div className="relative w-full h-[520px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col">
      {/* Header overlay */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-0.5 pointer-events-none text-left bg-white/90 backdrop-blur-xs p-3 rounded-xl border border-slate-200 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
          <Map className="w-4 h-4 text-slate-600" />
          Nagpur - MIHAN Interactive Route Map
        </h3>
        <p className="text-[9px] text-slate-500 font-medium leading-normal">
          Real road layouts connecting Nagpur suburbs. Click any route or stop to zoom in.
        </p>
      </div>

      {/* Render Leaflet Map */}
      <div className="w-full h-full flex-grow relative z-0">
        <NagpurLeafletMap
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={onSelectRoute}
        />
      </div>
    </div>
  );
}
