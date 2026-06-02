# Update README.md and PROJECT_DOCUMENTATION.md

## Context

All changes from the roadmap are now applied:
- Google Routes/Places/Geocoding API is the single source of truth for location
- OSRM, Leaflet, OSM, Nominatim removed
- Excel import removed  
- Route naming (r1, r2, r3...) added
- Audit logging with `AuditLog` Prisma model + structured `[tag]` logging
- Address integrity lifecycle (formattedAddress, placeId)
- In-memory caching (geocode 1h TTL, matrix 5min TTL)
- Production hardening (chunked global matrix, fallback transparency, DirectionsService removal, per-stop ETA via matrix, etc.)

---

## README.md Edits

### 1. First paragraph (line 1)
**oldString:**
```
Employee Transportation Management System is a Next.js application for importing employee commute rosters, managing cabs/shifts/employees, optimizing pickup/drop routes, publishing fleet plans, and tracking commute execution.
```
**newString:**
```
Employee Transportation Management System is a Next.js application for managing cabs/shifts/employees, optimizing pickup/drop routes via Google Routes API, publishing fleet plans, and tracking commute execution.
```

### 2. Core Features (lines 8-19)
**oldString:**
```
- Admin dashboard for transport operations.
- Employee, cab, shift, user, calendar, leave, and hierarchy management.
- Excel roster import and reset workflow.
- Multi-shift route optimization preview.
- Strategy selection: utilization, commute time, and balanced plans.
- Cab home address / starting point support.
- Pickup/drop route generation with safety checks.
- Leaflet map with depot, driver start point, employee stops, all-shift overview, and selected-route overlay.
- Driver route execution workflow.
- Employee and manager portals.
- Safety compliance ledger and notifications.
```
**newString:**
```
- Admin dashboard for transport operations.
- Employee, cab, shift, user, calendar, leave, and hierarchy management.
- Multi-shift route optimization preview via Google Routes API.
- Strategy selection: utilization, commute time, and balanced plans.
- Cab home address / starting point support.
- Pickup/drop route generation with safety checks.
- Google Maps with depot, driver start point, employee stops, all-shift overview, and selected-route overlay (road-aligned polylines).
- Driver route execution workflow.
- Employee and manager portals.
- Safety compliance ledger and notifications.
- Complete audit logging across all mutation endpoints.
```

### 3. Tech Stack (lines 21-34)
**oldString:**
```
- Next.js 16.2.6
- React 19.2.4
- Tailwind CSS 4
- Prisma 6.2.1
- PostgreSQL, intended for Supabase
- Zustand
- Leaflet
- Recharts
- next-pwa
- xlsx
- bcryptjs
- jose
```
**newString:**
```
- Next.js 16.2.6 (App Router)
- React 19.2.4
- Tailwind CSS 4
- Prisma 6.2.1 + PostgreSQL (Supabase)
- Zustand (client state)
- @googlemaps/js-api-loader (Maps JS + Routes API + Places API)
- Recharts (analytics)
- Framer Motion (animations)
- Lucide React (icons)
- bcryptjs + jose (auth sessions)
```

