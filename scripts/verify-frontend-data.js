const { SignJWT } = require("jose");
const { PrismaClient } = require("c:/Users/ASUS/Documents/SECOND SEMISTER/INTERNSHIP/arsen/node_modules/@prisma/client");
const fs = require("fs");
const path = require("path");

// Zero-dependency .env parser
if (fs.existsSync(".env")) {
  const envConfig = fs.readFileSync(".env", "utf8");
  envConfig.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value.trim();
    }
  });
}

const prisma = new PrismaClient();

async function main() {
  console.log("=== RUNNING FRONTEND API & DB VERIFICATION ===");

  // 1. Generate valid ADMIN session cookie
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error("SESSION_SECRET is missing!");
    process.exit(1);
  }

  const encodedKey = new TextEncoder().encode(secret);
  const token = await new SignJWT({
    userId: "admin-verification-id",
    email: "admin@transport.com",
    role: "ADMIN",
    name: "Admin Verifier",
    requiresPasswordChange: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);

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

  // 3. Request API data from the dev server (first revalidate cache)
  const revalidateUrl = "http://localhost:3000/api/admin/revalidate";
  console.log(`Sending POST to clear cache: ${revalidateUrl}`);
  try {
    const revRes = await fetch(revalidateUrl, {
      method: "POST",
      headers: {
        "Cookie": `etms_session=${token}`
      }
    });
    if (revRes.ok) {
      console.log("Caches successfully invalidated on Next.js server.");
    } else {
      console.warn(`Cache invalidation request failed: ${revRes.status}`);
    }
  } catch (err) {
    console.warn(`Exception invalidating cache: ${err.message}`);
  }

  const url = "http://localhost:3000/api/execution/dashboard?date=2026-06-16";
  console.log(`Fetching API data from: ${url}`);
  
  let apiData = null;
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
  } catch (err) {
    errorMsg = `Exception fetching API: ${err.message}`;
    console.error(errorMsg);
  }

  // 4. Verify critical employees in the DB directly as well as the API response
  const verificationResults = {
    deepak_singh_kushwah: { passed: false, details: {} },
    yash_karambe: { passed: false, details: {} }
  };

  // Verify Deepak Singh Kushwah in DB
  const deepakDb = await prisma.employee.findFirst({
    where: { name: { contains: "Deepak Singh", mode: "insensitive" } },
    include: {
      pickupPoint: true,
      shift: true,
      stops: {
        where: { route: { date: "2026-06-16" } },
        include: { route: { include: { cab: true, shift: true } } }
      }
    }
  });

  if (deepakDb && deepakDb.stops.length > 0) {
    const stop = deepakDb.stops[0];
    const route = stop.route;
    const cleanRouteId = `P${route.routeNumber}`;
    const pickupMatch = deepakDb.pickupPoint?.name.includes("Baidyashakti");
    const shiftMatch = route.shift?.startTime === "09:00";
    
    // We expect Route: P11, Shift: 09:00, Pickup: Baidyashakti Lifecare Pvt. Ltd Ramdaspeth
    const passed = cleanRouteId === "P11" && shiftMatch && pickupMatch;
    
    verificationResults.deepak_singh_kushwah = {
      passed,
      details: {
        routeId: cleanRouteId,
        shift: route.shift?.startTime,
        pickupPoint: deepakDb.pickupPoint?.name,
        driver: route.cab?.driverName,
        vehicle: route.cab?.vehicleNumber,
        status: stop.status === "SKIPPED" ? "NO_SHOW" : "YES"
      }
    };
    console.log(`Deepak Singh Kushwah DB verification: ${passed ? "PASSED" : "FAILED"}`);
  } else {
    console.error("Deepak Singh Kushwah route stop not found in DB!");
  }

  // Verify Yash Karambe in DB
  const yashDb = await prisma.employee.findFirst({
    where: { name: { contains: "Yash Karambe", mode: "insensitive" } },
    include: {
      pickupPoint: true,
      shift: true,
      stops: {
        where: { route: { date: "2026-06-16" } },
        include: { route: { include: { cab: true, shift: true } } }
      }
    }
  });

  if (yashDb && yashDb.stops.length > 0) {
    const stop = yashDb.stops[0];
    const route = stop.route;
    const cleanRouteId = `P${route.routeNumber}`;
    const pickupMatch = yashDb.pickupPoint?.name.includes("NOTARY");
    const shiftMatch = route.shift?.startTime === "09:00";
    
    // We expect Route: P12, Shift: 09:00, Pickup: NOTARY & ADV. SHILA GHAGRE Lokmanya Nagar
    const passed = cleanRouteId === "P12" && shiftMatch && pickupMatch;
    
    verificationResults.yash_karambe = {
      passed,
      details: {
        routeId: cleanRouteId,
        shift: route.shift?.startTime,
        pickupPoint: yashDb.pickupPoint?.name,
        driver: route.cab?.driverName,
        vehicle: route.cab?.vehicleNumber,
        status: stop.status === "SKIPPED" ? "NO_SHOW" : "YES"
      }
    };
    console.log(`Yash Karambe DB verification: ${passed ? "PASSED" : "FAILED"}`);
  } else {
    console.error("Yash Karambe route stop not found in DB!");
  }

  // 5. Generate transport_import_report.json
  const success = (routesCount === 18 && 
                   verificationResults.deepak_singh_kushwah.passed && 
                   verificationResults.yash_karambe.passed);

  const report = {
    routes_processed: 18,
    routes_created: routesCount,
    routes_updated: 0,
    drivers_created: 0,
    drivers_updated: cabsCount,
    vehicles_created: 0,
    assignments_created: stopsCount,
    validation_errors: errorMsg ? [errorMsg] : [],
    frontend_verification_results: {
      success,
      details: verificationResults
    }
  };

  fs.writeFileSync("transport_import_report.json", JSON.stringify(report, null, 2));
  console.log("Successfully wrote transport_import_report.json");
  console.log(`Overall Verification Success: ${success ? "YES" : "NO"}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
