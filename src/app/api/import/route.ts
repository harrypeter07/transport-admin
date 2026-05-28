import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocodeNagpurPlace, getDistance, checkSafetyViolations, DEPOT } from "@/lib/optimization";
import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";

const AVG_SPEED = 0.5; // km per minute

function formatExcelTime(val: any): string {
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinutes = minutes < 10 ? "0" + minutes : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }
  return String(val || "").trim();
}

function parseExcelDate(val: any): string {
  if (typeof val === "number") {
    const dateObj = new Date((val - 25569) * 86400 * 1000);
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val || "").trim();
}

function parseDriverDetails(detailsList: any[]): { vehicleNumber: string; driverName: string; driverPhone: string } {
  let vehicleNumber = "";
  let driverName = "";
  let driverPhone = "";
  
  for (const item of detailsList) {
    if (!item) continue;
    const val = String(item).trim();
    if (val.match(/MH\s?\d{2}\s?[A-Z]{1,2}\s?\d{4}/i)) {
      vehicleNumber = val.toUpperCase().replace(/\s+/g, "");
    } else if (val.toLowerCase().includes("driver") || val.toLowerCase().includes("drver")) {
      driverName = val.replace(/(driver|drver)[:=\s-]+/gi, "").trim();
    } else if (val.toLowerCase().includes("mob") || val.toLowerCase().includes("phone") || val.match(/^\+?\d[\d\s-]{8,12}$/)) {
      driverPhone = val.replace(/(mob|phone)[:=\s-]+/gi, "").trim();
    } else if (!vehicleNumber && val.length > 5 && val.startsWith("MH")) {
      vehicleNumber = val.toUpperCase().replace(/\s+/g, "");
    } else if (!driverName && val.length > 2 && isNaN(val as any)) {
      driverName = val;
    } else if (!driverPhone && val.match(/\d{9,11}/)) {
      driverPhone = val;
    }
  }
  
  return { vehicleNumber, driverName, driverPhone };
}

// GET: List all sheet names from the local roster.xlsx
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "roster.xlsx");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: true,
        sheets: [],
      });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = xlsx.read(fileBuffer, { type: "buffer" });
    return NextResponse.json({
      success: true,
      sheets: workbook.SheetNames,
    });
  } catch (e) {
    console.error("Failed listing Excel sheets:", e);
    return NextResponse.json({ error: "Failed to read excel sheets" }, { status: 500 });
  }
}

