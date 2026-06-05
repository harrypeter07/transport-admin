import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiRole } from "@/lib/apiAuth";
import { verifySession } from "@/lib/dal";
import { audit } from "@/lib/audit";

function reqIp(req: NextRequest | Request): string {
  if (req instanceof NextRequest) {
    return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  }
  return (req as any).headers?.get?.("x-forwarded-for") || (req as any).headers?.get?.("x-real-ip") || "unknown";
}

const DEFAULT_SETTINGS = {
 id: "default",
 leaveApprovalRequired: true,
 timingChangeApprovalRequired: true,
 defaultCity: "Nagpur",
 defaultCountry: "India",
 defaultDepotLat: 21.0625,
 defaultDepotLng: 79.0526,
 depotName: "MIHAN Depot",
 maxPickupRadiusKm: 70,
 currencySymbol: "₹",
 fuelPricePerLitre: 100.0,
 avgFuelMileageKmL: 10.0,
};

// GET — fetch system settings (ADMIN or MANAGER)
export async function GET(req: NextRequest) {
	const ip = reqIp(req);
	try {
	const session = await verifySession();
	if (session.role !== "ADMIN" && session.role !== "MANAGER") {
	return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Upsert ensures defaults always exist on first read
	const settings = await prisma.systemSettings.upsert({
	where: { id: "default" },
	update: {},
	create: DEFAULT_SETTINGS,
	});

	return NextResponse.json(settings);
	} catch (e) {
	console.error("[api] ❌ GET /api/settings", { ip }, e);
	return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
	}
}

// PATCH — update system settings (ADMIN only)
export async function PATCH(req: NextRequest) {
	const ip = reqIp(req);
	try {
	const auth = await requireApiRole(["ADMIN"]);
	if (auth.response) return auth.response;

	const body = await req.json();

	// Whitelist allowed fields to prevent malicious updates
	const allowed = [
	"leaveApprovalRequired",
	"timingChangeApprovalRequired",
	"defaultCity",
	"defaultCountry",
	"defaultDepotLat",
	"defaultDepotLng",
	 "depotName",
	 "depotPlaceId",
	 "depotFormattedAddress",
	 "maxPickupRadiusKm",
	"currencySymbol",
	"fuelPricePerLitre",
	"avgFuelMileageKmL",
	"maxRouteDistanceKm",
	"maxRouteDurationMin",
	"maxClusterRadiusKm",
	"maxEmployeeDetourKm",
	];

	const data: Record<string, any> = {};
	for (const key of allowed) {
	if (body[key] !== undefined) {
	data[key] = body[key];
	}
	}

	if (Object.keys(data).length === 0) {
	return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
	}

	const before = await prisma.systemSettings.findUnique({ where: { id: "default" } });
	const settings = await prisma.systemSettings.upsert({
	where: { id: "default" },
	update: data,
	create: { ...DEFAULT_SETTINGS, ...data },
	});

	await audit({ userId: auth.session.userId, role: auth.session.role, action: "UPDATE", entity: "SystemSettings", before, after: { data }, ip });
	console.info("[api] ✅ PATCH /api/settings", { userId: auth.session.userId, ip });

	return NextResponse.json(settings);
	} catch (e) {
	console.error("[api] ❌ PATCH /api/settings", { ip }, e);
	return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
	}
}
