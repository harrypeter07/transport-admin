export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { listExcelSheets } from "@/lib/excelParser";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sheets = listExcelSheets(buffer);

    return NextResponse.json({ sheets });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api] ❌ POST /api/optimization/excel-routes/inspect", e);
    return NextResponse.json({ error: "Failed to inspect workbook", details: message }, { status: 500 });
  }
}