### 4. Routing Engine Summary (lines 36-66)
**oldString:**
```
## Routing Engine Summary

The route engine is implemented in `src/lib/optimization.ts` and exposed through `src/app/api/optimization/route.ts`.

It uses:

- Active employees assigned to each shift.
- Available cabs assigned to that shift.
- Cab capacities.
- Employee coordinates.
- Cab home/start coordinates when configured.
- Depot coordinates from `SystemSettings`.
- Previous same-day cab trips to determine trip sequence and dynamic next start location.

Distance and duration calculation uses this fallback chain:

1. Google Maps Distance Matrix API when `GOOGLE_MAPS_API_KEY` is configured.
2. OSRM route APIs where used for road geometry/distance.
3. Haversine distance with road-circuity fallback.

Pickup route shape:

```text
cab start point -> employee pickup stops -> depot
```

Drop route shape:

```text
cab start point -> depot -> employee drop stops
```
```
**newString:**
```
## Routing Engine Summary

The route engine is implemented in `src/lib/optimization.ts` (~1575 lines) and exposed through `src/app/api/optimization/route.ts`.

It uses:

- Active employees assigned to each shift.
- Available cabs assigned to that shift.
- Cab capacities.
- Employee coordinates.
- Cab home/start coordinates when configured.
- Depot coordinates from `SystemSettings`.
- Previous same-day cab trips to determine trip sequence and dynamic next start location.

Coordinates and addresses come from Google Places autocomplete (primary) with server-side Geocoding API fallback. Google is the single source of truth — OSRM and OpenStreetMap have been fully removed.

Distance and duration uses this fallback chain:

1. Google Routes API `computeRouteMatrix` (primary, 5-min in-memory cache).
2. Haversine distance × 1.3 road-circuity factor (last-resort fallback).

Route geometry is fetched via Google Routes API `computeRoutes` and rendered as road-aligned polylines on the map. Geometry fetches run in parallel per route and update state incrementally (no `Promise.all` wait).

Results are cached in-memory:
- Geocode responses: 1-hour TTL.
- Matrix responses: 5-minute TTL.

Pickup route shape:

```text
cab start point -> employee pickup stops -> depot
```

Drop route shape:

```text
cab start point -> depot -> employee drop stops
```

Routes are persisted with sequential numbering (`routeNumber: 1, 2, 3...`) and displayed in the UI as `r1`, `r2`, `r3`.
```

### 5. Delete "Data Reset and Roster Import" section entirely (lines 120-144)
**oldString:**
```
## Data Reset and Roster Import

Preview the reset command:

```bash
npm run db:prepare-import
```

Clear transport/business data and preserve test login accounts:

```bash
npm run db:prepare-import -- --confirm
```

Import the current roster workbook:

```bash
npm run db:import-roster -- "roster demo.xlsx"
```

Optional test fixture seed:

```bash
npm run db:seed:test
```
```
**newString:**
```
*Excel roster import has been removed. Employee and cab creation is done through individual forms in the admin dashboard.*
```

### 6. Useful Scripts (lines 155-166)
**oldString:**
```
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:seed
npm run db:prepare-import
npm run db:import-roster -- "roster demo.xlsx"
npm run db:seed:test
```
```
**newString:**
```
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:seed
```
```

### 7. Deployment Notes (lines 168-182)
**oldString:**
```
Recommended demo deployment:

- Vercel for the Next.js app.
- Supabase for PostgreSQL.
- Optional Google Maps API key for more accurate distance matrix calculations.

Production considerations:

- Use Vercel Pro or another production-grade host for commercial deployment.
- Configure Google Cloud budgets/quotas before enabling paid Maps APIs.
- Avoid heavy production reliance on public OSRM/Nominatim services.
- Add database backup/restore procedures.
- Review privacy controls around employee home addresses, live cab tracking, and route history.
```
**newString:**
```
Recommended deployment:

- Vercel for the Next.js app.
- Supabase for PostgreSQL.
- Google Maps API key (required for routing — key restricted to Maps JavaScript API + Places API + Routes API).

Production considerations:

- Use Vercel Pro or another production-grade host for commercial deployment.
- Configure Google Cloud budgets/quotas before enabling paid Maps APIs.
- Replace in-memory caches (matrix, geocode) with persistent storage for multi-instance resilience.
- Add database backup/restore procedures.
- Review privacy controls around employee home addresses, live cab tracking, and route history.
- Rate limiting and additional security hardening before production deployment.
```

### 8. Environment variable note (near line 94)
**oldString:**
```
`GOOGLE_MAPS_API_KEY` is optional for local/demo use. Without it, the optimizer falls back to OSRM/Haversine behavior.
```
**newString:**
```
`GOOGLE_MAPS_API_KEY` is required for routing, geocoding, and map rendering. Without it, the optimizer falls back to Haversine (degraded mode with no road-aligned geometry).
```

---

## PROJECT_DOCUMENTATION.md Edits

