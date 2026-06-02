import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
	const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
	try {
	const auth = await requireApiRole(["ADMIN", "MANAGER"]);
	if (auth.response) return auth.response;

	const body = await req.json();
	const { date, shiftId } = body;

	if (!date) {
	return NextResponse.json({ error: "Date is required" }, { status: 400 });
	}

	// Find all PENDING or PLANNED routes for the given date and shift
	const routesToUpdate = await prisma.route.findMany({
	where: {
	date,
	...(shiftId ? { shiftId } : {}),
	status: { in: ["PENDING", "PLANNED"] }
	},
	select: { id: true }
	});

	const routeIds = routesToUpdate.map(r => r.id);

	if (routeIds.length === 0) {
	return NextResponse.json({ success: true, message: "No pending routes found to publish." });
	}

	// Update Routes to ASSIGNED
	await prisma.route.updateMany({
	where: { id: { in: routeIds } },
	data: { status: "ASSIGNED" }
	});

	await audit({ userId: auth.session.userId, role: auth.session.role, action: "PUBLISH", entity: "Route", after: { count: routeIds.length, date, shiftId }, ip });
	console.info("[api] ✅ POST /api/optimization/publish", { count: routeIds.length, userId: auth.session.userId, ip });

	return NextResponse.json({ success: true, count: routeIds.length });
	} catch (error: any) {
	console.error("[api] ❌ POST /api/optimization/publish", { ip }, error);
	return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