// POST: Parse and import a specific sheet OR upload a new roster.xlsx
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      const filePath = path.join(process.cwd(), "roster.xlsx");
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      fs.writeFileSync(filePath, buffer);

      const workbook = xlsx.read(buffer, { type: "buffer" });
      return NextResponse.json({
        success: true,
        message: "Roster spreadsheet uploaded successfully. Choose a sheet date to optimize.",
        sheets: workbook.SheetNames,
      });
    }

    const body = await req.json();
    const { sheetName } = body;

    if (!sheetName) {
      return NextResponse.json({ error: "sheetName is required" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "roster.xlsx");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "roster.xlsx not found in project root" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = xlsx.read(fileBuffer, { type: "buffer" });
    if (!workbook.SheetNames.includes(sheetName)) {
      return NextResponse.json({ error: `Sheet ${sheetName} not found in workbook` }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    // Step 1: Parse rows into route blocks
    let currentRouteNo: string | null = null;
    const routeBlocks: { [key: string]: any[][] } = {};

    rows.forEach((row) => {
      if (!row || row.length === 0) return;
      if (row[0] === "Rout No" || row[0] === "Route No") return; // Skip headers

      const routeNo = String(row[0] || "").trim();
      if (routeNo) {
        currentRouteNo = routeNo;
      }

      if (!currentRouteNo) return;

      if (!routeBlocks[currentRouteNo]) {
        routeBlocks[currentRouteNo] = [];
      }
      routeBlocks[currentRouteNo].push(row);
    });

    let importedRoutesCount = 0;
    let importedEmployeesCount = 0;
    let importedCabsCount = 0;

    // Parse date from sheetName (e.g. 27-5-26 -> 2026-05-27)
    // SheetName is DD-MM-YY or D-M-YY
    let dateStr = "";
    try {
      const parts = sheetName.split("-");
      if (parts.length === 3) {
        const d = parts[0].padStart(2, "0");
        const m = parts[1].padStart(2, "0");
        const y = `20${parts[2].padStart(2, "0")}`; // e.g. 26 -> 2026
        dateStr = `${y}-${m}-${d}`;
      } else {
        dateStr = new Date().toISOString().split("T")[0];
      }
    } catch {
      dateStr = new Date().toISOString().split("T")[0];
    }

    // Process each route block
    for (const [routeNo, rRows] of Object.entries(routeBlocks)) {
      const isPickup = routeNo.toUpperCase().startsWith("P");

      // Extract driver details
      const driverDetailsColumn = rRows.map((r) => r[12]).filter(Boolean);
      const { vehicleNumber, driverName, driverPhone } = parseDriverDetails(driverDetailsColumn);

      const finalVehicleNumber = vehicleNumber || `CAB-${routeNo}`;
      const finalDriverName = driverName || `Driver ${routeNo}`;
      const finalDriverPhone = driverPhone || "+91 99000 00000";

      // 1. Find or create Cab & Driver
      const cab = await prisma.$transaction(async (tx) => {
        // Find existing cab by vehicleNumber
        let existingCab = await tx.cab.findUnique({
          where: { vehicleNumber: finalVehicleNumber },
          include: { driver: true },
        });

        if (existingCab) {
          // Update driver if name changed
          if (existingCab.driverId) {
            await tx.driver.update({
              where: { id: existingCab.driverId },
              data: {
                name: finalDriverName,
                phone: finalDriverPhone,
              },
            });
          } else {
            const driver = await tx.driver.create({
              data: {
                name: finalDriverName,
                phone: finalDriverPhone,
                licenseNumber: `DL-AUTO-${Math.floor(1000 + Math.random() * 9000)}`,
                status: "AVAILABLE",
              },
            });
            existingCab = await tx.cab.update({
              where: { id: existingCab.id },
              data: { driverId: driver.id },
              include: { driver: true },
            });
          }
          return existingCab;
        } else {
          // Create Driver
          const driver = await tx.driver.create({
            data: {
              name: finalDriverName,
              phone: finalDriverPhone,
              licenseNumber: `DL-AUTO-${Math.floor(1000 + Math.random() * 9000)}`,
              status: "AVAILABLE",
            },
          });
          // Create Cab
          const capacity = Math.max(6, rRows.filter((r) => r[3] && String(r[3]).toLowerCase() !== "escort").length);
          return await tx.cab.create({
            data: {
              vehicleNumber: finalVehicleNumber,
              capacity: capacity,
              vendor: String(rRows[0]?.[1] || "FT").trim(),
              status: "AVAILABLE",
              driverId: driver.id,
            },
            include: {
              driver: true,
            },
          });
        }
      });

      importedCabsCount++;

      // Check if there is an escort row
      const hasEscort = rRows.some((r) => {
        const id = String(r[3] || "").trim().toLowerCase();
        const nm = String(r[4] || "").trim().toLowerCase();
        return id === "escort" || nm === "escort";
      });

      // Parse shift time from first employee row
      const firstEmpRow = rRows.find((r) => r[3] && String(r[3]).toLowerCase() !== "escort");
      const excelShiftTime = firstEmpRow ? firstEmpRow[8] : null;
      const formattedShiftTime = formatExcelTime(excelShiftTime) || "09:00 AM";

      // 2. Find or create Shift
      let shift = await prisma.shift.findFirst({
        where: {
          startTime: formattedShiftTime.replace(/\s*[AP]M/gi, "").trim(),
        },
      });

      if (!shift) {
        // Create new Shift
        const cleanTime = formattedShiftTime.replace(/\s*[AP]M/gi, "").trim();
        const isPM = formattedShiftTime.toLowerCase().includes("pm");
        let hours = parseInt(cleanTime.split(":")[0]);
        const mins = cleanTime.split(":")[1] || "00";
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        
        // End time is roughly +9 hours
        const endHours = (hours + 9) % 24;
        const formattedEndTime = `${String(endHours).padStart(2, "0")}:${mins}`;
        const formattedStartTime = `${String(hours).padStart(2, "0")}:${mins}`;

        shift = await prisma.shift.create({
          data: {
            name: `Shift ${formattedShiftTime}`,
            startTime: formattedStartTime,
            endTime: formattedEndTime,
          },
        });
      }

      // 3. Create employees and route stops
      const routeStopsToCreate: { employeeId: string; stopOrder: number; etaMinutes: number; status: string }[] = [];
      let stopOrder = 1;
      let currentDistance = 0;
      let lastStopCoords = DEPOT;

      // Extract passengers
      for (const r of rRows) {
        const empCode = String(r[3] || "").trim();
        const empName = String(r[4] || "").trim();

        if (!empCode || !empName) continue;
        if (empCode.toLowerCase() === "escort" || empName.toLowerCase() === "escort") continue;

        const finalEmpCode = empCode === "NA" || empCode === "#######" ? `EMP-${empName.replace(/[^a-zA-Z0-9]/g, "")}` : empCode;
        const phone = String(r[5] || "").trim() || "+91 99000 00000";
        const email = String(r[6] || "").trim() || `${finalEmpCode.toLowerCase()}@corporate.com`;
        const address = String(r[7] || "").trim() || "Nagpur";
        const pickupPoint = String(r[9] || "").trim() || address;
        const status = String(r[11] || "YES").trim().toUpperCase() === "YES" ? "PENDING" : "MISSED";
        const gender = String(r[13] || "M").trim().toUpperCase().startsWith("F") ? "FEMALE" : "MALE";

        // Find or create employee by code OR email
        let employee = await prisma.employee.findFirst({
          where: {
            OR: [
              { employeeCode: finalEmpCode },
              { email: email }
            ]
          }
        });

        if (!employee) {
          // Geocode coordinates
          const coords = await geocodeNagpurPlace(pickupPoint);
          employee = await prisma.employee.create({
            data: {
              employeeCode: finalEmpCode,
              name: empName,
              gender: gender,
              phone: phone,
              email: email,
              address: address,
              x: coords.x,
              y: coords.y,
              department: "Operations",
              shiftId: shift.id,
              status: "ACTIVE",
            },
          });
        } else {
          // Link employee to active shift and sync identifiers
          employee = await prisma.employee.update({
            where: { id: employee.id },
            data: { 
              shiftId: shift.id,
              employeeCode: finalEmpCode,
              email: email
            },
          });
        }

        importedEmployeesCount++;

        // Calculate segment distance for ETA
        const stopCoords = { x: employee.x, y: employee.y };
        if (isPickup) {
          if (stopOrder > 1) {
            currentDistance += getDistance(lastStopCoords, stopCoords);
          }
          lastStopCoords = stopCoords;
          routeStopsToCreate.push({
            employeeId: employee.id,
            stopOrder: stopOrder++,
            etaMinutes: Math.round(currentDistance / AVG_SPEED) + 10,
            status: status,
          });
        } else {
          // Drop starts at depot
          if (stopOrder === 1) {
            currentDistance += getDistance(DEPOT, stopCoords);
          } else {
            currentDistance += getDistance(lastStopCoords, stopCoords);
          }
          lastStopCoords = stopCoords;
          routeStopsToCreate.push({
            employeeId: employee.id,
            stopOrder: stopOrder++,
            etaMinutes: Math.round(currentDistance / AVG_SPEED),
            status: status,
          });
        }
      }

      // Add final leg distance
      if (isPickup && routeStopsToCreate.length > 0) {
        currentDistance += getDistance(lastStopCoords, DEPOT);
      }

      const totalDistance = Math.round(currentDistance * 10) / 10;
      const totalDuration = Math.round(currentDistance / AVG_SPEED) + (isPickup ? 10 : 0);

      // Clean up previous route for this cab, date, and shift
      const oldRoutes = await prisma.route.findMany({
        where: { cabId: cab.id, date: dateStr, shiftId: shift.id },
        select: { id: true },
      });
      const oldRouteIds = oldRoutes.map((r) => r.id);
      if (oldRouteIds.length > 0) {
        await prisma.routeStop.deleteMany({ where: { routeId: { in: oldRouteIds } } });
        await prisma.violation.deleteMany({ where: { routeId: { in: oldRouteIds } } });
        await prisma.route.deleteMany({ where: { id: { in: oldRouteIds } } });
      }

      // 4. Create new Route
      const route = await prisma.route.create({
        data: {
          cabId: cab.id,
          date: dateStr,
          shiftId: shift.id,
          isPickup: isPickup,
          totalDistance: totalDistance,
          totalDuration: totalDuration,
          status: "PENDING",
          optimizationScore: 100,
          hasEscort: hasEscort,
        },
      });

      // 5. Create RouteStops in DB
      for (const stop of routeStopsToCreate) {
        await prisma.routeStop.create({
          data: {
            routeId: route.id,
            employeeId: stop.employeeId,
            stopOrder: stop.stopOrder,
            etaMinutes: stop.etaMinutes,
            status: stop.status,
          },
        });
      }

      // 6. Check and insert safety violations
      const stopsData = await prisma.routeStop.findMany({
        where: { routeId: route.id },
        include: { employee: true },
        orderBy: { stopOrder: "asc" },
      });

      const finalViolations = checkSafetyViolations(
        stopsData.map((s) => ({ name: s.employee.name, gender: s.employee.gender as "MALE" | "FEMALE" })),
        isPickup,
        hasEscort
      );

      for (const viol of finalViolations) {
        await prisma.violation.create({
          data: {
            routeId: route.id,
            type: viol.type,
            severity: viol.severity,
            resolved: false,
            notes: viol.notes,
          },
        });
      }

      // Update optimization score with penalty
      const penalty = (hasEscort ? 15 : 0) + finalViolations.length * 30;
      const score = Math.max(30, Math.round(100 - totalDistance * 0.8 - penalty));

      await prisma.route.update({
        where: { id: route.id },
        data: { optimizationScore: score },
      });

      importedRoutesCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Roster import completed for sheet "${sheetName}". Imported ${importedRoutesCount} routes, ${importedEmployeesCount} employee records, and ${importedCabsCount} cab profiles.`,
    });
  } catch (e) {
    console.error("Failed Excel import:", e);
    return NextResponse.json({ error: "Import failed due to spreadsheet layout or server error" }, { status: 500 });
  }
}

// DELETE: Reset database (clear all imported and registry data)
export async function DELETE() {
  try {
    // Delete local roster.xlsx if it exists
    const filePath = path.join(process.cwd(), "roster.xlsx");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.$transaction([
      prisma.violation.deleteMany(),
      prisma.routeStop.deleteMany(),
      prisma.route.deleteMany(),
      prisma.employee.deleteMany(),
      prisma.cab.deleteMany(),
      prisma.driver.deleteMany(),
      prisma.shift.deleteMany(),
    ]);

    return NextResponse.json({
      success: true,
      message: "Database has been reset and Excel sheet has been removed."
    });
  } catch (e) {
    console.error("Failed resetting database:", e);
    return NextResponse.json({ error: "Reset database failed" }, { status: 500 });
  }
}
