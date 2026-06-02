# Employee Transportation Management System Documentation

Last updated: 2026-06-02

## Completed Migration: Google Maps Platform

The codebase has been fully migrated to Google Maps Platform (Routes API, Places API, Geocoding API, Maps JavaScript API). OSRM, OpenStreetMap Nominatim, Leaflet, and the `xlsx` Excel import have been removed.

### What was done

- Google Routes API `computeRouteMatrix` replaced OSRM/Haversine for distance/duration in optimization.
- Google Routes API `computeRoutes` provides road-aligned route geometry polylines.
- Google Places API handles address autocomplete — `placeId`, `formattedAddress`, `lat`, `lng` are the primary address fields.
- Google Geocoding API is the server-side fallback when autocomplete data is absent.
- `NagpurLeafletMap.tsx` (709 lines of Leaflet code) deleted; all map rendering uses Google Maps JavaScript API via `GoogleMapView.tsx`.
- Excel import (`xlsx`-based roster import) removed entirely — employee and cab creation is through individual forms.
- In-memory caching added for matrix responses (5-min TTL) and geocode responses (1-hour TTL).
- Route geometry coordinate format standardized to `[[lat, lng]]` arrays across client and server.
- Routes persisted with sequential numbering (`routeNumber: 1, 2, 3...`) displayed as `r1`, `r2`, `r3` in UI.

### What was preserved

- All business logic: clustering, capacity constraints, safety rules, strategy modes (MAXIMIZE_UTILIZATION, MINIMIZE_TIME, BALANCED).
- Dynamic cab origin logic (home → depot → multi-trip state).
- Haversine distance × 1.3 road-circuity factor retained as last-resort fallback only.
- All UI workflows: admin optimization, driver execution, employee portal, manager portal.

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

This project is a web-based Employee Transportation Management System for managing employees, cabs, shifts, route planning via Google Routes API, route execution, safety compliance, and admin/manager/employee/driver workflows.

The application focuses on:

- Managing employees, shifts, cabs, calendars, users, and settings.
- Optimizing pickup/drop routes for all active shifts via Google Routes API.
- Supporting cab home/start locations.
- Displaying road-aligned routes on a Google Map with depot, cab start point, employee stops, and selected route details.
- Publishing optimized plans to drivers and employees.
- Tracking route execution, stop status, location trails, route events, and compliance warnings.
- Complete audit logging of all mutation operations.

## 2. Tech Stack

### Frontend

- Next.js 16.2.6 with the App Router.
- React 19.2.4.
- Tailwind CSS 4.
- Zustand for client-side state management.
- Google Maps JavaScript API via `@googlemaps/js-api-loader`.
- Lucide React for UI icons.
- Recharts for analytics visualizations.
- Framer Motion for animation.

### Backend

- Next.js Route Handlers under `src/app/api`.
- Prisma ORM 6.2.1.
- PostgreSQL database, intended to run on Supabase.
- Cookie/JWT-style app sessions using `jose`.
- Password hashing with `bcryptjs`.
- Google Routes API + Places API + Geocoding API.
- Structured logging with `[tag]` prefixes (`[api]`, `[store]`, `[optimization]`, `[maps]`, `[notifications]`, `[auth]`).

### Data and Tooling

- Prisma schema in `prisma/schema.prisma`.
- Seed scripts in `prisma/seed.ts`.
- Audit logging via `AuditLog` Prisma model.
- In-memory TTL cache for matrix (5-min) and geocode (1-hour).

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

## 6. Address Integrity Lifecycle

Addresses flow through a verified lifecycle to ensure Google is the single source of truth:

1. **Autocomplete (primary)**: Google Places Autocomplete on forms provides `placeId`, `formattedAddress`, `lat`, `lng`. These are stored directly — no server-side geocode call.
2. **Server-side geocode (fallback)**: When a client submits an address without autocomplete data, the server geocodes it via Geocoding API.
3. **Display**: The `formattedAddress` field is the primary display value in tables, info windows, and route cards. Legacy `address`/`driverAddress` fields are retained for backward compatibility.
4. **Persistence**: Autocomplete-origin coordinates are trusted over server-side geocode. On partial edits, `formattedAddress` is only overwritten when explicitly sent.

