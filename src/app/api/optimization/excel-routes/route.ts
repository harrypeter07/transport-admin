/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import * as xlsx from "xlsx";
import fs from "fs";
import path from "path";

// Utility to parse Excel buffers into route JSON objects
async function parseExcelBufferToRoutes(buffer: Buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<any>(sheet, { header: 1 });

  const dataRows = rows.slice(1);
  const employees = await prisma.employee.findMany();
  
  const routeGroups: Record<string, any[]> = {};
  for (const row of dataRows) {
    if (!row || row.length === 0 || !row[0]) continue;
    const routeNo = String(row[0]).trim();
    if (!routeGroups[routeNo]) routeGroups[routeNo] = [];
    routeGroups[routeNo].push(row);
  }

  const generatedRoutes: any[] = [];
  const cabs = await prisma.cab.findMany({ include: { user: true } });
  const dbShifts = await prisma.shift.findMany();
  const assignedCabIds = new Set<string>();

  for (const [routeNo, rRows] of Object.entries(routeGroups)) {
    let vehicleNumber = "Unknown";
    let driverName = "Unknown";
    let driverPhone = "Unknown";
    let shiftId = "shift-0500";
    let parsedStartTime = "05:00";

    for (let i = 0; i < rRows.length; i++) {
      const detail = rRows[i][12];
      if (detail) {
        const str = String(detail).trim();
        if (i === 0) vehicleNumber = str;
        else if (i === 1) driverName = str;
        else if (i === 2) driverPhone = str;
      }

      const shiftVal = rRows[i][8];
      if (shiftVal) {
        if (typeof shiftVal === "number") {
          const totalMinutes = Math.round(shiftVal * 24 * 60);
          const hours = Math.floor(totalMinutes / 60);
          const mins = totalMinutes % 60;
          parsedStartTime = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        } else {
          const str = String(shiftVal).toLowerCase();
          if (str.includes("11:30")) parsedStartTime = "11:30";
          else if (str.includes("11")) parsedStartTime = "11:00";
          else if (str.includes("10")) parsedStartTime = "10:00";
          else if (str.includes("8")) parsedStartTime = "08:00";
          else if (str.includes("5")) parsedStartTime = "05:00";
        }
      }

      let dbShift = dbShifts.find(s => s.startTime === parsedStartTime);
      if (!dbShift) {
        dbShift = await prisma.shift.create({
          data: { name: `Shift ${parsedStartTime}`, startTime: parsedStartTime, endTime: "23:59" }
        });
        dbShifts.push(dbShift);
      }
      shiftId = dbShift.id;
    }

    let dbCab = cabs.find(c => !assignedCabIds.has(c.id) && c.vehicleNumber.replace(/\s/g, '').toLowerCase() === vehicleNumber.replace(/\s/g, '').toLowerCase());
    if (!dbCab && driverName && driverName !== "Unknown") {
      const queryName = driverName.toLowerCase().trim();
      dbCab = cabs.find(c => !assignedCabIds.has(c.id) && ((c.driverName && c.driverName.toLowerCase().includes(queryName)) || (c.user?.name && c.user.name.toLowerCase().includes(queryName))));
    }
    
    if (dbCab) assignedCabIds.add(dbCab.id);
    const cabId = dbCab ? dbCab.id : `manual_${routeNo}`;

    const stops: any[] = [];
    const seenEmpNames = new Set<string>();
    let rowIndex = 0;
    
    for (const row of rRows) {
      rowIndex++;
      const empName = String(row[4] || "").trim();
      if (!empName || empName.toLowerCase() === "employee name" || empName.toLowerCase() === "name") continue;
      if (seenEmpNames.has(empName.toLowerCase())) continue;
      seenEmpNames.add(empName.toLowerCase());

      const excelEmpCode = String(row[3] || "").trim();
      let dbEmp = undefined;
      if (excelEmpCode.toLowerCase() !== "na") dbEmp = employees.find(e => e.employeeCode === excelEmpCode);
      if (!dbEmp && empName) dbEmp = employees.find(e => e.name.toLowerCase() === empName.toLowerCase());

      const empId = dbEmp ? dbEmp.id : `excel_${routeNo}_${rowIndex}`;
      
      stops.push({
        employeeId: empId,
        stopOrder: stops.length + 1,
        etaMinutes: 0,
        status: "PENDING",
        employee: {
          id: empId,
          name: dbEmp ? dbEmp.name : (empName || "Unknown Employee"),
          gender: dbEmp ? dbEmp.gender : (row[13] === "F" ? "FEMALE" : "MALE"),
          x: dbEmp ? dbEmp.x : 21.127814,
          y: dbEmp ? dbEmp.y : 79.006815,
          address: dbEmp ? dbEmp.address : String(row[7] || "Unknown Address"),
        }
      });
    }

    if (stops.length > 0) {
      // Basic distance estimation logic based on coordinates and radius
      let totalDist = 0;
      const depot = { x: 21.0625, y: 79.0526 };
      let prev = depot;
      stops.forEach(s => {
        const dx = s.employee.x - prev.x;
        const dy = s.employee.y - prev.y;
        totalDist += Math.sqrt(dx*dx + dy*dy) * 111; // Approx degree to km
        prev = { x: s.employee.x, y: s.employee.y };
      });
      totalDist += Math.sqrt((depot.x - prev.x)**2 + (depot.y - prev.y)**2) * 111;

      generatedRoutes.push({
        id: `baseline_route_${routeNo}`,
        cabId,
        vehicleNumber,
        shiftId,
        shiftTime: parsedStartTime,
        isPickup: true,
        capacity: stops.length > 4 ? 6 : 4,
        driverName,
        driverPhone,
        stops,
        totalDistance: Math.round(totalDist * 1.2), // Adding detour multiplier
        totalDuration: Math.round((totalDist * 1.2) / 0.5), // Approx 30km/h
        optimizationScore: 100,
        violations: []
      });
    }
  }

  // Filter out invalid/mobile entries based on past logic
  const filteredRoutes = generatedRoutes.filter(route => {
    if (route.shiftTime === "11:00" && (route.vehicleNumber.toLowerCase().includes("mob-") || route.driverName.toLowerCase().includes("mob-"))) return false;
    if (route.shiftTime === "10:00") return false;
    return true;
  });

  return filteredRoutes;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split('T')[0];

    const { PrismaClient } = require("@prisma/client");
    const localPrisma = new PrismaClient();

    // 1. Look for existing BaselineRoute in the database
    let baseline = await localPrisma.baselineRoute.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    // 2. If it doesn't exist, try to parse roster.xlsx and create it!
    if (!baseline) {
      const rosterPath = path.join(process.cwd(), "roster.xlsx");
      if (fs.existsSync(rosterPath)) {
        const buffer = fs.readFileSync(rosterPath);
        const routes = await parseExcelBufferToRoutes(buffer);

        const stats = {
          routeCount: routes.length,
          totalDistance: routes.reduce((sum: number, r: any) => sum + r.totalDistance, 0)
        };

        baseline = await localPrisma.baselineRoute.create({
          data: {
            snapshotId: `baseline_${Date.now()}`,
            date,
            routeData: JSON.stringify(routes),
            statistics: JSON.stringify(stats),
          }
        });
      } else {
        await localPrisma.$disconnect();
        return NextResponse.json({ routes: [], error: "No baseline found and roster.xlsx missing." });
      }
    }

    const parsedRoutes = typeof baseline.routeData === 'string' 
      ? JSON.parse(baseline.routeData) 
      : baseline.routeData;

    let optimizedSnapshot = await localPrisma.optimizedRouteSnapshot.findFirst({
      where: { date },
      orderBy: { createdAt: 'desc' }
    });

    let parsedOptimized = [];
    if (optimizedSnapshot) {
      parsedOptimized = typeof optimizedSnapshot.routeData === 'string' 
        ? JSON.parse(optimizedSnapshot.routeData) 
        : optimizedSnapshot.routeData;
    }

    await localPrisma.$disconnect();

    return NextResponse.json({
      routes: parsedRoutes,
      optimizedRoutes: parsedOptimized,
      totalRoutes: parsedRoutes.length,
      snapshotId: baseline.snapshotId,
      createdAt: baseline.createdAt
    });

  } catch (e: any) {
    console.error("[api] ❌ GET /api/optimization/excel-routes", e);
    return NextResponse.json({ error: "Failed to fetch baseline routes", details: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const date = formData.get("date") as string || new Date().toISOString().split('T')[0];

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const routes = await parseExcelBufferToRoutes(buffer);

    const stats = {
      routeCount: routes.length,
      totalDistance: routes.reduce((sum: number, r: any) => sum + r.totalDistance, 0)
    };

    const { PrismaClient } = require("@prisma/client");
    const localPrisma = new PrismaClient();

    // Save as permanent baseline snapshot!
    const baseline = await localPrisma.baselineRoute.create({
      data: {
        snapshotId: `baseline_uploaded_${Date.now()}`,
        date,
        routeData: JSON.stringify(routes),
        statistics: JSON.stringify(stats),
      }
    });

    await localPrisma.$disconnect();

    return NextResponse.json({
      success: true,
      routes,
      totalRoutes: routes.length,
      snapshotId: baseline.snapshotId,
      message: "Baseline updated successfully"
    });
  } catch (e: any) {
    console.error("[api] ❌ POST /api/optimization/excel-routes", e);
    return NextResponse.json({ error: "Failed to parse and save Excel routes", details: e.message }, { status: 500 });
  }
}
