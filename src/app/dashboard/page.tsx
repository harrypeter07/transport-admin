import { verifySession } from "@/lib/dal";
import { redirect } from "next/navigation";

export default async function DashboardRoot() {
  const session = await verifySession();

  // Fallback routing in case proxy didn't catch it
  switch (session.role) {
    case "ADMIN":
      redirect("/dashboard/admin");
    case "MANAGER":
      redirect("/dashboard/manager");
    case "EMPLOYEE":
      redirect("/dashboard/employee");
    case "DRIVER":
      redirect("/dashboard/driver");
    default:
      redirect("/login");
  }
}
