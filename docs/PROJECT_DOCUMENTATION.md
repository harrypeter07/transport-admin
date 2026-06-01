# Employee Transportation Management System Documentation

Last updated: 2026-06-01

## Active Migration Context: Google Maps Platform and Dynamic Cab Origin

The current migration goal is to keep the ETMS product behavior and deliverables intact while improving route quality by moving mapping, routing, distance, ETA, geocoding, and route geometry toward Google Maps Platform.

Current deliverables that must remain stable:

- Admin route optimization dashboard.
- Multi-shift pickup/drop optimization.
- Maximize Utilization, Minimize Time, and Balanced strategy previews.
- Apply selected strategy and publish to fleet.
- Commuter manifest cards after optimization/apply/publish.
- Driver, employee, manager, leave, calendar, ROI, analytics, and execution workflows.
- Current cab selection behavior in the manifest map.

Migration direction:

- Google Maps Platform should become the primary provider for geocoding, distance, duration, ETA, and route geometry.
- Existing business logic should not be replaced. The provider layer should change first; optimizer behavior should be preserved.
- OSRM, OpenStreetMap, Leaflet, and Haversine are legacy/transitional dependencies to be removed in phases once equivalent Google-backed behavior is verified.
- The app should remain buildable and usable during migration. Where Google configuration is missing or a Google request fails during the transition, existing degraded behavior can remain temporarily to avoid breaking demos.

Dynamic cab origin target:

- Route origin should be resolved from vehicle operational state, not hardcoded by trip number.
- First operational trip of a cab/driver/day usually starts from driver home.
- Later trips should start from the cab's current/last known operational location, commonly MIHAN Depot after a pickup route.
- End-of-day routing should support policy-based behavior: either return to driver home or return to office/depot, with ROI reflecting deadhead distance.

Recommended migration order:

1. Introduce a Google-first internal maps/routing service boundary.
2. Route all distance, duration, geometry, and geocoding calls through that boundary.
3. Add caching and operational vehicle state tables in a separate database migration.
4. Replace Leaflet map rendering with Google Maps JavaScript API.
5. Remove OSRM/OpenStreetMap/Haversine dependencies after parity verification.
I made no code changes and did not touch the database. Here is the planning review.

Current Assessment
The ETMS is already modular enough for this migration: business workflows live in API routes, Prisma models, Zustand store, and dashboard pages, while map rendering is mostly centralized through NagpurLeafletMap and RouteVisualizer.

Current routing stack is mixed:

UI map: Leaflet + OSM tiles.
Geometry: Google Directions first in some paths, OSRM fallback.
Optimization metrics: Google Distance Matrix in some flows, OSRM/Haversine elsewhere.
Tracking/analytics: still uses local straight-line distance in places.
Schema already has useful starting points: Cab.driverAddress, driverX, driverY, Route.tripSequence, Route.currentLat/currentLng, VehicleLocation, SystemSettings.defaultDepotLat/Lng.
The biggest architectural issue is not UI. It is that “distance” is not yet a single service boundary. It is scattered across optimization, analytics, execution, tracking, and route editing.

Dynamic Cab Origin Design
Do not model this as “trip 1 = home, trip 2 = office.” Model it as:

Vehicle Operational State -> Route Start Resolver -> Optimization Input

Recommended start resolver priority:

Active in-progress route location: latest VehicleLocation.
Completed previous route destination for same cab/date.
Explicit dispatcher override.
Driver home for first operational route of day.
Depot fallback only when no trusted operational location exists.
For first pickup trip:
Driver Home -> Employee Stops -> Depot

For subsequent same-day trips:
Current Vehicle Location, normally depot after the first pickup, then route proceeds from there.

For drop/end-of-day:

Option A: Office -> Employee Stops -> Driver Home
Option B: Office -> Employee Stops -> Office
Recommendation: support both, chosen by policy. Default to Option A only for the final route of the operational day when the same cab/driver has no later assigned trip. Otherwise use Option B or current-vehicle-location-based routing. This captures deadhead cost honestly without forcing the cab home too early.

Google Migration Strategy
Create one internal routing abstraction, for example conceptually:

MapsProvider

