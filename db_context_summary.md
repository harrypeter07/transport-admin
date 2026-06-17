# Database Context & Architecture Summary

This document provides a technical overview of the database schema, custom matching rules, constraints, and architecture of the Transit Admin transport system to help future developers/agents understand the codebase quickly.

---

## 1. Schema Overview

The system uses **PostgreSQL** (managed via Prisma) and is defined in [schema.prisma](file:///c:/Users/ASUS/Documents/SECOND%20SEMISTER/INTERNSHIP/arsen/prisma/schema.prisma). Key entities include:

* **User**: Authentication accounts. Roles are `ADMIN`, `MANAGER`, `EMPLOYEE`, or `DRIVER`.
* **Employee**: Represents corporate employees. Linked optionally to `User` (for manager/employee dashboard access), `Shift`, and a `PickupPoint`.
* **Cab**: Represents the vehicle and driver details.
  * **Driver details** (`driverName`, `driverPhone`, `licenseNumber`, `driverAddress`) are stored directly on the `Cab` model, not in the `Employee` table.
  * Driver user accounts (role `DRIVER`) link back to the `Cab` table.
* **DriverDocument**: Compliance documents associated with a `Cab` (Driving License, Insurance, RC Book, Police Verification). Contains expiry and next audit dates.
* **PickupPoint**: Geocoded points (x=longitude, y=latitude) where cabs stop to pool passengers.
* **Route**: Optimized route run by a `Cab` on a specific `date` and `shiftId`.
* **RouteStop**: Individual passenger stops on a `Route`. Links a `Route` to an `Employee` (stop sequence and delay tracking).
* **TransportRoster**: Tracks daily attendance/roster statuses (PRESENT, NO_SHOW, ON_LEAVE) for employees.
* **BaselineRoute**: Snapshots of unoptimized original Excel routes used for ROI comparison.

---

## 2. Critical Database Constraints & Indexes

1. **Unique Constraints**:
   - `employee_code_unique`: `Employee.employeeCode` is strictly unique.
   - `cab_vehicle_unique`: `Cab.vehicleNumber` is strictly unique.
   - `transport_roster_unique`: `TransportRoster` has a composite unique constraint on `[employeeId, date]` to prevent duplicate attendance rows.

2. **Indexes**:
   - `TransportRoster` indexed on `date`.
   - `CabRosterStatus` indexed on `date`.
   - `DriverAssignment` indexed on `[cabId, date]`.

---

## 3. Important Matching & Entity Quirks

### A. Duplicate Employee Code Conflict (Deepak vs Yash)
- **Problem**: In the raw corporate master list, Deepak Singh Kushwah and Yash Karambe both share code `2576584` due to upstream data errors.
- **Resolution**:
  - Deepak Singh Kushwah holds code `2576584` in the database.
  - Yash Karambe has been assigned his official unique employee code: `2576564`.
- **Excel Parser Rule**:
  - The excel parser matches stops using `matchEmployee` in [excelParser.ts](file:///c:/Users/ASUS/Documents/SECOND%20SEMISTER/INTERNSHIP/arsen/src/lib/excelParser.ts).
  - To prevent matching Yash's Excel rows (which may still contain code `2576584` due to old template usage) to Deepak, the parser validates name similarity:
    - If it matches by code, it checks if the matched database name contains or matches the row's passenger name.
    - If there is a mismatch, it falls back to name-based resolving using `byName.get(name)`.

### B. Driver Representation
- **Problem**: Drivers are in the `Cab` table, but the Admin layout has an "Employees Desk" showing all workforce details and filtering by designation (Manager, Engineer, Driver).
- **Resolution**:
  - The employees list API `/api/employees` fetches cabs with active drivers and maps them into "Driver" designation employee-like objects dynamically for Admin views.
  - In the employee desk table, the action buttons for "Driver" records are custom-configured to link directly to `/dashboard/admin/operations/cabs` for Cab & Compliance management.

### C. Driver Compliance & Expiry
- Driver compliance is tracked via `DriverDocument` linked to the driver's `Cab`.
- Expiry date warnings are active (warning indicator if within 2 weeks of expiry or past expiry).
- Next audit dates are auto-calculated as 3 months from the upload date.
- Admin can review all documents, dates, and preview links directly under the **Driver** column on the **Cabs Desk** (`/dashboard/admin/operations/cabs`).

---

## 4. Common Developer Actions

- **Run Prisma Studio**:
  ```bash
  npx prisma studio
  ```
- **Sync/Generate Prisma Schema**:
  ```bash
  npx prisma db push
  npx prisma generate
  ```
- **Check Types & Lints**:
  ```bash
  npx tsc --noEmit
  ```
