import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { geocodePlace, makeDepot } from "@/lib/optimization";
import * as xlsx from "xlsx";
import * as path from "path";
import * as fs from "fs";
import { requireApiRole } from "@/lib/apiAuth";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

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

// POST: Upload and process roster.xlsx
export async function POST(req: NextRequest) {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 const contentType = req.headers.get("content-type") || "";

 if (!contentType.includes("multipart/form-data")) {
 return NextResponse.json({ error: "Only multipart/form-data is supported" }, { status: 400 });
 }

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
 const defaultPassword = await bcrypt.hash("Welcome@123", 10);
 
 // Step 1: Parse rows into route blocks across ALL sheets
 const routeBlocks: { [key: string]: any[][] } = {};
 const uniqueEmployeeCodes = new Set<string>();

 for (const sheetName of workbook.SheetNames) {
 const sheet = workbook.Sheets[sheetName];
 const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
 
 let currentRouteNo: string | null = null;
 rows.forEach((row) => {
 if (!row || row.length === 0) return;
 if (row[0] === "Rout No" || row[0] === "Route No") return; // Skip headers

 const routeNo = String(row[0] || "").trim();
 if (routeNo) {
 currentRouteNo = routeNo;
 }

 if (!currentRouteNo) return;

 const empCode = String(row[3] || "").trim();
 // Deduplicate rows so we don't process the same employee multiple times
 const rowKey = `${currentRouteNo}_${empCode}`;

 if (!uniqueEmployeeCodes.has(rowKey)) {
 uniqueEmployeeCodes.add(rowKey);
 if (!routeBlocks[currentRouteNo]) {
 routeBlocks[currentRouteNo] = [];
 }
 routeBlocks[currentRouteNo].push(row);
 }
 });
 }

 let importedEmployeesCount = 0;
 let importedCabsCount = 0;
 let firstShiftId: string | null = null;
 const outlierEmployees: string[] = [];

 // Load system settings for dynamic geocoding
 const settings = await prisma.systemSettings.upsert({
 where: { id: "default" },
 update: {},
 create: { id: "default" },
 });
 const depot = makeDepot(settings.defaultDepotLat, settings.defaultDepotLng);

 let dateStr = new Date().toISOString().split("T")[0];

 // Process each route block
 for (const [routeNo, rRows] of Object.entries(routeBlocks)) {
 const isPickup = routeNo.toUpperCase().startsWith("P");

 // Extract driver details
 const driverDetailsColumn = rRows.map((r) => r[12]).filter(Boolean);
 const { vehicleNumber, driverName, driverPhone } = parseDriverDetails(driverDetailsColumn);

 const finalVehicleNumber = vehicleNumber || `CAB-${routeNo}`;
 const finalDriverName = driverName || `Driver ${routeNo}`;
 const finalDriverPhone = driverPhone || "+91 99000 00000";

 // 1. Find or create Cab
 const cab = await prisma.$transaction(async (tx) => {
 let existingCab = await tx.cab.findUnique({
 where: { vehicleNumber: finalVehicleNumber },
 });

 if (existingCab) {
 // Update driver info if it changed
 return await tx.cab.update({
 where: { id: existingCab.id },
 data: {
 driverName: finalDriverName,
 driverPhone: finalDriverPhone,
 },
 });
 } else {
 const capacity = Math.max(6, rRows.filter((r) => r[3] && String(r[3]).toLowerCase() !== "escort").length);
 return await tx.cab.create({
 data: {
 vehicleNumber: finalVehicleNumber,
 capacity: capacity,
 vendor: String(rRows[0]?.[1] || "FT").trim(),
 status: "AVAILABLE",
 driverName: finalDriverName,
 driverPhone: finalDriverPhone,
 licenseNumber: `DL-AUTO-${Math.floor(1000 + Math.random() * 9000)}`,
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
 let shift = await prisma.shift.findFirst();
 if (!shift) {
 shift = await prisma.shift.create({
 data: {
 name: "Standard Day Shift",
 startTime: "09:00",
 endTime: "18:00",
 },
 });
 }

 // Track the first shiftId found during import
 if (!firstShiftId) {
 firstShiftId = shift.id;
 }

 // 3. Create employees

 // Extract passengers
 for (const r of rRows) {
 const empCode = String(r[3] || "").trim();
 const empName = String(r[4] || "").trim();

 if (!empCode || !empName) continue;
 if (empCode.toLowerCase() === "escort" || empName.toLowerCase() === "escort") continue;

 // Extract row fields
 const phone = String(r[5] || "").trim() || "+91 99000 00000";
 const email = String(r[6] || "").trim();
 const address = String(r[7] || "").trim() || "Nagpur";
 const pickupPoint = String(r[9] || "").trim() || address;

 // Stable generated code for NA / ####### entries:
 // Use name (sanitized) + last 4 digits of phone to avoid collisions across employees
 const phoneDigits = phone.replace(/\D/g, "").slice(-4) || "0000";
 const finalEmpCode =
 empCode === "NA" || empCode === "#######" || empCode === ""
 ? `EMP-${empName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}-${phoneDigits}`
 : empCode;

 // Deterministic email fallback — avoids blank string hitting the Prisma @unique email constraint
 const finalEmail =
 email && email.includes("@")
 ? email
 : `${finalEmpCode.toLowerCase().replace(/[^a-z0-9]/g, "")}.${phoneDigits}@corporate.com`;

 const employeeStatus = String(r[11] || "YES").trim().toUpperCase() === "YES" ? "ACTIVE" : "INACTIVE";
 const stopStatus = employeeStatus === "ACTIVE" ? "PENDING" : "SKIPPED";
 const gender = String(r[13] || "M").trim().toUpperCase().startsWith("F") ? "FEMALE" : "MALE";

 // Find or create employee by code OR email (both are now always non-empty/unique)
 let employee = await prisma.employee.findFirst({
 where: {
 OR: [
 { employeeCode: finalEmpCode },
 { email: finalEmail }
 ]
 }
 });

 // Optimization: Reuse existing geocoded coordinates from database to minimize Nominatim API fetches
 let coords;
 if (employee && employee.x && employee.y) {
 coords = { x: employee.x, y: employee.y };
 } else {
 // Check if another employee has the exact same address already geocoded in our database
 const sameAddressEmp = await prisma.employee.findFirst({
 where: { address: pickupPoint },
 });
 if (sameAddressEmp && sameAddressEmp.x && sameAddressEmp.y) {
 coords = { x: sameAddressEmp.x, y: sameAddressEmp.y };
 } else {
 coords = await geocodePlace(
 pickupPoint,
 settings.defaultCity,
 settings.defaultCountry,
 depot,
 settings.maxPickupRadiusKm
 );
 }
 }

 // Skip outliers — too far from depot
 if (!coords) {
 outlierEmployees.push(`${empName} (${empCode}) @ "${pickupPoint}"`);
 continue;
 }

 const dbAddress = pickupPoint === address ? address : `${pickupPoint} | ${address}`;

 // Provision User Account
 let user = await prisma.user.findUnique({ where: { email: finalEmail } });
 if (!user) {
 user = await prisma.user.create({
 data: {
 email: finalEmail,
 password: defaultPassword,
 name: empName,
 role: empCode.includes("MGR") || String(r[10] || "").toLowerCase().includes("manager") ? "MANAGER" : "EMPLOYEE",
 requiresPasswordChange: true,
 },
 });
 }

 if (!employee) {
 employee = await prisma.employee.create({
 data: {
 employeeCode: finalEmpCode,
 name: empName,
 gender: gender,
 phone: phone,
 email: finalEmail,
 address: dbAddress,
 x: coords.x,
 y: coords.y,
 department: "Operations",
 shiftId: shift.id,
 status: employeeStatus,
 userId: user.id,
 },
 });
 } else {
 // Sync shift, status, and identifiers on subsequent imports
 employee = await prisma.employee.update({
 where: { id: employee.id },
 data: { 
 shiftId: shift.id,
 employeeCode: finalEmpCode,
 email: finalEmail,
 status: employeeStatus,
 address: dbAddress,
 x: coords.x,
 y: coords.y,
 userId: user.id,
 },
 });
 }

 importedEmployeesCount++;

 }


 }


 return NextResponse.json({
 success: true,
 message: `Roster import completed. Imported ${importedEmployeesCount} employee records and ${importedCabsCount} cab profiles.`,
 date: dateStr,
 shiftId: firstShiftId,
 outlierCount: outlierEmployees.length,
 outlierList: outlierEmployees,
 });
 } catch (e) {
 console.error("Failed Excel import:", e);
 return NextResponse.json({ error: "Import failed due to spreadsheet layout or server error" }, { status: 500 });
 }
}

// DELETE: Reset database — clears all DB records and deletes the uploaded roster.xlsx file
export async function DELETE() {
 try {
 const auth = await requireApiRole(["ADMIN"]);
 if (auth.response) return auth.response;

 await prisma.$transaction([
 prisma.violation.deleteMany(),
 prisma.routeStop.deleteMany(),
 prisma.route.deleteMany(),
 prisma.employee.deleteMany(),
 prisma.cab.deleteMany(),
 prisma.shift.deleteMany(),
 ]);

 const filePath = path.join(process.cwd(), "roster.xlsx");
 if (fs.existsSync(filePath)) {
 fs.unlinkSync(filePath);
 }

 return NextResponse.json({
 success: true,
 message: "Database has been reset and the uploaded roster file has been deleted."
 });
 } catch (e) {
 console.error("Failed resetting database:", e);
 return NextResponse.json({ error: "Reset database failed" }, { status: 500 });
 }
}
