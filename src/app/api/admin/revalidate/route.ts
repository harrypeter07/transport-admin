import { NextResponse } from "next/server";
import { invalidateAllCache } from "@/lib/cache";
import { verifySession } from "@/lib/dal";

export async function POST() {
  try {
    const session = await verifySession();
    if (session.role !== "ADMIN" && session.role !== "MANAGER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    invalidateAllCache();
    return NextResponse.json({ success: true, message: "All caches invalidated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
