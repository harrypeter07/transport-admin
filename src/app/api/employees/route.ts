import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocodePlace, makeDepot } from "@/lib/optimization";
import { mapsProvider } from "@/lib/maps";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { verifySession } from "@/lib/dal";
import { requireApiRole } from "@/lib/apiAuth";
import { audit } from "@/lib/audit";

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableTextValue(value: unknown): string | null {
  const text = textValue(value);
  return text || null;
}

function prismaEmployeeWriteResponse(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  if (error.code === "P2002") {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];

    if (fields.includes("employeeCode")) {
      return NextResponse.json({ error: "An employee with this code already exists." }, { status: 409 });
    }
    if (fields.includes("email")) {
      return NextResponse.json({ error: "An employee or user with this email already exists." }, { status: 409 });
    }
    if (fields.includes("userId")) {
      return NextResponse.json({ error: "This user account is already linked to another employee." }, { status: 409 });
    }

    return NextResponse.json({ error: "Employee details conflict with an existing record." }, { status: 409 });
  }

  if (error.code === "P2003") {
    return NextResponse.json({ error: "Selected manager or shift is invalid." }, { status: 400 });
  }

  return null;
}

// GET all employees
function reqIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
}

export async function GET(req: NextRequest) {
  const session = await verifySession();
  const ip = reqIp(req);
  if (session.role !== "ADMIN" && session.role !== "MANAGER") {
    console.warn("[api] 🔒 GET /api/employees — UNAUTHORIZED", { role: session.role, ip });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const shiftId = searchParams.get("shiftId");

  try {
    const whereClause: Prisma.EmployeeWhereInput = {
      status: "ACTIVE",
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { employeeCode: { contains: search, mode: "insensitive" as const } },
          { department: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(shiftId && { shiftId }),
    };

    if (session.role === "MANAGER") {
      const managerEmployee = await prisma.employee.findFirst({
        where: { userId: session.userId },
        select: { id: true },
      });

      if (!managerEmployee) {
        return NextResponse.json([]);
      }

      whereClause.managerId = managerEmployee.id;
    }

    const employees = await prisma.employee.findMany({
      where: whereClause,
      include: {
        shift: true,
        manager: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(employees);
  } catch (e) {
    console.error("[api] ❌ GET /api/employees — Failed to fetch", { ip, search: search || undefined }, e);
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}

// DELETE an employee
export async function DELETE(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }

    const before = await prisma.employee.findUnique({
      where: { id },
    });

    if (!before) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { status: "INACTIVE" },
      });

      if (before.userId) {
        await tx.user.update({
          where: { id: before.userId },
          data: { isActive: false },
        });
      }
    });

    // Remove only this employee's stops from pending/planned routes.
    // Only delete the route if it would become empty — never cascade-delete other employees.
    const pendingStops = await prisma.routeStop.findMany({
      where: { employeeId: id, route: { status: { in: ["PENDING", "PLANNED"] } } },
      select: { id: true, routeId: true }
    });
    if (pendingStops.length > 0) {
      const affectedRouteIds = [...new Set(pendingStops.map(s => s.routeId))];
      // Remove only this employee's stops
      await prisma.routeStop.deleteMany({ where: { employeeId: id, routeId: { in: affectedRouteIds } } });
      // For each affected route, re-number remaining stops and delete route if empty
      for (const routeId of affectedRouteIds) {
        const remaining = await prisma.routeStop.findMany({
          where: { routeId },
          orderBy: { stopOrder: "asc" }
        });
        if (remaining.length === 0) {
          await prisma.violation.deleteMany({ where: { routeId } });
          await prisma.route.delete({ where: { id: routeId } });
          console.info(`[api] Deleted empty route ${routeId} after employee removal.`);
        } else {
          // Re-sequence stopOrder to be contiguous
          for (let i = 0; i < remaining.length; i++) {
            await prisma.routeStop.update({ where: { id: remaining[i].id }, data: { stopOrder: i + 1 } });
          }
          console.info(`[api] Removed stop from route ${routeId}, ${remaining.length} stops remain.`);
        }
      }
    }

    await audit({ userId: auth.session.userId, role: auth.session.role, action: "DELETE", entity: "Employee", entityId: id, before, after: { status: "INACTIVE" }, ip });
    console.info("[api] ✅ DELETE /api/employees — OK", { employeeCode: before.employeeCode, id, userId: auth.session.userId, ip });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[api] ❌ DELETE /api/employees — Failed", { ip }, e);
    return NextResponse.json({ error: "Failed to delete employee" }, { status: 500 });
  }
}

