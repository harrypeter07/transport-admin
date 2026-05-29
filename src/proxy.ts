import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/session";

// Paths that do NOT require authentication
const PUBLIC_PATHS = ["/login", "/forbidden", "/change-password", "/forgot-password", "/reset-password"];

// Role → dashboard home path
const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN: "/dashboard/admin",
  MANAGER: "/dashboard/manager",
  EMPLOYEE: "/dashboard/employee",
  DRIVER: "/dashboard/driver",
};

// Which role prefixes are allowed per role
const ROLE_ALLOWED_PREFIX: Record<string, string> = {
  ADMIN: "/dashboard",      // ADMIN can access all dashboard routes
  MANAGER: "/dashboard/manager",
  EMPLOYEE: "/dashboard/employee",
  DRIVER: "/dashboard/driver",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and Next.js internals through without checks
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Attempt to read and decrypt session cookie
  const token = request.cookies.get("etms_session")?.value;
  const session = await decrypt(token);

  // ── Unauthenticated ──────────────────────────────────────────────────────────
  if (!session?.userId) {
    // API routes: return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Protected page routes: redirect to login
    if (pathname.startsWith("/dashboard") || pathname === "/") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // ── Authenticated ────────────────────────────────────────────────────────────

  // Forced password change interception
  if (session.requiresPasswordChange && !pathname.startsWith("/api/auth")) {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  // If landing on /login or / while authenticated → redirect to their dashboard
  if (pathname === "/login" || pathname === "/") {
    const home = ROLE_DASHBOARD[session.role] ?? "/dashboard";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // If landing on root /dashboard → redirect to role-specific home
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    const home = ROLE_DASHBOARD[session.role] ?? "/dashboard";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Role-level path enforcement for dashboard routes
  if (pathname.startsWith("/dashboard/")) {
    const role = session.role;
    const allowedPrefix = ROLE_ALLOWED_PREFIX[role];

    // ADMIN bypasses sub-path checks
    if (role !== "ADMIN" && allowedPrefix && !pathname.startsWith(allowedPrefix)) {
      return NextResponse.redirect(new URL("/forbidden", request.url));
    }
  }

  // Pass user identity downstream via request headers (available in Server Components)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.userId);
  requestHeaders.set("x-user-role", session.role);
  requestHeaders.set("x-user-email", session.email);
  requestHeaders.set("x-user-name", session.name);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Run proxy on all paths EXCEPT:
     * - _next/static (static bundles)
     * - _next/image  (image optimizer)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
