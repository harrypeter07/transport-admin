import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import fs from "fs";
import path from "path";

const EXCEL_ROUTES_PATH = path.join(process.cwd(), "data", "excel_routes.json");

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    // Read from the static master baseline JSON (one-time parsed from Roster.xlsx)
    if (!fs.existsSync(EXCEL_ROUTES_PATH)) {
      return NextResponse.json({
        routes: [],
        totalRoutes: 0,
        placeholder: false,
        availableDates: [],
        skippedRows: 0,
        skippedStops: 0,
        generatedAt: new Date().toISOString(),
        message: "No Excel baseline loaded. Run scripts/parse-excel-routes.js to generate.",
      });
    }

    const raw = fs.readFileSync(EXCEL_ROUTES_PATH, "utf-8");
    const routes = JSON.parse(raw);

    return NextResponse.json({
      routes,
      totalRoutes: routes.length,
      placeholder: false,
      availableDates: [],
      skippedRows: 0,
      skippedStops: 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[api] ❌ GET /api/optimization/excel-routes", e);
    return NextResponse.json(
      {
        error: "Failed to load Excel routes",
        details: e.message,
        stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
      },
      { status: 500 }
    );
  }
}