geocode address/place
autocomplete/place details
compute matrix
compute route geometry
compute route ETA
snap/validate coordinate if needed
Then implement only a Google provider. Remove direct calls to Leaflet, OSRM, OSM/Nominatim, and Haversine from business modules.

Preferred Google APIs:

Maps JavaScript API for rendering.
Places API for address selection and autocomplete.
Geocoding API for server-side batch/import geocoding.
Routes API computeRouteMatrix for optimization matrices.
Routes API computeRoutes for final route geometry and ETA.
Avoid legacy Distance Matrix/Directions for new architecture unless temporarily used during migration.
I recommend Routes API over Directions API as the long-term core because it has both route and matrix methods, supports modern routing options, traffic-aware durations, route polylines, and a cleaner migration path. Google documents computeRoutes and computeRouteMatrix as the two core Routes API methods, and matrix billing is per origin-destination element. Sources: Google Routes docs and billing docs. Routes API, Routes billing

Optimization Impact
Keep the current optimization modes, but replace their metric source.

Maximize Cab Utilization: cab filling logic remains. Distance/proximity comparisons should use cached Google road distance/time instead of Haversine.
Fastest Travel: should rank using Google duration, ideally traffic-aware for execution-day planning.
Balanced Mode: keep existing scoring formula, but feed it Google distance and duration.
Driver/Cab/Shift assignment: no conceptual rewrite needed. The input set changes from fixed depot origin to resolved vehicle origin.
Route sequencing: candidate stop order should be evaluated against a Google matrix. Persist selected route metrics from Google, not recalculated straight-line estimates.
Safety rules: unchanged. Female first/last/isolated rules are business constraints, not map logic.
Important: naive all-pairs matrix calculation can become expensive. The algorithm should request only candidate clusters/routes, cache aggressively, and avoid recomputing unchanged employee pairs.

Execution Impact
Route execution should store:

planned origin and destination,
actual start location,
latest vehicle location,
completed route end location,
route geometry polyline,
planned vs actual distance/duration.
Driver workflow should start a route from the actual current location. If the driver starts somewhere unexpected, mark it as an operational override, not a mapping failure.

Database Impact
Recommended new/changed data, not implementation yet:

CabOperationalState: cabId, date, currentLat, currentLng, source, lastUpdatedAt, state.
RouteOriginDestination: routeId, originType, originLat/Lng, destinationType, destinationLat/Lng.
TravelMetricCache: origin hash/placeId, destination hash/placeId, mode, distanceMeters, durationSeconds, trafficDurationSeconds, provider, expiresAt.
GeocodeCache: rawInput, normalizedInput, placeId, formattedAddress, lat/lng, confidence, provider.
RouteGeometryCache: waypoint signature, encodedPolyline, distance, duration, provider, expiresAt.
Add Google placeId to employee/cab/depot location records where possible.
Existing driverX/Y, currentLat/Lng, VehicleLocation, and tripSequence can be preserved but should not be the only source of truth.

UI Impact
Affected components/pages:

NagpurLeafletMap
RouteVisualizer
Admin transport optimization visualization
Driver route view
Employee route view
Manager monitoring
Execution dashboard/tracking
Cab and employee address autocomplete
Settings depot picker
Migration recommendation:

Replace Leaflet map component with a Google Maps component.
Use Google markers/advanced markers for depot, employees, cab current location, driver home.
Use Google route polylines from computeRoutes, not manually drawn straight lines.
Keep dashboard business UI intact; only swap the map adapter.
ROI Impact
ROI should include:

first-trip driver-home-to-first-stop distance,
depot-to-driver-home or final-stop-to-driver-home if end-of-day home return is selected,
deadhead/repositioning distance,
actual vs planned distance,
route cancellation/reassignment cost,
Google API cost as operational software cost.
This will make ROI more realistic. Current ROI likely understates real cost if it assumes every cab begins at depot.

Cost Analysis
Based on current Google pricing pages, Dynamic Maps and Routes Essentials have free monthly caps, and Routes Matrix is billed per returned element. Google lists Routes Compute Route Matrix Essentials at 10,000 free monthly usage cap, then roughly $5 / 1,000 in the first paid tier; Geocoding is also listed at 10,000 free then $5 / 1,000; Dynamic Maps is 10,000 free then $7 / 1,000. Sources: pricing list, Maps JS billing.

