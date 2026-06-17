import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/db";

// Cache tags for easy invalidation
export const CACHE_TAGS = {
  EMPLOYEES: "employees",
  PICKUP_POINTS: "pickup-points",
  CABS: "cabs",
  SHIFTS: "shifts",
  ROUTES: "routes",
  METRICS: "metrics"
};

// 1. Cached Employees fetcher (10 mins TTL)
export const getCachedEmployees = unstable_cache(
  async () => {
    return prisma.employee.findMany({
      include: {
        shift: true,
        manager: { select: { id: true, name: true } },
        pickupPoint: true,
      },
      orderBy: { name: "asc" },
    });
  },
  ["employees-all-key"],
  { revalidate: 600, tags: [CACHE_TAGS.EMPLOYEES] }
);

// 2. Cached Active Employees fetcher (10 mins TTL)
export const getCachedActiveEmployees = unstable_cache(
  async () => {
    return prisma.employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        shift: true,
        manager: { select: { id: true, name: true } },
        pickupPoint: true,
      },
      orderBy: { name: "asc" },
    });
  },
  ["employees-active-key"],
  { revalidate: 600, tags: [CACHE_TAGS.EMPLOYEES] }
);

// 3. Cached Pickup Points fetcher (30 mins TTL)
export const getCachedPickupPoints = unstable_cache(
  async () => {
    return prisma.pickupPoint.findMany({
      include: {
        employees: {
          where: { status: "ACTIVE" },
          select: { id: true, name: true, zone: true, subZone: true },
        },
      },
      orderBy: { name: "asc" },
    });
  },
  ["pickup-points-all-key"],
  { revalidate: 1800, tags: [CACHE_TAGS.PICKUP_POINTS] }
);

// 4. Cached Cabs fetcher (10 mins TTL)
export const getCachedCabs = unstable_cache(
  async () => {
    return prisma.cab.findMany({
      include: {
        shifts: true,
        user: { select: { email: true, isActive: true } },
      },
      orderBy: { vehicleNumber: "asc" },
    });
  },
  ["cabs-all-key"],
  { revalidate: 600, tags: [CACHE_TAGS.CABS] }
);

// 5. Cached Shifts fetcher (10 mins TTL)
export const getCachedShifts = unstable_cache(
  async () => {
    return prisma.shift.findMany({
      include: {
        _count: {
          select: {
            employees: { where: { status: "ACTIVE" } },
            cabs: { where: { status: { not: "INACTIVE" } } },
          },
        },
        cabs: {
          where: { status: { not: "INACTIVE" } },
        },
      },
      orderBy: { startTime: "asc" },
    });
  },
  ["shifts-all-key"],
  { revalidate: 600, tags: [CACHE_TAGS.SHIFTS] }
);

// 6. Cached Routes fetcher (5 mins TTL)
export const getCachedRoutes = (date: string) => {
  return unstable_cache(
    async () => {
      return prisma.route.findMany({
        where: {
          date: date,
          cab: { status: { not: "INACTIVE" } },
        },
        include: {
          cab: true,
          shift: true,
          stops: {
            include: { employee: { include: { pickupPoint: true } } },
            orderBy: { stopOrder: "asc" },
          },
          violations: true,
        },
        orderBy: { tripSequence: "asc" },
      });
    },
    [`routes-${date}-key`],
    { revalidate: 300, tags: [CACHE_TAGS.ROUTES] }
  )();
};

// 7. Cached Optimization Metrics fetcher (30 mins TTL)
export const getCachedOptimizationMetrics = (date: string) => {
  return unstable_cache(
    async () => {
      return prisma.optimizationRun.findMany({
        where: { date },
        orderBy: { createdAt: "desc" },
      });
    },
    [`metrics-${date}-key`],
    { revalidate: 1800, tags: [CACHE_TAGS.METRICS] }
  )();
};

// Cache Invalidators
export function invalidateEmployeesCache() {
  console.log("[CACHE] Invalidated Employees Cache");
  revalidateTag(CACHE_TAGS.EMPLOYEES);
}

export function invalidatePickupPointsCache() {
  console.log("[CACHE] Invalidated Pickup Points Cache");
  revalidateTag(CACHE_TAGS.PICKUP_POINTS);
}

export function invalidateCabsCache() {
  console.log("[CACHE] Invalidated Cabs Cache");
  revalidateTag(CACHE_TAGS.CABS);
}

export function invalidateShiftsCache() {
  console.log("[CACHE] Invalidated Shifts Cache");
  revalidateTag(CACHE_TAGS.SHIFTS);
}

export function invalidateRoutesCache() {
  console.log("[CACHE] Invalidated Routes Cache");
  revalidateTag(CACHE_TAGS.ROUTES);
}

export function invalidateMetricsCache() {
  console.log("[CACHE] Invalidated Metrics Cache");
  revalidateTag(CACHE_TAGS.METRICS);
}

export function invalidateAllCache() {
  console.log("[CACHE] Invalidated All Caches");
  revalidateTag(CACHE_TAGS.EMPLOYEES);
  revalidateTag(CACHE_TAGS.PICKUP_POINTS);
  revalidateTag(CACHE_TAGS.CABS);
  revalidateTag(CACHE_TAGS.SHIFTS);
  revalidateTag(CACHE_TAGS.ROUTES);
  revalidateTag(CACHE_TAGS.METRICS);
}
