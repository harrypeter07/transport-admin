export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

export async function POST(req: Request) {
	const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
	try {
	const auth = await requireApiRole(["ADMIN", "MANAGER"]);
	if (auth.response) return auth.response;

	const body = await req.json();
	const { date, shiftId, isManual } = body;

	if (!date) {
	return NextResponse.json({ error: "Date is required" }, { status: 400 });
	}

	const PROTECTED_SHIFTS = ["shift-0800"];
	if (shiftId && PROTECTED_SHIFTS.includes(shiftId)) {
	return NextResponse.json({ error: "8:00 AM shift routes are protected and cannot be modified by publishing. Use 'Rebuild 8:00 AM Baseline' to update these routes." }, { status: 403 });
	}

	// MANUAL ROUTING BYPASS
	if (isManual) {
		await audit({ userId: auth.session.userId, role: auth.session.role, action: "PUBLISH", entity: "ManualManifest", after: { date, shiftId }, ip });
		return NextResponse.json({ success: true, count: 0, notifications: 0, message: "Manual manifest published via snapshot" });
	}

	// Find all routes that should be published or re-published
	const routesToUpdate = await prisma.route.findMany({
	where: {
	date,
	...(shiftId ? { shiftId } : {}),
	status: { in: ["PLANNED", "PENDING", "ASSIGNED"] }
	},
	select: { id: true }
	});

	const routeIds = routesToUpdate.map(r => r.id);

	if (routeIds.length === 0) {
	return NextResponse.json({ error: "No pending or assigned routes found to publish for the selected date." }, { status: 400 });
	}

	const blockingViolations = await prisma.violation.findMany({
	where: {
	  routeId: { in: routeIds },
	  resolved: false,
	  OR: [
	    { type: "ISOLATED_FEMALE_NIGHT" },
	    { severity: "HIGH" },
	  ],
	},
	select: {
	  id: true,
	  routeId: true,
	  type: true,
	  severity: true,
	  notes: true,
	},
	});

	if (blockingViolations.length > 0) {
	return NextResponse.json(
	  {
	    error: "SAFETY_BLOCK",
	    message: "Resolve all high-severity safety violations before publishing",
	    violations: blockingViolations,
	  },
	  { status: 400 }
	);
	}

	// Update Routes to ASSIGNED (safe to apply to already ASSIGNED ones)
	await prisma.route.updateMany({
	where: { id: { in: routeIds } },
	data: { status: "ASSIGNED" }
	});

	// Fetch published routes with stops to send notifications
	const publishedRoutes = await prisma.route.findMany({
	where: { id: { in: routeIds } },
	include: {
	cab: { select: { userId: true, driverName: true } },
	stops: { include: { employee: { select: { userId: true, name: true } } } }
	}
	});

	const notifiedUsers = new Set<string>();
	const notificationPromises: Promise<any>[] = [];

	for (const route of publishedRoutes) {
	// Notify driver
	if (route.cab?.userId && !notifiedUsers.has(route.cab.userId)) {
	notifiedUsers.add(route.cab.userId);
	notificationPromises.push(
	createNotification(
	route.cab.userId,
	"New Route Assigned",
	`A new route has been assigned to you on ${date} (${route.cab.driverName || "Vehicle " + route.id}). Please check your dashboard.`,
	"ROUTE",
	"/dashboard/driver"
	)
	);
	}

	// Notify employees on this route
	for (const stop of route.stops) {
	if (stop.employee?.userId && !notifiedUsers.has(stop.employee.userId)) {
	notifiedUsers.add(stop.employee.userId);
	notificationPromises.push(
	createNotification(
	stop.employee.userId,
	"New Route Published",
	`Your commute route for ${date} has been published. Please check your dashboard for pickup details.`,
	"ROUTE",
	"/dashboard/employee"
	)
	);
	}
	}
	}

	await Promise.all(notificationPromises);

	await audit({ userId: auth.session.userId, role: auth.session.role, action: "PUBLISH", entity: "Route", after: { count: routeIds.length, date, shiftId, notifications: notifiedUsers.size }, ip });
	console.info("[api] ✅ POST /api/optimization/publish", { count: routeIds.length, userId: auth.session.userId, ip });

	return NextResponse.json({ success: true, count: routeIds.length, notifications: notifiedUsers.size });
	} catch (error: any) {
	console.error("[api] ❌ POST /api/optimization/publish", { ip }, error);
	return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