Risk example:

100 employees full pairwise matrix: about 10,000 elements per run.
1,000 employees full pairwise: about 1,000,000 elements per run.
5,000 employees full pairwise: about 25,000,000 elements per run.
So the migration must not do full all-pairs matrices at scale. Use per-shift batching, candidate pruning, route-level caching, and only recompute changed addresses/routes.

Edge Cases

Driver on leave: resolve origin from replacement driver/cab state.
Cab changed: route origin follows vehicle state, not old driver home.
Driver changed: first route may use new driver home only if vehicle is actually there.
Multiple shifts: operational day state must survive across shifts.
Route cancellation: next route starts from latest known vehicle/current depot, not cancelled route destination.
Vehicle breakdown: mark cab unavailable and freeze operational state.
Temporary depot/office: treat as a location entity with validity dates.
Driver starts away from home: allow dispatcher override or mobile GPS as actual origin.
Security & Reliability
Use separate keys:

Browser key restricted to Maps JavaScript + allowed domains.
Server key restricted to Routes/Geocoding/Places APIs and backend IPs if possible.
Add quotas and alerts in Google Cloud. Google notes Routes API supports quota limits and has 3,000 QPM for compute routes and 3,000 EPM for route matrix. computeRouteMatrix has request limits, including 625 elements generally and 100 elements with TRAFFIC_AWARE_OPTIMAL. Source: Routes billing and limits.

No OSRM/Haversine fallback in final state. Fallback should be degraded behavior: use cached Google metrics, mark optimization stale, or block publish until Google metrics are available.

Recommended Implementation Order

Create routing/geocoding provider boundary.
Add Google cache tables and operational vehicle state model.
Move geocoding/autocomplete to Google Places/Geocoding.
Replace optimization metric calls with Google matrix through cache.
Introduce dynamic route origin resolver.
Persist planned origin/destination and Google metrics per route.
Replace Leaflet UI with Google Maps JavaScript API.
Remove OSRM, Leaflet, OSM, Nominatim, and Haversine code paths.
Update ROI to include deadhead and first/last route costs.
Add quota monitoring, cache dashboards, and migration validation reports.

## 1. Project Overview

This project is a web-based Employee Transportation Management System for managing employee commute rosters, cabs, shifts, route planning, route execution, safety compliance, and admin/manager/employee/driver workflows.

The application focuses on:

- Importing roster data from Excel.
- Managing employees, shifts, cabs, calendars, users, and settings.
- Optimizing pickup/drop routes for all active shifts.
- Supporting cab home/start locations.
- Displaying routes on a map with depot, cab start point, employee stops, and selected route details.
- Publishing optimized plans to drivers and employees.
- Tracking route execution, stop status, location trails, route events, and compliance warnings.

## 2. Tech Stack

### Frontend

- Next.js 16.2.6 with the App Router.
- React 19.2.4.
- Tailwind CSS 4.
- Zustand for client-side state management.
- Leaflet for interactive maps.
- Lucide React for UI icons.
- Recharts for analytics visualizations.
- Framer Motion for animation.
- next-pwa for progressive web app support.

### Backend

- Next.js Route Handlers under `src/app/api`.
- Prisma ORM 6.2.1.
- PostgreSQL database, intended to run on Supabase.
- Cookie/JWT-style app sessions using `jose`.
- Password hashing with `bcryptjs`.

### Data and Tooling

- Excel parsing with `xlsx`.
- Import/reset scripts with `ts-node`.
- Prisma schema in `prisma/schema.prisma`.
- Seed scripts in `prisma/seed.ts`, `prisma/seed-uat.ts`, and `scripts/seedTestData.ts`.
- Fresh import utilities:
  - `npm run db:prepare-import`
  - `npm run db:import-roster -- "roster demo.xlsx"`
  - `npm run db:seed:test`

## 3. Main Application Areas

### Admin Dashboard

The admin dashboard is the control center. It includes:

