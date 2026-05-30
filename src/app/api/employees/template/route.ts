import { NextResponse } from "next/server";
import { generateExcelTemplate } from "@/lib/excelParser";
import { requireApiRole } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    const buffer = generateExcelTemplate();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=Transit_Admin_Example_Roster.xlsx",
      },
    });
  } catch (e) {
    console.error("Template generation error:", e);
    return NextResponse.json({ error: "Failed to download template" }, { status: 500 });
  }
}
