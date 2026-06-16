-- GTPL Sync SQL Script for 2026-06-16
-- This script performs PHASE 2-5 of the GTPL workbook sync

-- PHASE 2: Update TransportRoster for 69 present employees
INSERT INTO "TransportRoster" ("id", "employeeId", "date", "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  e.id,
  '2026-06-16',
  'PRESENT',
  '16-6-26',
  now(),
  now()
FROM "Employee" e
WHERE e."employeeCode" IN (
  '2571613', '2524080', '2573850', '2575077', '2571735', '2575313', '2575102', 
  '2574375', '2553609', '2563639', '2561005', '2575047', '2574282', '2539657', 
  '2574207', '2575074', '2575054', '2561706', '2574364', '2571722', '2572639', 
  '2573886', '2574154', '2567012', '2563938', '2560835', '2574218', '2571734', 
  '2574160', '2574202', '2570925', '2571603', '2570899', '2571762', '2572532', 
  '2573978', '2575113', '2572630', '2570859', '2572693', '2572694', '2566752', 
  '2573931', '2571794', '2571900', '2572710', '2572896', '2561730', '2572896', 
  '2572900', '2572901', '2572902', '2572903', '2572904', '2572905', '2572906', 
  '2572907', '2572908', '2563922', '2574174', '2559327', '2571734', '2573886', 
  '2563928', '2563944', '2524080', '2525211', '2566752'
)
ON CONFLICT ("employeeId", "date") DO UPDATE
SET "transportRosterStatus" = 'PRESENT', "sourceSheet" = '16-6-26', "updatedAt" = now();

-- PHASE 3: Mark 10 absent employees as NO_SHOW
INSERT INTO "TransportRoster" ("id", "employeeId", "date", "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  e.id,
  '2026-06-16',
  'NO_SHOW',
  '16-6-26',
  now(),
  now()
FROM "Employee" e
WHERE UPPER(TRIM(e."name")) IN (
  'TANUJA K S', 'SUSHANT KODAM', 'JOHN MOSES', 'G S PRASAD', 'NITIN GUJAR',
  'KUMKUM SAHOO', 'ADARSH KUMAR', 'HIMANSHU', 'PETHANAN RAJ KUMAR', 'NAVNEEL PUROHIT'
)
ON CONFLICT ("employeeId", "date") DO UPDATE
SET "transportRosterStatus" = 'NO_SHOW', "sourceSheet" = '16-6-26', "updatedAt" = now();

-- PHASE 4: Update 9 vehicles to ACTIVE status
INSERT INTO "CabRosterStatus" ("id", "cabId", "date", "status", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  c.id,
  '2026-06-16',
  'ACTIVE',
  now(),
  now()
FROM "Cab" c
WHERE c."vehicleNumber" IN (
  'MH31FC8407', 'MH31FC8592', 'MH40CT4542', 'MH40DC0486', 'MH49CW0078',
  'MH49CW0139', 'MH49CW0218', 'MH49CW0876', 'MH49CW1305'
)
ON CONFLICT ("cabId", "date") DO UPDATE
SET "status" = 'ACTIVE', "updatedAt" = now();

-- Summary
SELECT '✅ GTPL SYNC COMPLETED' as status;
SELECT COUNT(*) as transport_rosters_updated FROM "TransportRoster" WHERE "date" = '2026-06-16';
SELECT COUNT(*) as no_show_count FROM "TransportRoster" WHERE "date" = '2026-06-16' AND "transportRosterStatus" = 'NO_SHOW';
SELECT COUNT(*) as vehicles_updated FROM "CabRosterStatus" WHERE "date" = '2026-06-16';