### 1. Last updated date (line 3)
**oldString:**
```
Last updated: 2026-06-01
```
**newString:**
```
Last updated: 2026-06-02
```

### 2. Active Migration Context section (lines 5-40) — Replace entirely
**oldString:**
```
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
```
**newString:**
```
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
```

### 3. Project Overview (lines 206-217)
**oldString:**
```
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
```
**newString:**
```
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
```

### 4. Tech Stack (lines 219-250)
**oldString:**
```
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
```
**newString:**
```
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
```

### 5. Excel Import section (lines 343-390) — Replace entire section
**oldString:**
```
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
```
**newString:**
```
## 6. Address Integrity Lifecycle

Addresses flow through a verified lifecycle to ensure Google is the single source of truth:

1. **Autocomplete (primary)**: Google Places Autocomplete on forms provides `placeId`, `formattedAddress`, `lat`, `lng`. These are stored directly — no server-side geocode call.
2. **Server-side geocode (fallback)**: When a client submits an address without autocomplete data, the server geocodes it via Geocoding API.
3. **Display**: The `formattedAddress` field is the primary display value in tables, info windows, and route cards. Legacy `address`/`driverAddress` fields are retained for backward compatibility.
4. **Persistence**: Autocomplete-origin coordinates are trusted over server-side geocode. On partial edits, `formattedAddress` is only overwritten when explicitly sent.
```

### 6. Routing Engine section (lines 392-495)
**oldString:**
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
```
**newString:**
```
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
- New route records are created with sequential `routeNumber`.
- Stops are created in route order.
- Violations are persisted.
- Route status starts as `PENDING`.

The all-shift preview flow groups routes by shift before applying so that APAC or first-shift routes do not overwrite other shifts.
```

### 7. Mapping section (lines 497-513)
**oldString:**
```
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
```
**newString:**
```
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
```

### 8. Safety section (line 524)
No changes needed.

### 9. Deployment — remove OSRM and Nominatim subsections (lines 534-624)
**oldString:**
```
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
```
**newString:**
```
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
```

### 10. Environment Variables (lines 626-646)
**oldString:**
```
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
```
**newString:**
```
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
```

### 11. Common Commands (lines 648-661)
**oldString:**
```
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
```
**newString:**
```
```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:push
npm run db:seed
```
```

### 12. Section 13 — Remove Imported Data Snapshot (lines 663-683)
**oldString:**
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
```
**newString:**
```
(Omitted — data snapshot is out of date; refer to the database directly.)
```

### 13. Production Readiness (lines 685-698)
**oldString:**
```
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
```
**newString:**
```
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
```

### 14. Source Links (lines 700-708)
**oldString:**
```
## 15. Source Links for Provider Tiers

- Supabase Pricing: https://supabase.com/pricing
- Supabase Billing Docs: https://supabase.com/docs/guides/platform/billing-on-supabase
- Vercel Hobby Plan: https://vercel.com/docs/plans/hobby
- Google Maps Platform Pricing Overview: https://developers.google.com/maps/billing-and-pricing/overview
- Google Distance Matrix Usage and Billing: https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing
- Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
- OSRM Demo Server: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
```
**newString:**
```
## 15. Source Links for Provider Tiers

- Supabase Pricing: https://supabase.com/pricing
- Supabase Billing Docs: https://supabase.com/docs/guides/platform/billing-on-supabase
- Vercel Hobby Plan: https://vercel.com/docs/plans/hobby
- Google Maps Platform Pricing Overview: https://developers.google.com/maps/billing-and-pricing/overview
- Routes API Usage and Billing: https://developers.google.com/maps/documentation/routes/usage-and-billing
- Geocoding API Usage and Billing: https://developers.google.com/maps/documentation/geocoding/usage-and-billing
```

### 15. Add new Audit Logging section (before section 15, i.e. before Source Links)

Insert after the Production Readiness section:

```
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
```
---

## Execution

Apply edits in the order listed above to both files. Each edit is independent — no overlap between oldStrings.
