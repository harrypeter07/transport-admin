import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseExcelRoster } from "@/lib/excelParser";
import { geocodePlace, makeDepot } from "@/lib/optimization";

import bcrypt from "bcryptjs";
import { verifySession } from "@/lib/dal";
import { requireApiRole } from "@/lib/apiAuth";

// GET all employees
export async function GET(req: NextRequest) {
  const session = await verifySession();
  if (session.role !== "ADMIN" && session.role !== "MANAGER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const shiftId = searchParams.get("shiftId");

  try {
    const whereClause: any = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
          { department: { contains: search, mode: "insensitive" } },
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
    console.error("Error fetching employees:", e);
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}

// DELETE an employee
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { status: "INACTIVE" },
      });

      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Error deleting employee:", e);
    return NextResponse.json({ error: "Failed to delete employee" }, { status: 500 });
  }
}

// POST: Add new employee or bulk upload Excel
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const contentType = req.headers.get("content-type") || "";
    const defaultPassword = await bcrypt.hash("Welcome@123", 10);

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const shiftId = formData.get("shiftId") as string;

      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const rows = parseExcelRoster(buffer);

      let createdCount = 0;
      let skippedCount = 0;

      for (const row of rows) {
        try {
          const coords = await geocodeNagpurPlace(row.address || row.name);
          const employeeEmail = row.email || `${row.employeeCode.toLowerCase()}@corporate.com`;

          await prisma.$transaction(async (tx) => {
            let user = await tx.user.findUnique({ where: { email: employeeEmail } });
            if (!user) {
              user = await tx.user.create({
                data: {
                  email: employeeEmail,
                  password: defaultPassword,
                  name: row.name,
                  role: row.department === "Management" || row.employeeCode.includes("MGR") ? "MANAGER" : "EMPLOYEE", // Crude check for excel
                  requiresPasswordChange: true,
                },
              });
            }

            await tx.employee.upsert({
              where: { employeeCode: row.employeeCode },
              update: {
                name: row.name,
                gender: row.gender,
                phone: row.phone,
                email: employeeEmail,
                address: row.address,
                x: coords.x,
                y: coords.y,
                department: row.department,
                shiftId: shiftId || null,
                userId: user.id,
              },
              create: {
                employeeCode: row.employeeCode,
                name: row.name,
                gender: row.gender,
                phone: row.phone,
                email: employeeEmail,
                address: row.address,
                x: coords.x,
                y: coords.y,
                department: row.department,
                shiftId: shiftId || null,
                status: "ACTIVE",
                userId: user.id,
              },
            });
          });
          createdCount++;
        } catch (err) {
          console.error(`Skipping row ${row.employeeCode}:`, err);
          skippedCount++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Bulk import completed. Imported: ${createdCount}, Skipped: ${skippedCount}`,
      });
    } else {
      // Create single employee manually
      const body = await req.json();
      const { employeeCode, name, gender, phone, email, address, department, designation, managerId, shiftId } = body;

      if (!employeeCode || !name || !gender) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      // Fetch settings for dynamic geocoding
      const settings = await prisma.systemSettings.upsert({
        where: { id: "default" }, update: {}, create: { id: "default" }
      });
      const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);

      const coords = await geocodePlace(
        address || "Central",
        settings.defaultCity,
        settings.defaultCountry,
        depot,
        settings.maxPickupRadiusKm
      );

      if (!coords) {
        return NextResponse.json({
          error: `Address is outside the configured ${settings.maxPickupRadiusKm}km pickup radius from ${settings.depotName}.`
        }, { status: 400 });
      }
      const employeeEmail = email || `${employeeCode.toLowerCase()}@corporate.com`;

      const employee = await prisma.$transaction(async (tx) => {
        let user = await tx.user.findUnique({ where: { email: employeeEmail } });
        if (!user) {
          user = await tx.user.create({
            data: {
              email: employeeEmail,
              password: defaultPassword,
              name,
              role: designation === "Manager" || designation === "Senior Manager" ? "MANAGER" : "EMPLOYEE",
              requiresPasswordChange: true,
            },
          });
        }

        return await tx.employee.create({
          data: {
            employeeCode,
            name,
            gender,
            phone,
            email: employeeEmail,
            address: address || "Sadar, Nagpur",
            x: coords.x,
            y: coords.y,
            department: department || "Engineering",
            designation: designation || "Engineer",
            managerId: managerId || null,
            shiftId: shiftId || null,
            status: "ACTIVE",
            userId: user.id,
          },
        });
      });

      return NextResponse.json(employee);
    }
  } catch (e) {
    console.error("Error creating employee(s):", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH: Edit employee details
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json();
    const { id, name, gender, phone, email, address, department, designation, managerId, shiftId, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }

    const currentEmp = await prisma.employee.findUnique({ where: { id } });
    if (!currentEmp) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Recalculate coordinates if address is being updated and has changed
    let coords = { x: currentEmp.x, y: currentEmp.y };
    if (address && address !== currentEmp.address) {
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
        x: coords.x,
        y: coords.y,
        department: department !== undefined ? department : undefined,
        designation: designation !== undefined ? designation : undefined,
        managerId: managerId !== undefined ? (managerId || null) : undefined,
        shiftId: shiftId !== undefined ? (shiftId || null) : undefined,
        status: status !== undefined ? status : undefined,
      },
    });

    return NextResponse.json(employee);
  } catch (e) {
    console.error("Error updating employee:", e);
    return NextResponse.json({ error: "Failed to update employee details" }, { status: 500 });
  }
}
