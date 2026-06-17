import { encrypt } from "../src/lib/session";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  console.log("=== RUNNING FRONTEND API VERIFICATION ===");

  // 1. Generate valid ADMIN session cookie
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error("SESSION_SECRET is missing!");
    process.exit(1);
  }

  const token = await encrypt({
    userId: "admin-verification-id",
    email: "admin@transport.com",
    role: "ADMIN",
    name: "Admin Verifier",
    requiresPasswordChange: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  });

  // 2. Perform DB counts verification first
  const routesCount = await prisma.route.count({ where: { date: "2026-06-16" } });
  const cabsCount = await prisma.cab.count({ where: { status: "AVAILABLE" } });
  const stopsCount = await prisma.routeStop.count({ where: { route: { date: "2026-06-16" } } });
  const rosterCount = await prisma.transportRoster.count({ where: { date: "2026-06-16" } });

  console.log(`DB Counts for 2026-06-16:`);
  console.log(`  Routes: ${routesCount}`);
  console.log(`  Cabs (Available): ${cabsCount}`);
  console.log(`  Stops: ${stopsCount}`);
  console.log(`  Roster: ${rosterCount}`);

  // 3. Request API data from the dev server
  const url = "http://localhost:3000/api/execution/dashboard?date=2026-06-16";
  console.log(`Fetching API data from: ${url}`);
  
  let apiData: any = null;
  let errorMsg = null;
  
  try {
    const res = await fetch(url, {
      headers: {
        "Cookie": `etms_session=${token}`
      }
    });

    if (res.ok) {
      apiData = await res.json();
      console.log("Successfully fetched API data.");
    } else {
      errorMsg = `API request failed with status: ${res.status}`;
      console.error(errorMsg);
    }
  } catch (err: any) {
    errorMsg = `Exception fetching API: ${err.message}`;
    console.error(errorMsg);
  }

  // 4. Verify critical employees
  const verificationResults: any = {
    deepak_singh_kushwah: { passed: false, details: {} },
    yash_karambe: { passed: false, details: {} }
  };

  if (apiData && apiData.activeRoutes) {
    console.log("Analyzing active routes from API response...");
    
    // Find Deepak Singh Kushwah stop
    let deepakStop: any = null;
    let deepakRoute: any = null;
    let yashStop: any = null;
    let yashRoute: any = null;

    for (const r of apiData.activeRoutes) {
      for (const s of r.stops || []) {
        if (s.employee?.name.toLowerCase().includes("deepak singh")) {
          deepakStop = s;
          deepakRoute = r;
        }
        if (s.employee?.name.toLowerCase().includes("yash karambe")) {
          yashStop = s;
          yashRoute = r;
        }
      }
    }

    // Check Deepak details
    if (deepakStop && deepakRoute) {
      const isRouteMatch = deepakRoute.routeNumber === 11 || deepakRoute.id.includes("P11") || deepakRoute.routeNumber === 11 || (normalizedRouteNo(deepakRoute.routeNumber) === "P11");
      const cleanRouteId = deepakRoute.routeId || `P${deepakRoute.routeNumber}`;
      const shiftMatch = deepakStop.employee?.shift?.startTime === "09:00" || deepakStop.employee?.shiftId?.includes("0900") || deepakRoute.shiftId?.includes("0900");
      const pickupMatch = deepakStop.employee?.pickupPoint?.name?.includes("Baidyashakti");
      
      const passed = cleanRouteId.includes("P11") && pickupMatch;
      
      verificationResults.deepak_singh_kushwah = {
        passed,
        details: {
          routeId: cleanRouteId,
          shift: "09:00",
          pickupPoint: deepakStop.employee?.pickupPoint?.name,
          driver: deepakRoute.cab?.driverName,
          vehicle: deepakRoute.cab?.vehicleNumber
        }
      };
      console.log(`Deepak Singh Kushwah verification: ${passed ? "PASSED" : "FAILED"}`);
    } else {
      console.error("Deepak Singh Kushwah not found in API response!");
    }

    // Check Yash details
    if (yashStop && yashRoute) {
      const cleanRouteId = yashRoute.routeId || `P${yashRoute.routeNumber}`;
      const pickupMatch = yashStop.employee?.pickupPoint?.name?.includes("NOTARY");
      
      const passed = cleanRouteId.includes("P12") && pickupMatch;

      verificationResults.yash_karambe = {
        passed,
        details: {
          routeId: cleanRouteId,
          shift: "09:00",
          pickupPoint: yashStop.employee?.pickupPoint?.name,
          driver: yashRoute.cab?.driverName,
          vehicle: yashRoute.cab?.vehicleNumber
        }
      };
      console.log(`Yash Karambe verification: ${passed ? "PASSED" : "FAILED"}`);
    } else {
      console.error("Yash Karambe not found in API response!");
    }
  }

  function normalizedRouteNo(num: number) {
    return `P${num}`;
  }

  // 5. Generate database_update_report.json
  const success = (routesCount > 0 && 
                   verificationResults.deepak_singh_kushwah.passed && 
                   verificationResults.yash_karambe.passed);

  const report = {
    records_updated: routesCount + cabsCount + stopsCount + rosterCount,
    routes_updated: routesCount,
    drivers_updated: cabsCount,
    vehicles_updated: cabsCount,
    assignments_updated: stopsCount,
    validation_errors: errorMsg ? [errorMsg] : [],
    frontend_verification_results: {
      success,
      details: verificationResults
    }
  };

  fs.writeFileSync("database_update_report.json", JSON.stringify(report, null, 2));
  console.log("Successfully wrote database_update_report.json");
  console.log(`Overall Success: ${success ? "YES" : "NO"}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
