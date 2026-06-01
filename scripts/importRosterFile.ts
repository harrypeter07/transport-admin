import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import xlsx from "xlsx";

const prisma = new PrismaClient();

type Point = { x: number; y: number };

type ParsedRow = {
  rowNumber: number;
  email: string;
  name: string;
  employeeCode: string;
  address: string;
  pickupPoint: string;
  shiftTime: string;
  pickupTime: string;
  status: string;
  gender: "MALE" | "FEMALE";
  blockIndex: number;
};

type ParsedBlock = {
  index: number;
  rows: any[][];
  employees: ParsedRow[];
};

function formatExcelTime(value: unknown): string {
  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const text = String(value || "").trim();
  if (!text) return "";
  return text;
}

function slugify(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function nameFromEmail(email: string, fallback: string): string {
  if (!email.includes("@")) return fallback;
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseDriverDetails(values: unknown[], fallbackIndex: number) {
  let vehicleNumber = "";
  let driverName = "";
  let driverPhone = "";

  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;

    const vehicleMatch = value.match(/MH\s?\d{2}\s?[A-Z]{1,2}\s?\d{4}/i);
    const phoneMatch = value.match(/\d{10}/);

    if (!vehicleNumber && vehicleMatch) {
      vehicleNumber = vehicleMatch[0].toUpperCase().replace(/\s+/g, "");
      continue;
    }

    if (!driverPhone && phoneMatch) {
      driverPhone = phoneMatch[0];
    }

    if (!driverName && /driver|drver/i.test(value)) {
      driverName = value.replace(/(driver|drver)\s*[-:=]?\s*/i, "").trim();
    }
  }

  return {
    vehicleNumber: vehicleNumber || `CAB-ROSTER-${String(fallbackIndex).padStart(2, "0")}`,
    driverName: driverName || `Roster Driver ${fallbackIndex}`,
    driverPhone: driverPhone || "+91 99000 00000",
  };
}

function deterministicPoint(label: string, depot: Point): Point {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }

  const angle = (hash % 360) * (Math.PI / 180);
  const radius = 0.01 + ((hash % 4500) / 100000);

  return {
    x: Math.round((depot.x + Math.cos(angle) * radius) * 1000000) / 1000000,
    y: Math.round((depot.y + Math.sin(angle) * radius) * 1000000) / 1000000,
  };
}

function parseWorkbook(filePath: string): { blocks: ParsedBlock[]; employees: ParsedRow[] } {
  const workbook = xlsx.readFile(filePath);
  const rows = xlsx.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1,
    defval: "",
  });

  const blocks: ParsedBlock[] = [];
  let currentBlock: ParsedBlock | null = null;
  const usedCodes = new Set<string>();
  const usedEmails = new Set<string>();

  rows.forEach((row, rowIndex) => {
    const firstCell = String(row[0] || "").trim().toLowerCase();
    const isHeader = firstCell === "e mail id";

    if (isHeader) {
      currentBlock = { index: blocks.length + 1, rows: [], employees: [] };
      blocks.push(currentBlock);
      return;
    }

    if (!currentBlock) return;
    currentBlock.rows.push(row);

    const rawEmail = String(row[0] || "").trim();
    const address = String(row[1] || "").trim();
    const pickupPoint = String(row[3] || "").trim();
    const shiftTime = formatExcelTime(row[2]);
    const lowerIdentity = `${rawEmail} ${address} ${pickupPoint}`.toLowerCase();

    if (!address || !pickupPoint || !shiftTime || lowerIdentity.includes("escort")) return;

    const emailBase = rawEmail.includes("@") ? rawEmail.toLowerCase() : "";
    const fallbackName = `Roster Employee ${rowIndex + 1}`;
    const name = nameFromEmail(emailBase, fallbackName);
    const codeBase = emailBase ? slugify(emailBase.split("@")[0]) : `ROSTER-${rowIndex + 1}`;
    let employeeCode = codeBase || `ROSTER-${rowIndex + 1}`;
    let email = emailBase || `${employeeCode.toLowerCase()}@import.local`;
    let suffix = 2;

    while (usedCodes.has(employeeCode)) {
      employeeCode = `${codeBase}-${suffix}`;
      suffix += 1;
    }

    suffix = 2;
    while (usedEmails.has(email)) {
      email = `${employeeCode.toLowerCase()}-${suffix}@import.local`;
      suffix += 1;
    }

    usedCodes.add(employeeCode);
    usedEmails.add(email);

    const statusText = String(row[5] || "").trim().toUpperCase();
    const parsed: ParsedRow = {
      rowNumber: rowIndex + 1,
      email,
      name,
      employeeCode,
      address,
      pickupPoint,
      shiftTime,
      pickupTime: formatExcelTime(row[4]),
      status: statusText === "NO SHOW" ? "INACTIVE" : "ACTIVE",
      gender: String(row[7] || "").trim().toUpperCase().startsWith("F") ? "FEMALE" : "MALE",
      blockIndex: currentBlock.index,
    };

    currentBlock.employees.push(parsed);
  });

  return {
    blocks: blocks.filter((block) => block.rows.length > 0 || block.employees.length > 0),
    employees: blocks.flatMap((block) => block.employees),
  };
}

