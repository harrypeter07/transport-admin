-- Add performance indexes for frequently queried columns
-- These indexes will significantly speed up:
-- 1. Employee queries by shift
-- 2. Employee queries by zone
-- 3. Cab queries by status
-- 4. Route queries by shift
-- 5. TransportRoster queries by date

-- Employee indexes
CREATE INDEX IF NOT EXISTS "idx_employee_shift_id" ON "Employee"("shiftId");
CREATE INDEX IF NOT EXISTS "idx_employee_zone" ON "Employee"("zone");
CREATE INDEX IF NOT EXISTS "idx_employee_pickup_point_id" ON "Employee"("pickupPointId");
CREATE INDEX IF NOT EXISTS "idx_employee_status" ON "Employee"("status");

-- Cab indexes
CREATE INDEX IF NOT EXISTS "idx_cab_status" ON "Cab"("status");
CREATE INDEX IF NOT EXISTS "idx_cab_assigned_zone" ON "Cab"("assignedZone");

-- Route indexes
CREATE INDEX IF NOT EXISTS "idx_route_shift_id" ON "Route"("shiftId");
CREATE INDEX IF NOT EXISTS "idx_route_cab_id" ON "Route"("cabId");
CREATE INDEX IF NOT EXISTS "idx_route_date" ON "Route"("date");
CREATE INDEX IF NOT EXISTS "idx_route_status" ON "Route"("status");
CREATE INDEX IF NOT EXISTS "idx_route_zone" ON "Route"("zone");

-- RouteStop indexes
CREATE INDEX IF NOT EXISTS "idx_route_stop_route_id" ON "RouteStop"("routeId");
CREATE INDEX IF NOT EXISTS "idx_route_stop_employee_id" ON "RouteStop"("employeeId");

-- TransportRoster indexes (already has one)
CREATE INDEX IF NOT EXISTS "idx_transport_roster_employee_id" ON "TransportRoster"("employeeId");

-- CabRosterStatus indexes (already has one)
CREATE INDEX IF NOT EXISTS "idx_cab_roster_status_cab_id" ON "CabRosterStatus"("cabId");

-- User indexes
CREATE INDEX IF NOT EXISTS "idx_user_email" ON "User"("email");

-- OperationalEvent indexes
CREATE INDEX IF NOT EXISTS "idx_operational_event_route_id" ON "OperationalEvent"("routeId");
CREATE INDEX IF NOT EXISTS "idx_operational_event_timestamp" ON "OperationalEvent"("timestamp");

-- Violation indexes
CREATE INDEX IF NOT EXISTS "idx_violation_route_id" ON "Violation"("routeId");
