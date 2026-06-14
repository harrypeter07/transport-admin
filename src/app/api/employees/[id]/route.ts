export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocodePlace, makeDepot } from "@/lib/optimization";
import { assignZone } from "@/lib/zones";
import { requireApiRole } from "@/lib/apiAuth";
import { audit } from "@/lib/audit";

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableTextValue(value: unknown): string | null {
  const text = textValue(value);
  return text || null;
}

function reqIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
}

async function resolveCoords(
  body: Record<string, unknown>,
  current?: { x: number; y: number; address: string; placeId: string | null }
): Promise<{ x: number; y: number; placeId?: string | null } | NextResponse> {
  const address = body.address !== undefined ? textValue(body.address) : current?.address || "";
  const placeId = body.placeId !== undefined ? (body.placeId as string | null) : current?.placeId;
  const autoLat = body.lat ? Number(body.lat) : null;
  const autoLon = body.lon ? Number(body.lon) : null;

  if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
    return { x: autoLon, y: autoLat, placeId: placeId || null };
  }

  if (current && address === current.address) {
    return { x: current.x, y: current.y, placeId: current.placeId };
  }

  if (!address) {
    if (current) return { x: current.x, y: current.y, placeId: current.placeId };
    return NextResponse.json({ error: "Address is required to resolve coordinates" }, { status: 400 });
  }

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);
  const resolved = await geocodePlace(
    address,
    settings.defaultCity,
    settings.defaultCountry,
    depot,
    settings.maxPickupRadiusKm
  );
  if (!resolved) {
    return NextResponse.json(
      { error: `Address is outside the configured ${settings.maxPickupRadiusKm}km pickup radius from ${settings.depotName}.` },
      { status: 400 }
    );
  }
  return resolved;
}

async function resolvePickupPointId(
  pickupPointId: unknown,
  currentPickupPointId: string | null
): Promise<string | null | NextResponse> {
  if (pickupPointId === undefined) return currentPickupPointId;
  if (pickupPointId === null || pickupPointId === "") return null;

  const id = String(pickupPointId);
  const exists = await prisma.pickupPoint.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "Pickup point not found" }, { status: 404 });
  }
  return id;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = reqIp(_req);
  try {
    const auth = await requireApiRole(["ADMIN", "MANAGER"]);
    if (auth.response) return auth.response;

    const { id } = await params;
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        shift: true,
        manager: { select: { id: true, name: true } },
        pickupPoint: true,
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    return NextResponse.json(employee);
  } catch (e) {
    console.error("[api] ❌ GET /api/employees/[id] — Failed", { ip }, e);
    return NextResponse.json({ error: "Failed to fetch employee" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await req.json();

    const currentEmp = await prisma.employee.findUnique({ where: { id } });
    if (!currentEmp) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const beforeSnapshot = { ...currentEmp };

    if (
      body.pickupPointId !== undefined &&
      Object.keys(body).every((k) => k === "pickupPointId")
    ) {
      const pickupResult = await resolvePickupPointId(body.pickupPointId, currentEmp.pickupPointId);
      if (pickupResult instanceof NextResponse) return pickupResult;

      const employee = await prisma.employee.update({
        where: { id },
        data: { pickupPointId: pickupResult },
        include: {
          shift: true,
          manager: { select: { id: true, name: true } },
          pickupPoint: true,
        },
      });

      await audit({
        userId: auth.session.userId,
        role: auth.session.role,
        action: "UPDATE",
        entity: "Employee",
        entityId: id,
        before: beforeSnapshot,
        after: employee,
        ip,
      });
      return NextResponse.json(employee);
    }

    const coordsResult = await resolveCoords(body, currentEmp);
    if (coordsResult instanceof NextResponse) return coordsResult;

    const pickupResult = await resolvePickupPointId(body.pickupPointId, currentEmp.pickupPointId);
    if (pickupResult instanceof NextResponse) return pickupResult;

    const coordsChanged =
      coordsResult.x !== currentEmp.x ||
      coordsResult.y !== currentEmp.y ||
      (body.address !== undefined && textValue(body.address) !== currentEmp.address);

    const zoneData = coordsChanged || body.lat || body.lon
      ? assignZone(coordsResult.x, coordsResult.y)
      : {
          zone: currentEmp.zone,
          subZone: currentEmp.subZone,
          distanceRing: currentEmp.distanceRing,
          distanceFromDepotKm: currentEmp.distanceFromDepotKm,
        };

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : undefined,
        gender: body.gender !== undefined ? body.gender : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        email: body.email !== undefined ? body.email : undefined,
        address: body.address !== undefined ? body.address : undefined,
        formattedAddress: body.formattedAddress !== undefined ? body.formattedAddress : undefined,
        x: coordsResult.x,
        y: coordsResult.y,
        placeId: coordsResult.placeId !== undefined ? (coordsResult.placeId || null) : undefined,
        zone: zoneData.zone,
        subZone: zoneData.subZone,
        distanceRing: zoneData.distanceRing,
        distanceFromDepotKm: zoneData.distanceFromDepotKm,
        department: body.department !== undefined ? body.department : undefined,
        designation: body.designation !== undefined ? body.designation : undefined,
        managerId: body.managerId !== undefined ? (body.managerId || null) : undefined,
        shiftId: body.shiftId !== undefined ? (body.shiftId || null) : undefined,
        status: body.status !== undefined ? body.status : undefined,
        pickupPointId: pickupResult,
      },
      include: {
        shift: true,
        manager: { select: { id: true, name: true } },
        pickupPoint: true,
      },
    });

    await audit({
      userId: auth.session.userId,
      role: auth.session.role,
      action: "UPDATE",
      entity: "Employee",
      entityId: id,
      before: beforeSnapshot,
      after: employee,
      ip,
    });
    console.info("[api] ✅ PATCH /api/employees/[id] — OK", { employeeCode: employee.employeeCode, id, userId: auth.session.userId, ip });

    return NextResponse.json(employee);
  } catch (e) {
    console.error("[api] ❌ PATCH /api/employees/[id] — Failed", { ip }, e);
    return NextResponse.json({ error: "Failed to update employee details" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(req, ctx);
}
