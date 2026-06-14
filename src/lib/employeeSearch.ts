/** Shared employee / route search helpers */

export function normalizeSheetOption(
  sheet: string | { name: string; inferredDate?: string | null; routePreviewCount?: number }
): { name: string; inferredDate: string | null; routePreviewCount: number } {
  if (typeof sheet === "string") {
    return { name: sheet, inferredDate: null, routePreviewCount: 0 };
  }
  return {
    name: sheet.name,
    inferredDate: sheet.inferredDate ?? null,
    routePreviewCount: sheet.routePreviewCount ?? 0,
  };
}

export function stopMatchesEmployeeSearch(
  stop: { employee?: { name?: string; employeeCode?: string; address?: string } },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const e = stop.employee;
  return [e?.name, e?.employeeCode, e?.address].some((field) =>
    field?.toLowerCase().includes(q)
  );
}

export function routeMatchesEmployeeSearch(
  route: {
    stops?: Array<{ employee?: { name?: string; employeeCode?: string; address?: string } }>;
    cab?: { driverName?: string | null; vehicleNumber?: string | null };
  },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (route.cab?.driverName?.toLowerCase().includes(q)) return true;
  if (route.cab?.vehicleNumber?.toLowerCase().includes(q)) return true;
  return (route.stops || []).some((s) => stopMatchesEmployeeSearch(s, q));
}

export function formatRouteStartLabel(route: {
  cab?: { driverAddress?: string | null; driverX?: number | null; driverY?: number | null; driverName?: string | null };
  startPoint?: { lat?: number; lng?: number; x?: number; y?: number };
}): string {
  const cab = route.cab;
  if (cab?.driverAddress?.trim()) return cab.driverAddress.trim();
  const sp = route.startPoint;
  if (sp) {
    const lat = sp.lat ?? sp.y;
    const lng = sp.lng ?? sp.x;
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }
  if (typeof cab?.driverY === "number" && typeof cab?.driverX === "number") {
    return `${cab.driverY.toFixed(4)}, ${cab.driverX.toFixed(4)}`;
  }
  return "Depot";
}
