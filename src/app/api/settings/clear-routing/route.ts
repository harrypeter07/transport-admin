import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export async function DELETE() {
  try {
    const auth = await requireApiRole(["ADMIN"]);
    if (auth.response) return auth.response;

    // Delete in order to avoid foreign key issues (though Cascade usually handles it)
    await prisma.operationalEvent.deleteMany();
    await prisma.vehicleLocation.deleteMany();
    await prisma.routeDeviation.deleteMany();
    await prisma.violation.deleteMany();
    await prisma.optimizedRouteSnapshot.deleteMany();
    await prisma.baselineRoute.deleteMany();
    await prisma.routeStop.deleteMany();
    await prisma.route.deleteMany();

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        role: "ADMIN",
        action: "DELETE",
        entity: "Routing History",
        after: { message: "Cleared all routing and analytics history" }
      }
    });

    return NextResponse.json({ success: true, message: "Routing history cleared successfully" });
  } catch (error: any) {
    console.error("[api] ❌ DELETE /api/settings/clear-routing", error);
    return NextResponse.json(
      { error: "Failed to clear routing history", details: error.message },
      { status: 500 }
    );
  }
}
