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
    // Map headers flexibly — supports real roster.xlsx columns AND generic variants
    // Use ?? (nullish coalescing) so numeric 0 values are preserved correctly
    const rawCode = row["Emp ID"] ?? row["Employee Code"] ?? row["Code"] ?? row["ID"] ?? "";
    const employeeCode = String(rawCode).trim();

    const name = String(row["Name"] ?? row["Employee Name"] ?? "").trim();

    // Real roster uses "M/F"; also support "Gender" / "Sex"
    const genderRaw = String(row["M/F"] ?? row["Gender"] ?? row["Sex"] ?? "M").toUpperCase().trim();
    const gender: "MALE" | "FEMALE" = genderRaw.startsWith("F") ? "FEMALE" : "MALE";

    // Real roster uses "Contact No"; also support "Phone" / "Mobile" / "Contact"
    const phone = String(row["Contact No"] ?? row["Phone"] ?? row["Mobile"] ?? row["Contact"] ?? "").trim();

    // Real roster uses "E mail ID"; also support "Email"
    const email = String(row["E mail ID"] ?? row["Email"] ?? "").trim();

    const address = String(row["Address"] ?? row["Location"] ?? "Nagpur").trim();

    // Parse coordinates — real roster has no X/Y columns
    // x = longitude (~79.xx for Nagpur), y = latitude (~21.xx for Nagpur)
    const rawX = row["X"] !== undefined ? parseFloat(row["X"]) : NaN;
    const rawY = row["Y"] !== undefined ? parseFloat(row["Y"]) : NaN;

    // Fallback: random coords within Nagpur bounds (lng 79.00–79.20, lat 21.04–21.22)
    const xVal = !isNaN(rawX) ? rawX : Math.round((79.00 + Math.random() * 0.20) * 10000) / 10000;
    const yVal = !isNaN(rawY) ? rawY : Math.round((21.04 + Math.random() * 0.18) * 10000) / 10000;

    // Real roster has no Department column — default to Operations
    const department = String(row["Department"] ?? row["Dept"] ?? "Operations").trim();

    if (employeeCode && name) {
      const finalPhone = phone || "+91 99000 00000";
      // Deterministic email fallback: code + last-4 digits of phone to avoid collisions
      const phoneDigits = finalPhone.replace(/\D/g, "").slice(-4) || "0000";
      const finalEmail = email || `${employeeCode.toLowerCase().replace(/[^a-z0-9]/g, "")}.${phoneDigits}@corporate.com`;

      parsedRows.push({
        employeeCode,
        name,
        gender,
        phone: finalPhone,
        email: finalEmail,
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
      "Emp ID": "EMP101",
      Name: "Aman Sharma",
      "M/F": "MALE",
      "Contact No": "+91 99000 22001",
      "E mail ID": "aman.s@corporate.com",
      Address: "Dharampeth, Nagpur",
      Department: "Engineering",
    },
    {
      "Emp ID": "EMP102",
      Name: "Neha Patil",
      "M/F": "FEMALE",
      "Contact No": "+91 99000 22002",
      "E mail ID": "neha.p@corporate.com",
      Address: "Manish Nagar, Nagpur",
      Department: "Operations",
    },
    {
      "Emp ID": "EMP103",
      Name: "Priya Deshmukh",
      "M/F": "FEMALE",
      "Contact No": "+91 99000 22003",
      "E mail ID": "priya.d@corporate.com",
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
