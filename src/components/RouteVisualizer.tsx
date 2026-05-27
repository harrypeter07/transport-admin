"use client";

import React, { useState } from "react";
import { useTransportStore, Route, RouteStop } from "@/store/useTransportStore";
import { User, Map, Compass, Navigation } from "lucide-react";

interface RouteVisualizerProps {
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
}

export default function RouteVisualizer({
  routes,
  selectedRouteId,
  onSelectRoute,
}: RouteVisualizerProps) {
  const [hoveredNode, setHoveredNode] = useState<RouteStop | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Real world Depot coordinates (MIHAN)
  const DEPOT_LAT = 21.0625;
  const DEPOT_LNG = 79.0526;

  // Bounding box for Nagpur to scale real coordinates to 0-100 visual viewBox
  const MIN_LNG = 79.00;
  const MAX_LNG = 79.16;
  const MIN_LAT = 21.04;
  const MAX_LAT = 21.19;

  const scaleX = (lng: number) => {
    const clamped = Math.max(MIN_LNG, Math.min(MAX_LNG, lng));
    return 5 + ((clamped - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 90;
  };

  const scaleY = (lat: number) => {
    const clamped = Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
    return 95 - ((clamped - MIN_LAT) / (MAX_LAT - MIN_LAT)) * 80;
  };

  const DEPOT_X = scaleX(DEPOT_LNG);
  const DEPOT_Y = scaleY(DEPOT_LAT);

  // Colors for routes in light mode
  const routeColors = [
    { stroke: "#0f172a", glow: "rgba(15, 23, 42, 0.1)", text: "text-slate-900" }, // dark slate
    { stroke: "#0284c7", glow: "rgba(2, 132, 199, 0.1)", text: "text-sky-600" }, // sky blue
    { stroke: "#7c3aed", glow: "rgba(124, 58, 237, 0.1)", text: "text-violet-600" }, // violet
    { stroke: "#db2777", glow: "rgba(219, 39, 119, 0.1)", text: "text-pink-600" }, // pink
    { stroke: "#059669", glow: "rgba(5, 150, 105, 0.1)", text: "text-emerald-600" }, // emerald
    { stroke: "#ea580c", glow: "rgba(234, 88, 12, 0.1)", text: "text-orange-600" }, // orange
  ];

  const handleNodeMouseEnter = (e: React.MouseEvent, stop: RouteStop) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
    if (parentRect) {
      setTooltipPos({
        x: rect.left - parentRect.left + rect.width / 2,
        y: rect.top - parentRect.top - 100,
      });
    }
    setHoveredNode(stop);
  };

  const handleNodeMouseLeave = () => {
    setHoveredNode(null);
  };

  // Landmark labels representing Nagpur geography with actual lat/lng
  const nagpurLandmarks = [
    { name: "MIHAN Depot", lat: 21.0625, lng: 79.0526, align: "middle" as const, fontClass: "font-black fill-slate-900" },
    { name: "Dharampeth", lat: 21.1432, lng: 79.0612, align: "end" as const, fontClass: "fill-slate-400" },
    { name: "Sadar", lat: 21.1611, lng: 79.0805, align: "middle" as const, fontClass: "fill-slate-400" },
    { name: "Sitabuldi", lat: 21.1444, lng: 79.0880, align: "middle" as const, fontClass: "fill-slate-400" },
    { name: "Manish Nagar", lat: 21.0945, lng: 79.0832, align: "start" as const, fontClass: "fill-slate-400" },
    { name: "Wardha Road", lat: 21.0822, lng: 79.0712, align: "end" as const, fontClass: "fill-slate-400" },
    { name: "Besa", lat: 21.0872, lng: 79.1121, align: "start" as const, fontClass: "fill-slate-400" },
    { name: "Nandanvan", lat: 21.1340, lng: 79.1220, align: "start" as const, fontClass: "fill-slate-400" },
  ];

  return (
    <div className="relative w-full h-[520px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* Header overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-0.5 pointer-events-none text-left">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
          <Map className="w-4 h-4 text-slate-600" />
          Nagpur - MIHAN Route Map
        </h3>
        <p className="text-[10px] text-slate-500 font-medium">
          Office hub at MIHAN. Nagpur suburbs connected via active cab paths.
        </p>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-3.5 text-[10px] font-semibold bg-white/95 px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 border border-slate-500"></span>
          <span className="text-slate-600">Male</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-purple-400"></span>
          <span className="text-purple-600">Female</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
          <span className="text-red-500">Alert</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full select-none flex-grow"
        onClick={() => onSelectRoute(null)}
      >
        {/* Simple grid lines for light mode */}
        <defs>
          <pattern id="lightGrid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="0.3"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#lightGrid)" />

        {/* Draw Landmark Labels */}
        {nagpurLandmarks.map((lm, idx) => (
          <text
            key={idx}
            x={scaleX(lm.lng)}
            y={scaleY(lm.lat)}
            textAnchor={lm.align}
            className={`text-[2.2px] font-mono font-bold select-none ${lm.fontClass}`}
          >
            {lm.name}
          </text>
        ))}

        {/* 1. Draw Inactive Routes First */}
        {routes.map((route, routeIdx) => {
          const isSelected = selectedRouteId === route.id;
          if (isSelected) return null;

          const color = routeColors[routeIdx % routeColors.length];
          const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);

          if (sortedStops.length === 0) return null;

          const points = sortedStops.map((s) => ({ x: scaleX(s.employee.x), y: scaleY(s.employee.y) }));
          
          let pathD = `M ${DEPOT_X} ${DEPOT_Y}`;
          points.forEach((p) => {
            pathD += ` L ${p.x} ${p.y}`;
          });
          pathD += ` L ${DEPOT_X} ${DEPOT_Y}`;

          return (
            <g key={route.id} className="opacity-20 hover:opacity-70 transition-opacity duration-200">
              <path
                d={pathD}
                fill="none"
                stroke="#64748b"
                strokeWidth="0.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRoute(route.id);
                }}
              />
            </g>
          );
        })}

        {/* 2. Draw Selected Route on Top */}
        {routes.map((route, routeIdx) => {
          const isSelected = selectedRouteId === route.id;
          if (!isSelected) return null;

          const color = routeColors[routeIdx % routeColors.length];
          const sortedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder);

          if (sortedStops.length === 0) return null;

          const points = sortedStops.map((s) => ({ x: scaleX(s.employee.x), y: scaleY(s.employee.y) }));
          
          let pathD = `M ${DEPOT_X} ${DEPOT_Y}`;
          points.forEach((p) => {
            pathD += ` L ${p.x} ${p.y}`;
          });
          pathD += ` L ${DEPOT_X} ${DEPOT_Y}`;

          return (
            <g key={route.id} className="z-10">
              {/* Highlight Path Glow */}
              <path
                d={pathD}
                fill="none"
                stroke={color.stroke}
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-15"
              />
              {/* Solid Core Path */}
              <path
                d={pathD}
                fill="none"
                stroke={color.stroke}
                strokeWidth="0.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Animated sequence dash */}
              <path
                d={pathD}
                fill="none"
                stroke="#ffffff"
                strokeWidth="0.8"
                strokeDasharray="2, 8"
                strokeLinecap="round"
                className="opacity-75 animate-[dash_5s_linear_infinite]"
              />
            </g>
          );
        })}

        {/* 3. Draw Office Depot Node (MIHAN) */}
        <g transform={`translate(${DEPOT_X}, ${DEPOT_Y})`} className="cursor-pointer">
          <circle
            r="2.8"
            className="fill-slate-900 stroke-slate-700 stroke-[0.5]"
          />
          <polygon
            points="-0.8,1.2 0.8,1.2 0,-0.8"
            className="fill-white"
          />
        </g>

        {/* 4. Draw Employee Checkpoints */}
        {routes.map((route, routeIdx) => {
          const isRouteSelected = selectedRouteId === route.id;
          const color = routeColors[routeIdx % routeColors.length];

          return route.stops.map((stop) => {
            const isFemale = stop.employee.gender === "FEMALE";
            
            // Check if this stop has an unresolved safety violation
            const isViolationStop = route.violations.some(
              (v) =>
                !v.resolved &&
                ((v.type === "FEMALE_FIRST_PICKUP" && stop.stopOrder === 1) ||
                  (v.type === "FEMALE_LAST_DROP" && stop.stopOrder === route.stops.length))
            );

            return (
              <g
                key={stop.id}
                transform={`translate(${scaleX(stop.employee.x)}, ${scaleY(stop.employee.y)})`}
                className="cursor-pointer"
                onMouseEnter={(e) => handleNodeMouseEnter(e, stop)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRoute(route.id);
                }}
              >
                {/* Pulsing ring for alerts */}
                {isViolationStop ? (
                  <circle
                    r="3.5"
                    className="fill-none stroke-red-500 stroke-[0.5] animate-ping"
                  />
                ) : isRouteSelected ? (
                  <circle
                    r="2.8"
                    className="fill-none stroke-[0.3]"
                    stroke={color.stroke}
                  />
                ) : null}

                {/* Main checkpoint circle */}
                <circle
                  r="1.8"
                  className={`
                    transition-all duration-200
                    ${isViolationStop ? "fill-red-100 stroke-red-500 stroke-[0.6]" : ""}
                    ${!isViolationStop && isFemale ? "fill-purple-50 stroke-purple-400 stroke-[0.6]" : ""}
                    ${!isViolationStop && !isFemale ? "fill-slate-50 stroke-slate-500 stroke-[0.5]" : ""}
                    ${isRouteSelected && !isViolationStop ? "stroke-[0.8]" : ""}
                  `}
                />

                {/* Inner dot */}
                <circle
                  r="0.5"
                  className={`
                    ${isViolationStop ? "fill-red-500" : ""}
                    ${!isViolationStop && isFemale ? "fill-purple-500" : ""}
                    ${!isViolationStop && !isFemale ? "fill-slate-600" : ""}
                  `}
                />

                {/* Stop sequence badge for selected route */}
                {isRouteSelected && (
                  <g className="pointer-events-none">
                    <rect
                      x="2.2"
                      y="-4.2"
                      width="15"
                      height="3.6"
                      rx="0.6"
                      className="fill-white/95 stroke-slate-200 stroke-[0.1] filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.05)]"
                    />
                    <text
                      x="3.2"
                      y="-1.8"
                      className="text-[1.8px] font-sans font-black fill-slate-800"
                    >
                      #{stop.stopOrder}: {stop.employee.name.split(" ")[0]}
                    </text>
                  </g>
                )}
              </g>
            );
          });
        })}
      </svg>

      {/* Node Tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-20 w-60 bg-white border border-slate-200 p-3 rounded-lg shadow-lg pointer-events-none flex flex-col gap-1 text-left"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="flex justify-between items-center border-b border-slate-100 pb-1">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              {hoveredNode.employee.name}
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold
                ${
                  hoveredNode.employee.gender === "FEMALE"
                    ? "bg-purple-50 text-purple-600 border border-purple-200"
                    : "bg-slate-50 text-slate-500 border border-slate-200"
                }
              `}
            >
              {hoveredNode.employee.gender}
            </span>
          </div>

          <div className="text-[10px] text-slate-600 flex flex-col gap-0.5">
            <p>
              <span className="text-slate-400">Code:</span> {hoveredNode.employee.employeeCode}
            </p>
            <p>
              <span className="text-slate-400">Stop index:</span> #{hoveredNode.stopOrder} (ETA: {hoveredNode.etaMinutes} mins)
            </p>
            <p className="truncate">
              <span className="text-slate-400">Address:</span> {hoveredNode.employee.address}
            </p>
          </div>
        </div>
      )}

      {/* SVG dash animation */}
      <style jsx global>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -40;
          }
        }
      `}</style>
    </div>
  );
}
