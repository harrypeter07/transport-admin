import "server-only";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";

export async function requireApiRole(allowedRoles: string[]) {
  const session = await verifySession();

  if (!allowedRoles.includes(session.role)) {
    return {
      session,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { session, response: null };
}
