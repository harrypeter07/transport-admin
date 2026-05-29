import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/session";

/**
 * verifySession — memoized per-request session check.
 * Redirects to /login if session is missing or invalid.
 */
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }
  return session;
});

/**
 * getOptionalSession — returns session or null without redirecting.
 * Useful in layouts that render conditionally.
 */
export const getOptionalSession = cache(
  async (): Promise<SessionPayload | null> => {
    return getSession();
  }
);

/**
 * requireRole — verifies session and checks that the user has the required role.
 * Redirects to /forbidden if the role does not match.
 */
export async function requireRole(
  allowedRoles: string[]
): Promise<SessionPayload> {
  const session = await verifySession();
  if (!allowedRoles.includes(session.role)) {
    redirect("/forbidden");
  }
  return session;
}
