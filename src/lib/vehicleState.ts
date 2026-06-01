export type Point = { x: number; y: number };

type RouteLocationSnapshot = {
  lat: number;
  lng: number;
  timestamp?: Date | null;
};

type RouteStopSnapshot = {
  stopOrder: number;
  employee: {
    x: number | null;
    y: number | null;
  } | null;
};

type RouteSnapshot = {
  id: string;
  status: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  currentLat?: number | null;
  currentLng?: number | null;
  lastLocationAt?: Date | null;
  locations?: RouteLocationSnapshot[];
  stops?: RouteStopSnapshot[];
};

export type CabOriginSnapshot = {
  id: string;
  driverX?: number | null;
  driverY?: number | null;
  routes?: RouteSnapshot[];
};

export type CabOriginResolution = {
  startPoint: Point;
  source: "ACTIVE_ROUTE" | "COMPLETED_ROUTE" | "DRIVER_HOME" | "DEPOT";
  routeId?: string | null;
};

function toPoint(x?: number | null, y?: number | null): Point | null {
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  return { x, y };
}

function getRouteLivePoint(route: RouteSnapshot): Point | null {
  const directPoint = toPoint(route.currentLat, route.currentLng);
  if (directPoint) {
    return directPoint;
  }

  const latestLocation = route.locations?.[0];
  if (latestLocation) {
    return toPoint(latestLocation.lat, latestLocation.lng);
  }

  return null;
}

export function getRouteDestinationPoint(route: RouteSnapshot): Point | null {
  const livePoint = getRouteLivePoint(route);
  if (livePoint) {
    return livePoint;
  }

  const lastStop = [...(route.stops || [])].sort((a, b) => b.stopOrder - a.stopOrder)[0];
  if (lastStop?.employee) {
    return toPoint(lastStop.employee.x, lastStop.employee.y);
  }

  return null;
}

function compareRoutePriority(a: RouteSnapshot, b: RouteSnapshot): number {
  const aTime = a.lastLocationAt?.getTime() ?? a.startedAt?.getTime() ?? a.completedAt?.getTime() ?? 0;
  const bTime = b.lastLocationAt?.getTime() ?? b.startedAt?.getTime() ?? b.completedAt?.getTime() ?? 0;
  return bTime - aTime;
}

export function resolveCabOriginFromSnapshot(cab: CabOriginSnapshot, depot: Point): CabOriginResolution {
  const routes = cab.routes || [];
  const activeRoute = routes
    .filter((route) => route.status === "IN_PROGRESS")
    .sort(compareRoutePriority)[0];

  if (activeRoute) {
    const activePoint = getRouteLivePoint(activeRoute);
    if (activePoint) {
      return { startPoint: activePoint, source: "ACTIVE_ROUTE", routeId: activeRoute.id };
    }
  }

  const completedRoute = routes
    .filter((route) => route.status === "COMPLETED")
    .sort(compareRoutePriority)[0];

  if (completedRoute) {
    const completedPoint = getRouteDestinationPoint(completedRoute);
    if (completedPoint) {
      return { startPoint: completedPoint, source: "COMPLETED_ROUTE", routeId: completedRoute.id };
    }
  }

  const driverHome = toPoint(cab.driverX, cab.driverY);
  if (driverHome) {
    return { startPoint: driverHome, source: "DRIVER_HOME" };
  }

  return { startPoint: depot, source: "DEPOT" };
}