async function main() {
  const fileArg = process.argv.slice(2).join(" ") || "roster demo.xlsx";
  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Roster file not found: ${filePath}`);
  }

  const { blocks, employees } = parseWorkbook(filePath);
  if (employees.length === 0) {
    throw new Error("No roster employees found in workbook.");
  }

  const settings = await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const depot = { x: settings.defaultDepotLng, y: settings.defaultDepotLat };
  const defaultPassword = await bcrypt.hash("Welcome@123", 10);

  const shiftsByTime = new Map<string, string>();
  for (const shiftTime of [...new Set(employees.map((row) => row.shiftTime))].sort()) {
    const shift = await prisma.shift.upsert({
      where: { id: `shift-${shiftTime.replace(/[^0-9]/g, "")}` },
      update: {
        name: `${shiftTime} Shift`,
        startTime: shiftTime,
        endTime: shiftTime,
      },
      create: {
        id: `shift-${shiftTime.replace(/[^0-9]/g, "")}`,
        name: `${shiftTime} Shift`,
        startTime: shiftTime,
        endTime: shiftTime,
      },
    });
    shiftsByTime.set(shiftTime, shift.id);
  }

  const addressCache = new Map<string, { x: number; y: number }>();
  let activeEmployees = 0;
  let inactiveEmployees = 0;

  for (const employee of employees) {
    const user = await prisma.user.upsert({
      where: { email: employee.email },
      update: {
        name: employee.name,
        role: "EMPLOYEE",
        isActive: true,
      },
      create: {
        email: employee.email,
        name: employee.name,
        password: defaultPassword,
        role: "EMPLOYEE",
        requiresPasswordChange: true,
      },
    });

    const geocodeKey = employee.pickupPoint.toLowerCase();
    let coords = addressCache.get(geocodeKey);
    if (!coords) {
      coords = deterministicPoint(employee.pickupPoint, depot);
      addressCache.set(geocodeKey, coords);
    }

    const shiftId = shiftsByTime.get(employee.shiftTime) || null;
    await prisma.employee.upsert({
      where: { employeeCode: employee.employeeCode },
      update: {
        userId: user.id,
        name: employee.name,
        gender: employee.gender,
        phone: "+91 99000 00000",
        email: employee.email,
        address: employee.pickupPoint === employee.address ? employee.address : `${employee.pickupPoint} | ${employee.address}`,
        x: coords.x,
        y: coords.y,
        department: "Operations",
        designation: "Engineer",
        shiftId,
        status: employee.status,
      },
      create: {
        userId: user.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        gender: employee.gender,
        phone: "+91 99000 00000",
        email: employee.email,
        address: employee.pickupPoint === employee.address ? employee.address : `${employee.pickupPoint} | ${employee.address}`,
        x: coords.x,
        y: coords.y,
        department: "Operations",
        designation: "Engineer",
        shiftId,
        status: employee.status,
      },
    });

    if (employee.status === "ACTIVE") activeEmployees += 1;
    else inactiveEmployees += 1;
  }

  let cabCount = 0;
  for (const block of blocks) {
    const driverCells = block.rows.flatMap((row) => [row[6], row[9]]).filter(Boolean);
    const details = parseDriverDetails(driverCells, block.index);
    const blockShiftIds = [...new Set(block.employees.map((employee) => shiftsByTime.get(employee.shiftTime)).filter(Boolean))] as string[];
    const capacityFromSheet = Math.max(
      ...block.rows.map((row) => Number(row[10]) || 0),
      block.employees.filter((employee) => employee.status === "ACTIVE").length,
      4
    );

    await prisma.cab.upsert({
      where: { vehicleNumber: details.vehicleNumber },
      update: {
        capacity: capacityFromSheet,
        vendor: "Roster Import",
        status: "AVAILABLE",
        driverName: details.driverName,
        driverPhone: details.driverPhone,
        shifts: {
          connect: blockShiftIds.map((id) => ({ id })),
        },
      },
      create: {
        vehicleNumber: details.vehicleNumber,
        capacity: capacityFromSheet,
        vendor: "Roster Import",
        status: "AVAILABLE",
        driverName: details.driverName,
        driverPhone: details.driverPhone,
        licenseNumber: `DL-ROSTER-${String(block.index).padStart(3, "0")}`,
        shifts: {
          connect: blockShiftIds.map((id) => ({ id })),
        },
      },
    });
    cabCount += 1;
  }

  fs.copyFileSync(filePath, path.join(process.cwd(), "roster.xlsx"));
  const uniqueCabCount = await prisma.cab.count();

  console.log("Roster import completed.");
  console.log(`Employees: ${employees.length} (${activeEmployees} active, ${inactiveEmployees} inactive)`);
  console.log(`Shifts: ${shiftsByTime.size}`);
  console.log(`Cab blocks: ${cabCount}`);
  console.log(`Unique cabs: ${uniqueCabCount}`);
}

main()
  .catch((error) => {
    console.error("Roster import failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