## 7. Routing Engine

The routing engine lives primarily in:

- `src/lib/optimization.ts` (~1575 lines)
- `src/app/api/optimization/route.ts`
- `src/store/useTransportStore.ts`
- `src/components/GoogleMapView.tsx`

### Input Data

The optimizer uses:

- Active employees for a shift.
- Employees not on approved leave for the selected date.
- Available cabs assigned to that shift.
- Cab capacity.
- Employee coordinates (from Google Places autocomplete, with Geocoding API fallback).
- Cab home/start point if configured.
- Depot coordinates from `SystemSettings` (`depotPlaceId`, `depotFormattedAddress`).
- Existing previous trips for the same date to calculate trip sequence and dynamic cab start point.

Coordinates and addresses come from Google Places autocomplete (primary) with server-side Geocoding API fallback. Google is the single source of truth.

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

1. **Google Routes API `computeRouteMatrix`** — primary provider. Requests are chunked globally (all employees × all cabs) and cached in-memory for 5 minutes.
2. **Haversine distance × 1.3 road-circuity factor** — last-resort fallback when Google API is unavailable.

OSRM has been fully removed.

Route geometry is fetched via Google Routes API `computeRoutes` and rendered as road-aligned polylines. Geometry fetches run in parallel per route (no `Promise.all` wait) and update state incrementally.

### Caching

- **Matrix responses**: In-memory `Map` with 5-minute TTL (keyed by origin/destination pairs + strategy).
- **Geocode responses**: In-memory `Map` with 1-hour TTL.

Caches do not survive server restart and are not shared across instances. Replace with Redis or similar for multi-instance production deployments.

### Route Naming

Routes are persisted with a sequential `routeNumber` (1, 2, 3...) per optimization run. The UI displays them as `r1`, `r2`, `r3` in cards, tables, and the sidebar.

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

- **Google Maps JavaScript API** via `@googlemaps/js-api-loader` (rendered in `src/components/GoogleMapView.tsx`).
- **Google Routes API** for road-aligned route geometry polylines.
- Depot marker (with `formattedAddress` in info window).
- Driver start marker for configured cab home/start point.
- Employee markers (with `formattedAddress` as primary label).
- All-shift route overview with color-coded polylines by strategy.
- Selected-route overlay with route details, stops, and strategy variations.

Important behavior:

- The map always renders all routes it receives.
- Selecting a route overlays details instead of hiding other shifts.
- In preview mode, generated routes are tagged with their real shift metadata so cards and map labels show actual shift names.
- Route geometry is fetched via `POST /api/routing/geometry` which calls Google Routes API `computeRoutes`, falling back to leg-by-leg if the full route fails.
- Coordinate format between client and server is `[[lat, lng]]` arrays (not `[{lat, lng}]` objects).
- Each route's road geometry appears incrementally as its fetch completes.

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

The app uses Google Routes API (computeRouteMatrix, computeRoutes), Places API (autocomplete, place details), and Geocoding API. A valid `GOOGLE_MAPS_API_KEY` is required for routing and map rendering.

Important pricing/billing notes:

- Google Maps Platform uses pay-as-you-go pricing per SKU/billable event.
- As of Google's March 1, 2025 pricing changes, free usage caps replaced the old monthly USD 200 credit model.
- Routes API computeRouteMatrix is billed per element (origins × destinations), with the first tier at roughly $5/1000 elements after 10,000 free per month.
- Geocoding API is $5/1000 requests after 10,000 free per month.
- Maps JavaScript API is $7/1000 loads after 10,000 free per month.
- Use separate browser and server API keys with domain/IP restrictions.
- Configure budgets and quotas in Google Cloud before production use.

Sources:

- [Google Maps Platform Pricing Overview](https://developers.google.com/maps/billing-and-pricing/overview)
- [Routes API Usage and Billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Geocoding API Usage and Billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing)

OSRM and OpenStreetMap Nominatim have been fully removed from the codebase and are no longer dependencies.

## 11. Environment Variables

Required:

```env
DATABASE_URL=
DIRECT_URL=
SESSION_SECRET=
GOOGLE_MAPS_API_KEY=
```

Notes:

- `DATABASE_URL` and `DIRECT_URL` are used by Prisma/Supabase PostgreSQL.
- `GOOGLE_MAPS_API_KEY` is required for routing, geocoding, and map rendering. Without it, the optimizer falls back to Haversine (degraded mode with no road-aligned geometry).
- Keep all secrets in Vercel environment variables or local `.env` files. Do not commit secrets.

## 12. Common Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:seed
```

(Omitted — data snapshot is out of date; refer to the database directly.)

## 14. Production Readiness Notes

Completed hardening items:

- Audit logging on all mutation API endpoints (`AuditLog` Prisma model with before/after snapshots).
- Structured logging with `[tag]` prefixes across API, store, optimization, maps, notifications, and auth.
- Chunked global matrix requests to avoid Google API element limits.
- In-memory caching for matrix (5-min TTL) and geocode (1-hour TTL).
- Route geometry race condition fixed (incremental state update).
- Coordinate format validation on geometry endpoint.
- Try/catch scoping bugs fixed across all API routes.
- `formattedAddress`, `placeId` integrity lifecycle.
- NagpurLeafletMap (709 lines of dead code) deleted.
- Excel import removed.
- All `console.error()` calls standardized to structured logging.
- TypeScript compiles clean (tsc --noEmit).

Before production use:

- Replace in-memory caches with persistent storage (Redis) for multi-instance resilience.
- Configure Google Cloud budgets/quotas.
- Add rate limiting for API endpoints.
- Add database backup/restore procedures.
- Review privacy requirements for employee home addresses and live tracking.
- Confirm Vercel Hobby is only used for non-commercial/demo use; use Pro or higher for commercial deployment.

## 16. Audit Logging

Every mutation API endpoint records an `AuditLog` entry via the `audit()` helper in `src/lib/audit.ts`.

### What is logged

| Field | Description |
|-------|-------------|
| `userId` | Actor's user ID |
| `role` | Actor's role (ADMIN, MANAGER, EMPLOYEE, DRIVER) |
| `action` | Operation type: CREATE, UPDATE, DELETE, OPTIMIZE, PUBLISH |
| `entity` | Affected entity (Employee, Cab, Route, Shift, etc.) |
| `entityId` | ID of the affected record |
| `before` | JSON snapshot before mutation (null on CREATE) |
| `after` | JSON snapshot after mutation (null on DELETE) |
| `ip` | Requestor IP address |
| `createdAt` | Timestamp |

### Structure

- All CREATE/UPDATE/DELETE/OPTIMIZE/PUBLISH actions in API routes (24 files) include an `audit()` call.
- Before/after snapshots use Prisma `findUnique` or request body data.
- Audit writes are non-blocking — errors are silently logged and do not block the response.

### Logging Standards

All console output uses structured `[tag]` prefixes:

| Tag | Usage |
|-----|-------|
| `[api]` | API request success, error, auth rejection |
| `[store]` | Zustand store actions |
| `[optimization]` | Optimization engine events, fallback warnings |
| `[maps]` | Google Maps/Places/Geocoding provider calls |
| `[notifications]` | Notification dispatch |
| `[auth]` | Authentication events |

Error format: `console.error("[tag] ❌ message", { context }, error)`
Auth rejections: `console.error("[api] 🔒 Unauthorized access attempt", { ... })`
Success: `console.log("[api] ✅ action completed", { ... })`

## 15. Source Links for Provider Tiers

- Supabase Pricing: https://supabase.com/pricing
- Supabase Billing Docs: https://supabase.com/docs/guides/platform/billing-on-supabase
- Vercel Hobby Plan: https://vercel.com/docs/plans/hobby
- Google Maps Platform Pricing Overview: https://developers.google.com/maps/billing-and-pricing/overview
- Routes API Usage and Billing: https://developers.google.com/maps/documentation/routes/usage-and-billing
- Geocoding API Usage and Billing: https://developers.google.com/maps/documentation/geocoding/usage-and-billing