// POST: Add single employee
export async function POST(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const defaultPassword = await bcrypt.hash("Welcome@123", 10);
    const body = await req.json();
    const employeeCode = textValue(body.employeeCode);
    const name = textValue(body.name);
    const gender = textValue(body.gender);
    const phone = textValue(body.phone);
    const email = textValue(body.email);
    const address = textValue(body.address);
    const formattedAddress = textValue(body.formattedAddress) || address;
    const placeId = body.placeId || null;
    const autoLat = body.lat ? Number(body.lat) : null;
    const autoLon = body.lon ? Number(body.lon) : null;
    const department = textValue(body.department) || "Engineering";
    const designation = textValue(body.designation) || "Engineer";
    const managerId = nullableTextValue(body.managerId);
    const shiftId = nullableTextValue(body.shiftId);

    if (!employeeCode || !name || !gender) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Use autocomplete coordinates from client, or fall back to server-side geocoding
    let coords: { x: number; y: number; placeId?: string | null };
    if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
      coords = { x: autoLon, y: autoLat, placeId };
    } else {
      const settings = await prisma.systemSettings.upsert({
        where: { id: "default" }, update: {}, create: { id: "default" }
      });
      const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);
      const resolved = await geocodePlace(
        address || name,
        settings.defaultCity,
        settings.defaultCountry,
        depot,
        settings.maxPickupRadiusKm
      );
      if (!resolved) {
        return NextResponse.json({
          error: `Address is outside the configured ${settings.maxPickupRadiusKm}km pickup radius from ${settings.depotName}.`
        }, { status: 400 });
      }
      coords = resolved;
    }
    const employeeEmail = email || `${employeeCode.toLowerCase()}@corporate.com`;

    const existingEmployee = await prisma.employee.findFirst({
      where: {
        OR: [
          { employeeCode },
          { email: employeeEmail },
        ],
      },
      select: { employeeCode: true, email: true },
    });

    if (existingEmployee?.employeeCode === employeeCode) {
      return NextResponse.json({ error: "An employee with this code already exists." }, { status: 409 });
    }

    if (existingEmployee?.email === employeeEmail) {
      return NextResponse.json({ error: "An employee with this email already exists." }, { status: 409 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: employeeEmail },
      include: { employee: { select: { id: true } } },
    });

    if (existingUser?.employee) {
      return NextResponse.json({ error: "This email is already linked to another employee account." }, { status: 409 });
    }

    const employee = await prisma.$transaction(async (tx) => {
      let userId = existingUser?.id;
      if (!userId) {
        const user = await tx.user.create({
          data: {
            email: employeeEmail,
            password: defaultPassword,
            name,
            role: designation === "Manager" || designation === "Senior Manager" ? "MANAGER" : "EMPLOYEE",
            requiresPasswordChange: true,
          },
        });
        userId = user.id;
      }

      return await tx.employee.create({
        data: {
          employeeCode,
          name,
          gender,
          phone,
          email: employeeEmail,
          address: address || "Sadar, Nagpur",
          formattedAddress,
          x: coords.x,
          y: coords.y,
          placeId: coords.placeId || null,
          department,
          designation,
          managerId,
          shiftId,
          status: "ACTIVE",
          userId,
        },
      });
    });

    await audit({ userId: auth.session.userId, role: auth.session.role, action: "CREATE", entity: "Employee", entityId: employee.id, after: { employeeCode: employee.employeeCode, name: employee.name }, ip });
    console.info("[api] ✅ POST /api/employees — OK", { employeeCode: employee.employeeCode, id: employee.id, userId: auth.session.userId, ip });

    return NextResponse.json(employee);
  } catch (e) {
    console.error("[api] ❌ POST /api/employees — Failed", { ip }, e);
    const response = prismaEmployeeWriteResponse(e);
    if (response) return response;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH: Edit employee details
export async function PATCH(req: NextRequest) {
  const ip = reqIp(req);
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { id, name, gender, phone, email, address, department, designation, managerId, shiftId, status } = body;
    const formattedAddress = body.formattedAddress;
    const placeId = body.placeId;
    const autoLat = body.lat ? Number(body.lat) : null;
    const autoLon = body.lon ? Number(body.lon) : null;

    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }

    const currentEmp = await prisma.employee.findUnique({ where: { id } });
    if (!currentEmp) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const beforeSnapshot = { ...currentEmp };

    // Use autocomplete coordinates from client, or re-geocode if address changed
    let coords: { x: number; y: number; placeId?: string | null } = { x: currentEmp.x, y: currentEmp.y, placeId: currentEmp.placeId };
    if (autoLat && autoLon && Number.isFinite(autoLat) && Number.isFinite(autoLon)) {
      coords = { x: autoLon, y: autoLat, placeId: placeId || null };
    } else if (address && address !== currentEmp.address) {
      const settings = await prisma.systemSettings.upsert({
        where: { id: "default" }, update: {}, create: { id: "default" }
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
        return NextResponse.json({
          error: `Address is outside the configured ${settings.maxPickupRadiusKm}km pickup radius from ${settings.depotName}.`
        }, { status: 400 });
      }
      coords = resolved;
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        gender: gender !== undefined ? gender : undefined,
        phone: phone !== undefined ? phone : undefined,
        email: email !== undefined ? email : undefined,
        address: address !== undefined ? address : undefined,
        formattedAddress: formattedAddress !== undefined ? formattedAddress : undefined,
        x: coords.x,
        y: coords.y,
        placeId: coords.placeId !== undefined ? (coords.placeId || null) : undefined,
        department: department !== undefined ? department : undefined,
        designation: designation !== undefined ? designation : undefined,
        managerId: managerId !== undefined ? (managerId || null) : undefined,
        shiftId: shiftId !== undefined ? (shiftId || null) : undefined,
        status: status !== undefined ? status : undefined,
      },
    });

    // Remove only this employee's stops from pending/planned routes.
    // Only delete the route if it would become empty.
    const pendingStops = await prisma.routeStop.findMany({
      where: { employeeId: id, route: { status: { in: ["PENDING", "PLANNED"] } } },
      select: { id: true, routeId: true }
    });
    if (pendingStops.length > 0) {
      const affectedRouteIds = [...new Set(pendingStops.map(s => s.routeId))];
      await prisma.routeStop.deleteMany({ where: { employeeId: id, routeId: { in: affectedRouteIds } } });
      for (const routeId of affectedRouteIds) {
        const remaining = await prisma.routeStop.findMany({
          where: { routeId },
          orderBy: { stopOrder: "asc" }
        });
        if (remaining.length === 0) {
          await prisma.violation.deleteMany({ where: { routeId } });
          await prisma.route.delete({ where: { id: routeId } });
        } else {
          for (let i = 0; i < remaining.length; i++) {
            await prisma.routeStop.update({ where: { id: remaining[i].id }, data: { stopOrder: i + 1 } });
          }
        }
      }
      console.info(`[api] Removed stops for updated employee ${id} from ${affectedRouteIds.length} routes.`);
    }

    await audit({ userId: auth.session.userId, role: auth.session.role, action: "UPDATE", entity: "Employee", entityId: id, before: beforeSnapshot, after: employee, ip });
    console.info("[api] ✅ PATCH /api/employees — OK", { employeeCode: employee.employeeCode, id, userId: auth.session.userId, ip });

    return NextResponse.json(employee);
  } catch (e) {
    console.error("[api] ❌ PATCH /api/employees — Failed", { ip }, e);
    return NextResponse.json({ error: "Failed to update employee details" }, { status: 500 });
  }
}
