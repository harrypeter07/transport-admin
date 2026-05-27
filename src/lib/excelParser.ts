import * as XLSX from "xlsx";
import { OptimizeEmployee } from "./optimization";

export interface ParsedEmployeeRow {
  employeeCode: string;
  name: string;
  gender: "MALE" | "FEMALE";
  phone: string;
  email: string;
  address: string;
  x?: number;
  y?: number;
  department: string;
}

export function parseExcelRoster(buffer: Buffer): ParsedEmployeeRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Parse rows as raw JSON array
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet);
  const parsedRows: ParsedEmployeeRow[] = [];

  for (const row of rawRows) {
    // Map headers flexibly (supporting multiple capitalization/naming conventions)
    const employeeCode = String(row["Employee Code"] || row["Code"] || row["ID"] || "").trim();
    const name = String(row["Name"] || row["Employee Name"] || "").trim();
    let genderStr = String(row["Gender"] || row["Sex"] || "MALE").toUpperCase().trim();
    let gender: "MALE" | "FEMALE" = "MALE";
    if (genderStr.startsWith("F") || genderStr === "FEMALE") {
      gender = "FEMALE";
    }

    const phone = String(row["Phone"] || row["Mobile"] || row["Contact"] || "").trim();
    const email = String(row["Email"] || "").trim();
    const address = String(row["Address"] || row["Location"] || "Unspecified address").trim();
    
    // Parse coordinates, default to random if missing
    let xVal = row["X"] !== undefined ? parseFloat(row["X"]) : undefined;
    let yVal = row["Y"] !== undefined ? parseFloat(row["Y"]) : undefined;

    // If coordinates are invalid, auto-generate them randomly in a range
    if (xVal === undefined || isNaN(xVal)) {
      xVal = Math.round((10 + Math.random() * 80) * 10) / 10;
    }
    if (yVal === undefined || isNaN(yVal)) {
      yVal = Math.round((10 + Math.random() * 80) * 10) / 10;
    }

    const department = String(row["Department"] || row["Dept"] || "Engineering").trim();

    if (employeeCode && name) {
      parsedRows.push({
        employeeCode,
        name,
        gender,
        phone: phone || "+91 99000 00000",
        email: email || `${employeeCode.toLowerCase()}@corporate.com`,
        address,
        x: xVal,
        y: yVal,
        department,
      });
    }
  }

  return parsedRows;
}

/**
 * Generates a mock Excel worksheet buffer for download
 */
export function generateExcelTemplate(): Buffer {
  const headers = [
    {
      "Employee Code": "EMP101",
      Name: "Aman Sharma",
      Gender: "MALE",
      Phone: "+91 99000 22001",
      Email: "aman.s@corporate.com",
      Address: "Dharampeth, Nagpur",
      Department: "Engineering",
    },
    {
      "Employee Code": "EMP102",
      Name: "Neha Patil",
      Gender: "FEMALE",
      Phone: "+91 99000 22002",
      Email: "neha.p@corporate.com",
      Address: "Manish Nagar, Nagpur",
      Department: "Operations",
    },
    {
      "Employee Code": "EMP103",
      Name: "Priya Deshmukh",
      Gender: "FEMALE",
      Phone: "+91 99000 22003",
      Email: "priya.d@corporate.com",
      Address: "Besa, Nagpur",
      Department: "Finance",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(headers);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Roster Template");
  
  // Write to a buffer
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}
