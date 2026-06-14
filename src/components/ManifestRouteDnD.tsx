"use client";

import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { Route } from "@/store/useTransportStore";

function DraggableStop({
  stop,
  routeId,
}: {
  stop: Route["stops"][0];
  routeId: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${routeId}:${stop.id}`,
    data: { stopId: stop.id, fromRouteId: routeId, stop },
  });

  if (stop.status === "SKIPPED") return null;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1 p-1.5 bg-white border border-[#e8e8e8] text-[10px] mb-1 ${isDragging ? "opacity-40" : ""}`}
    >
      <button type="button" className="cursor-grab touch-none" {...listeners} {...attributes}>
        <GripVertical className="w-3 h-3 text-[#9a9a9a]" />
      </button>
      <span className="font-bold truncate flex-1">{stop.employee.name}</span>
      {stop.employee.gender === "FEMALE" && (
        <span className="text-[8px] border px-0.5">F</span>
      )}
    </div>
  );
}

function DroppableRouteColumn({
  route,
  children,
}: {
  route: Route;
  children: React.ReactNode;
}) {
  const activeCount = route.stops.filter((s) => s.status !== "SKIPPED").length;
  const { setNodeRef, isOver } = useDroppable({
    id: route.id,
    data: { routeId: route.id, capacity: route.cab?.capacity ?? 6, activeCount },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[140px] flex-1 border border-[#e8e8e8] bg-[#fafafa] p-2 ${isOver ? "ring-2 ring-[#ff4f00]" : ""}`}
    >
      <div className="text-[9px] font-bold uppercase mb-2 truncate" title={route.cab?.vehicleNumber}>
        {route.cab?.vehicleNumber || "Cab"}
        <span className="text-[#9a9a9a] font-mono ml-1">
          {activeCount}/{route.cab?.capacity ?? 6}
        </span>
      </div>
      {children}
    </div>
  );
}

interface ManifestRouteDnDProps {
  routes: Route[];
  onMoveStop: (stopId: string, fromRouteId: string, toRouteId: string) => Promise<{ success: boolean; error?: string }>;
}

export default function ManifestRouteDnD({ routes, onMoveStop }: ManifestRouteDnDProps) {
  const [activeDrag, setActiveDrag] = useState<{ stop: Route["stops"][0]; routeId: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const visibleRoutes = routes.filter((r) => r.status !== "CANCELLED" && r.stops.some((s) => s.status !== "SKIPPED"));

  if (visibleRoutes.length < 2) return null;

  const handleDragStart = (event: DragStartEvent) => {
    setMoveError(null);
    const id = String(event.active.id);
    const [routeId, stopId] = id.split(":");
    const route = visibleRoutes.find((r) => r.id === routeId);
    const stop = route?.stops.find((s) => s.id === stopId);
    if (route && stop) setActiveDrag({ stop, routeId });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const [fromRouteId, stopId] = activeId.split(":");
    const toRouteId = String(over.id);

    if (fromRouteId === toRouteId) return;

    const targetRoute = visibleRoutes.find((r) => r.id === toRouteId);
    const activeCount = targetRoute?.stops.filter((s) => s.status !== "SKIPPED").length ?? 0;
    const capacity = targetRoute?.cab?.capacity ?? 6;
    if (activeCount >= capacity) {
      setMoveError(`Target cab at capacity (${capacity}/${capacity})`);
      return;
    }

    const result = await onMoveStop(stopId, fromRouteId, toRouteId);
    if (!result.success) {
      setMoveError(result.error || "Move rejected");
    }
  };

  return (
    <div className="mt-4 border border-[#e8e8e8] p-3 bg-white">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b6b6b] mb-2">
        Drag employees between routes (capacity & safety checked)
      </div>
      {moveError && (
        <div className="text-[10px] text-red-600 mb-2">{moveError}</div>
      )}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {visibleRoutes.map((route) => (
            <DroppableRouteColumn key={route.id} route={route}>
              {route.stops
                .filter((s) => s.status !== "SKIPPED")
                .sort((a, b) => a.stopOrder - b.stopOrder)
                .map((stop) => (
                  <DraggableStop key={stop.id} stop={stop} routeId={route.id} />
                ))}
            </DroppableRouteColumn>
          ))}
        </div>
        <DragOverlay>
          {activeDrag ? (
            <div className="p-2 bg-white border-2 border-[#ff4f00] text-[10px] font-bold shadow-lg">
              {activeDrag.stop.employee.name}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
