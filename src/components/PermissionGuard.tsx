"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PermissionGuard({
  allowedRoles,
  children,
  fallback = null,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkRole() {
      // In a real implementation we might fetch /api/auth/session, 
      // but proxy.ts injects x-user-role in the headers to the server components.
      // For client components, it's easier to check a non-httpOnly cookie 
      // OR we just assume the layout / page already guards the route,
      // and this component is purely for hiding *elements* (like buttons) conditionally.
      //
      // For this ETMS implementation, we will fetch our session API.
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const session = await res.json();
          setIsAuthorized(allowedRoles.includes(session.role));
        } else {
          setIsAuthorized(false);
        }
      } catch {
        setIsAuthorized(false);
      }
    }
    checkRole();
  }, [allowedRoles]);

  if (isAuthorized === null) {
    return <span className="opacity-0">{children}</span>; // Hide until checked
  }

  return isAuthorized ? <>{children}</> : <>{fallback}</>;
}