- Overview metrics.
- Route optimization workspace.
- Analytics.
- Notifications.
- Operations pages for employees, cabs, shifts, users, calendar, leaves, and hierarchy.
- Settings for depot, approval behavior, geocoding radius, and cost assumptions.

### Route Optimization Workspace

The optimization workspace handles:

- Date-based route loading.
- Pickup/drop direction.
- Multi-shift optimization preview.
- Strategy selection:
  - Maximize Utilization.
  - Minimize Time.
  - Balanced.
- Applying the selected plan.
- Publishing planned routes to the fleet.
- Map visualization for all routes and selected route overlays.
- Manual route stop reordering.
- Compliance warning review.
- Analytics and route comparison.

### Employee Portal

Employees can:

- View assigned route information.
- Review notifications.
- Submit leave/timing requests.
- See profile/preferences.

### Manager Portal

Managers can:

- View their team.
- Review approvals.
- See manager notifications and profile data.

### Driver Portal

Drivers can:

- View assigned routes.
- Start and complete routes.
- Mark stop-level events such as reached, boarded, skipped.
- Submit/update route progress.

## 4. Database Model Summary

The core Prisma models are:

- `User`: login identity, role, password hash, active status, password reset metadata.
- `Employee`: employee roster profile, coordinates, shift assignment, manager hierarchy.
- `Shift`: named time windows and cab/employee associations.
- `Cab`: vehicle, driver details, optional driver home/start point, shift assignments.
- `Route`: generated route for a cab/date/shift/direction.
- `RouteStop`: employee stop inside a route.
- `Violation`: safety/compliance warnings.
- `LeaveRequest`: leave workflow.
- `TimingChangeRequest`: pickup/drop timing change workflow.
- `SystemSettings`: depot, geocoding, approval, and cost assumptions.
- `Notification` and `NotificationSettings`: user notifications.
- `OperationalEvent`, `VehicleLocation`, `RouteDeviation`: route execution and tracking history.

## 5. Authentication and Authorization

Authentication is handled by custom app actions and session utilities:

- Login/password changes are in `src/app/actions/auth.ts`.
- Session creation/decryption is in `src/lib/session.ts`.
- Server-side session verification is in `src/lib/dal.ts`.
- Route-level API role checks use `src/lib/apiAuth.ts`.
- `src/proxy.ts` protects routes and redirects users to role-specific dashboards.

Supported roles:

- `ADMIN`
- `MANAGER`
- `EMPLOYEE`
- `DRIVER`

## 6. Excel Import and Data Reset

### Current Roster Import

The latest roster was imported from:

- `roster demo.xlsx`

The import script maps workbook rows into:

- Employees.
- Shifts.
- Cab/driver records.
- Cab-to-shift relationships.

Rows without employee identity data are imported with generated placeholder values such as:

- `Roster Employee 101`
- `ROSTER-101`
- `roster-101@import.local`

Reason: the source Excel row had address/pickup/shift data but no real employee email/name. The placeholders preserve routing and capacity data while satisfying database uniqueness requirements.

### Reset for Fresh Import

Use this command to preview the reset safety message:

```bash
npm run db:prepare-import
```

Use this command only when intentionally clearing transport/business data:

```bash
npm run db:prepare-import -- --confirm
```

The confirmed reset clears operational data and preserves/recreates test login accounts:

- `admin@transitadmin.com`
- `manager@test.com`
- `employee@test.com`

Then import a roster:

```bash
npm run db:import-roster -- "roster demo.xlsx"
```

## 7. Routing Engine

The routing engine lives primarily in:

- `src/lib/optimization.ts`
- `src/app/api/optimization/route.ts`
- `src/store/useTransportStore.ts`
- `src/components/NagpurLeafletMap.tsx`

### Input Data

The optimizer uses:

- Active employees for a shift.
- Employees not on approved leave for the selected date.
- Available cabs assigned to that shift.
- Cab capacity.
- Employee coordinates.
- Cab home/start point if configured.
- Depot coordinates from `SystemSettings`.
- Existing previous trips for the same date to calculate trip sequence and dynamic cab start point.

### Cab Start Point Logic

Each cab can have a `Home Address / Starting Point`.

Morning or first-trip behavior:

- If a cab has `driverX` and `driverY`, the route starts at the driver's configured home/start point.
- If no cab start point is configured, the route starts from the depot fallback.

Multi-trip behavior:

- If a cab already completed/has a previous route for another shift on the same date, the engine uses the previous route to determine the next start point.
- If the previous trip was a drop route, the next route can start from the last employee drop location.
- If the previous trip was a pickup route, the next route generally starts from the depot because the pickup route ends at the depot.

### Pickup and Drop Geometry

For pickup routes:

```text
cab start point -> employee pickup stops -> depot
```

For drop routes:

```text
cab start point -> depot -> employee drop stops
```

If the cab start point is already the depot, the route avoids duplicating depot coordinates.

### Clustering and Assignment

The engine groups employees into capacity-constrained clusters:

- It uses greedy clustering with k-means-style centroid refinement.
- It respects each cab capacity.
- It creates clusters based on employee coordinates and distance from centroids.
- It assigns route clusters to available cabs.

### Stop Ordering

Stop ordering considers:

- Distance between stops.
- Pickup/drop direction.
- Depot position.
- Safety constraints.
- Female-first pickup and female-last drop risk.
- Isolated female passenger risk.

### Strategies

The optimizer can produce multiple strategy previews:

- `MAXIMIZE_UTILIZATION`: aims to use fewer/more fully loaded cabs.
- `MINIMIZE_TIME`: prioritizes shorter commute time.
- `BALANCED`: compromises between distance/time/load/safety.

The UI previews these plans first. Applying a strategy persists routes to the database.

### Distance and Duration Calculation

The engine uses layered distance calculation:

1. Google Maps Distance Matrix API if `GOOGLE_MAPS_API_KEY` is configured.
2. OSRM route API for road geometry/distance in selected places.
3. Haversine distance with road-circuity factor as a fallback.

The app is therefore usable without paid Google APIs for POC/demo usage, but production quality improves with a stable paid routing provider or self-hosted routing infrastructure.

### Route Persistence

When a plan is applied:

- Existing routes for the selected date and shift are deleted.
- New route records are created.
- Stops are created in route order.
- Violations are persisted.
- Route status starts as `PENDING`.

The all-shift preview flow groups routes by shift before applying so that APAC or first-shift routes do not overwrite other shifts.

## 8. Mapping

The map stack uses:

- Leaflet for browser map rendering.
- OSRM for route geometry where available.
- Depot marker.
- Driver start marker for configured cab home/start point.
- Employee markers.
- All-shift route overview.
- Selected-route overlay with route details and variations.

Important behavior:

- The map always renders all routes it receives.
- Selecting a route overlays details instead of hiding other shifts.
- In preview mode, generated routes are tagged with their real shift metadata so cards and map labels show actual shift names.

## 9. Safety and Compliance

The system flags:

- Female first pickup risk.
- Female last drop risk.
- Isolated female passenger risk.
- Overcapacity.

Violations are shown in:

- Route cards.
- Safety compliance ledger.
- Map selected route details.

Admins can resolve or review warnings.

## 10. Deployment and Infrastructure

### Vercel

Vercel is the natural deployment target because the app is a Next.js application.

Recommended deployment flow:

1. Push repository to GitHub.
2. Import project in Vercel.
3. Add environment variables.
4. Run build.
5. Connect Supabase database.

Official Vercel Hobby plan notes:

- Hobby is free and meant for personal projects/small-scale apps.
- It is restricted to non-commercial personal use.
- Included usage includes function invocations, build minutes, Edge requests, analytics events, and other monthly caps.
- If usage limits are exceeded on Hobby, users typically wait until the usage window resets.

Source: [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)

### Supabase

Supabase is the intended hosted PostgreSQL provider.

Official Free plan notes include:

- 2 free projects.
- 50,000 monthly active users.
- 500 MB database size.
- 5 GB egress.
- 5 GB cached egress.
- 1 GB file storage.
- Community support.
- Free projects can pause after inactivity.

Sources:

- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Billing Docs](https://supabase.com/docs/guides/platform/billing-on-supabase)

### Google Maps Platform

The app can use Google Maps Distance Matrix through `GOOGLE_MAPS_API_KEY`, but it is optional.

Important pricing/billing notes:

- Google Maps Platform uses pay-as-you-go pricing per SKU/billable event.
- As of Google's March 1, 2025 pricing changes, free usage caps replaced the old monthly USD 200 credit model.
- Distance Matrix API is marked legacy and requires billing plus an API key or OAuth token.
- Distance Matrix is billed per element, where elements equal origins multiplied by destinations.
- Distance Matrix usage limits include 25 origins or 25 destinations per request and 100 elements per request.

Sources:

- [Google Maps Platform Pricing Overview](https://developers.google.com/maps/billing-and-pricing/overview)
- [Distance Matrix API Usage and Billing](https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing)

### OpenStreetMap Nominatim

Nominatim is used for geocoding fallback in parts of the app.

Important free/public service notes:

- The public `nominatim.openstreetmap.org` server has limited donated capacity.
- Heavy use is not allowed.
- The usage policy states an absolute maximum of 1 request per second.
- Requests must include a valid identifying User-Agent or Referer.
- Attribution is required.

Source: [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

### OSRM

OSRM is used for route geometry and fallback road distance/duration.

The current app uses the public demo server endpoint in places:

```text
router.project-osrm.org
```

For demo/POC usage this is acceptable, but for production usage the safer options are:

- Self-host OSRM.
- Use a paid routing API.
- Use Google Routes/Route Matrix with budget quotas.

The public OSRM demo server is not a production SLA service and should not be used for heavy commercial load.

Source: [OSRM demo server notes](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server)

## 11. Environment Variables

Required:

```env
DATABASE_URL=
DIRECT_URL=
```

Recommended:

```env
SESSION_SECRET=
GOOGLE_MAPS_API_KEY=
```

Notes:

- `DATABASE_URL` and `DIRECT_URL` are used by Prisma/Supabase PostgreSQL.
- `GOOGLE_MAPS_API_KEY` is optional. If absent, the optimizer falls back to OSRM/Haversine behavior.
- Keep all secrets in Vercel environment variables or local `.env` files. Do not commit secrets.

## 12. Common Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:seed
npm run db:prepare-import
npm run db:prepare-import -- --confirm
npm run db:import-roster -- "roster demo.xlsx"
npm run db:seed:test
```

## 13. Current Imported Data Snapshot

After importing `roster demo.xlsx`:

- Users: 72
- Employees: 69
- Active employees: 63
- Inactive/no-show employees: 6
- Shifts: 5
- Unique cabs: 8
- Routes: 0 before optimization

Shift capacity sanity check:

| Shift | Active Employees | Cabs | Total Seats |
| --- | ---: | ---: | ---: |
| 05:00 Shift | 27 | 7 | 31 |
| 08:00 Shift | 17 | 5 | 23 |
| 10:00 Shift | 5 | 1 | 5 |
| 11:00 Shift | 2 | 1 | 4 |
| 11:30 Shift | 12 | 3 | 14 |

## 14. Production Readiness Notes

Before production use:

- Replace generated placeholder employee identities with real HR data.
- Confirm phone numbers and employee codes from source systems.
- Configure budget alerts and quotas in Google Cloud if enabling Google Maps APIs.
- Avoid relying on public OSRM/Nominatim endpoints for heavy production load.
- Decide whether to self-host OSRM or use a paid routing provider.
- Move all secrets to Vercel/Supabase environment configuration.
- Add backup/restore process for Supabase.
- Review privacy requirements for employee home addresses and live tracking.
- Add rate limiting and audit logging for admin actions if this becomes production-facing.
- Confirm Vercel Hobby is only used for non-commercial/demo use; use Pro or higher for commercial deployment.

## 15. Source Links for Provider Tiers

- Supabase Pricing: https://supabase.com/pricing
- Supabase Billing Docs: https://supabase.com/docs/guides/platform/billing-on-supabase
- Vercel Hobby Plan: https://vercel.com/docs/plans/hobby
- Google Maps Platform Pricing Overview: https://developers.google.com/maps/billing-and-pricing/overview
- Google Distance Matrix Usage and Billing: https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing
- Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
- OSRM Demo Server: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
