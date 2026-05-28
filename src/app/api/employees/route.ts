import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseExcelRoster } from "@/lib/excelParser";
import { geocodeNagpurPlace } from "@/lib/optimization";

// GET all employees
export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        shift: true,
      },
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
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }
    await prisma.employee.delete({
      where: { id },
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
    const contentType = req.headers.get("content-type") || "";

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
          // Resolve coordinates automatically using geocoder
          const coords = await geocodeNagpurPlace(row.address || row.name);
          await prisma.employee.upsert({
            where: { employeeCode: row.employeeCode },
            update: {
              name: row.name,
              gender: row.gender,
              phone: row.phone,
              email: row.email,
              address: row.address,
              x: coords.x,
              y: coords.y,
              department: row.department,
              shiftId: shiftId || null,
            },
            create: {
              employeeCode: row.employeeCode,
              name: row.name,
              gender: row.gender,
              phone: row.phone,
              email: row.email,
              address: row.address,
              x: coords.x,
              y: coords.y,
              department: row.department,
              shiftId: shiftId || null,
              status: "ACTIVE",
            },
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
      const { employeeCode, name, gender, phone, email, address, department, shiftId } = body;

      if (!employeeCode || !name || !gender) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      // Geocode neighborhood name to coordinates
      const coords = await geocodeNagpurPlace(address || "Nagpur");

      const employee = await prisma.employee.create({
        data: {
          employeeCode,
          name,
          gender,
          phone,
          email: email || `${employeeCode.toLowerCase()}@corporate.com`,
          address: address || "Sadar, Nagpur",
          x: coords.x,
          y: coords.y,
          department: department || "Engineering",
          shiftId: shiftId || null,
          status: "ACTIVE",
        },
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
    const body = await req.json();
    const { id, name, gender, phone, email, address, department, shiftId, status } = body;

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
      coords = await geocodeNagpurPlace(address);
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
