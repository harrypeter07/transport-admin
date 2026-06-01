# Employee Transportation Management System

Employee Transportation Management System is a Next.js application for importing employee commute rosters, managing cabs/shifts/employees, optimizing pickup/drop routes, publishing fleet plans, and tracking commute execution.

For the full project handoff, architecture notes, provider free-tier details, and routing engine explanation, see [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md).

## Core Features

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

## Tech Stack

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

## Provider and Free-Tier Notes

As of 2026-06-01:

- Supabase Free includes 50,000 monthly active users, 500 MB database size, 5 GB egress, 5 GB cached egress, 1 GB file storage, and 2 free projects. Free projects can pause after inactivity. See [Supabase Pricing](https://supabase.com/pricing) and [Supabase Billing Docs](https://supabase.com/docs/guides/platform/billing-on-supabase).
- Vercel Hobby is free for personal/non-commercial projects and includes monthly usage caps for functions, Edge requests, builds, analytics, and related platform resources. See [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby).
- Google Maps Platform uses SKU-based pay-as-you-go pricing. Google replaced the old monthly USD 200 credit with SKU-specific free usage caps as of March 1, 2025. Distance Matrix is billed per element and requires billing/API key. See [Google Maps Pricing Overview](https://developers.google.com/maps/billing-and-pricing/overview) and [Distance Matrix Usage and Billing](https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing).
- Public Nominatim and OSRM services are suitable for demos/POCs but not heavy production use. Nominatim requires attribution, a valid User-Agent/Referer, and a maximum of 1 request per second on the public service. See [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) and [OSRM Demo Server](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server).

## Getting Started

Install dependencies:

```bash
npm install
```

Set environment variables:

```env
DATABASE_URL=
DIRECT_URL=
SESSION_SECRET=
GOOGLE_MAPS_API_KEY=
```

`GOOGLE_MAPS_API_KEY` is optional for local/demo use. Without it, the optimizer falls back to OSRM/Haversine behavior.

Push the Prisma schema:

```bash
npm run db:push
```

Seed a clean admin account:

```bash
npm run db:seed
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
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

## Test Login Accounts

The reset workflow preserves/recreates:

- `admin@transitadmin.com / Admin@1234`
- `manager@test.com / Test@123`
- `employee@test.com / Test@123`

## Useful Scripts

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

## Deployment Notes

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
