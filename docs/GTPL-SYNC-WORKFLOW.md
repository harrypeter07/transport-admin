# GTPL JUNE 16 MASTER DATA SYNC

Complete workflow for synchronizing the GTPL workbook data with the database while maintaining data integrity and date-specific roster information.

## Overview

This workflow implements 8 phases to safely audit and sync GTPL workbook data:

- **PHASE 1**: Workbook analysis (12-Jun vs 16-Jun comparison)
- **PHASE 2**: Database audit (preview/dry-run)
- **PHASE 3**: Transport roster sync (PRESENT/NO_SHOW status)
- **PHASE 4**: Cab status sync (ACTIVE/INACTIVE)
- **PHASE 5**: Driver assignment sync (normalize names/phones)
- **PHASE 6**: Validation report
- **PHASE 7**: App behavior (date-specific filtering)
- **PHASE 8**: Safety (--apply flag, dry-run by default)

## Prerequisites

✅ Prisma schema updated with TransportRoster, CabRosterStatus, DriverAssignment models
✅ Database migrations applied
✅ GTPL workbook at: `data/GTPL Cab Sheet June 26  (3).xlsx`

## Scripts Created

### 1. **analyze-gtpl-sheets.js** - PHASE 1: Workbook Analysis

Compares two sheets in the workbook and generates difference report.

**Usage:**

```bash
npm run analyze:gtpl
```

**Output:**

- Employees present on 16-Jun but not 12-Jun (NEW)
- Employees present on 12-Jun but not 16-Jun (REMOVED)
- Vehicle differences (new/removed)
- Report saved to: `data/outputs/gtpl-sheets-analysis-report.json`

**Example Results:**

```
NEW EMPLOYEES (5):
✅ Anshul Tyagi
✅ John
✅ Pulipati Krishna
✅ Naga Praveen Matta
✅ Vajja Bhanu Prakash

REMOVED EMPLOYEES (6):
❌ Adarsh Kumar
❌ Nitin Gujar
❌ Navneel Purohit
❌ Sushant Kodam
❌ G S Prasad
❌ Himanshu
```

---

### 2. **audit-gtpl-16june.ts** - PHASE 2: Database Audit

Compares workbook (16-Jun sheet) against current database. PREVIEW ONLY - no changes made.

**Usage (Dry-run by default):**

```bash
npm run audit:gtpl
```

**Output:**

- Employees in workbook vs database
- Employees missing from database
- Employees missing from workbook (NO_SHOW)
- Cabs audit (active/inactive)
- Missing cabs identification
- Report saved to: `data/outputs/gtpl-audit-report-16june.json`

**Example Output:**

```
EMPLOYEES IN WORKBOOK: 70
EMPLOYEES IN DB: 143

MISSING FROM DB: 5 employees
- ANSHUL TYAGI (code: )
- JOHN (code: )
- PULIPATI KRISHNA (code: )
- NAGA PRAVEEN MATTA (code: )
- VAJJA BHANU PRAKASH (code: )

MISSING FROM WORKBOOK (NO_SHOW): 73 employees
- ADARSH KUMAR
- NITIN GUJAR
- ... (70 more)
```

---

### 3. **sync-gtpl-16june.ts** - PHASES 3-6: Comprehensive Sync

Synchronizes all data with database. Requires `--apply` flag to make changes (dry-run by default).

**Usage (Dry-run preview):**

```bash
npm run sync:gtpl
```

**Usage (Apply changes):**

```bash
npm run sync:gtpl -- --apply
```

**PHASE 3: Transport Roster Sync**

- Marks employees present in workbook as `PRESENT` for 2026-06-16
- Marks employees not in workbook as `NO_SHOW` for 2026-06-16
- **IMPORTANT**: Does NOT deactivate employees globally
- Only sets date-specific roster status

**Database Update:**

```prisma
TransportRoster {
  employeeId: String
  date: "2026-06-16"
  transportRosterStatus: "PRESENT" | "NO_SHOW"
  sourceSheet: "16-6-26"
}
```

**PHASE 4: Cab Status Sync**

- Marks cabs in workbook as `ACTIVE` for 2026-06-16
- Marks cabs not in workbook as `INACTIVE` for 2026-06-16
- **IMPORTANT**: Does NOT delete cabs
- Keeps historical data

**Database Update:**

```prisma
CabRosterStatus {
  cabId: String
  date: "2026-06-16"
  cabRosterStatus: "ACTIVE" | "INACTIVE"
  activeForDate: DateTime | NULL
  inactiveForDate: DateTime | NULL
  sourceSheet: "16-6-26"
}
```

**PHASE 5: Driver Assignment Sync**

- Normalizes driver names from workbook
- Removes "Mob-xxxxxxxxxx" prefixes
- Updates driver assignments per cab/date

**Database Update:**

```prisma
DriverAssignment {
  cabId: String
  date: "2026-06-16"
  driverName: String (normalized)
  driverPhone: String (normalized)
}
```

**PHASE 6: Validation Report**
Summary of all updates made:

- Present employees count
- No-show employees count
- Active cabs count
- Inactive cabs count
- Driver assignments updated

---

## Dry-Run vs Apply

### Dry-Run (Default)

```bash
npm run sync:gtpl
```

**Output:**

- Shows what WOULD be updated
- No database changes made
- Safe to run multiple times
- Helpful for verification

```
🔍 MODE: DRY RUN (preview only)

PHASE 3: TRANSPORT ROSTER SYNC
✅ PRESENT: 70 employees
   - ESCORT
   - AKANSHA KHODE
   - ...

⚠️  NO_SHOW: 73 employees
   - ADARSH KUMAR
   - NITIN GUJAR
   - ...

DRY RUN COMPLETE - Use --apply flag to execute changes
Example: npm run sync:gtpl -- --apply
```

### Apply Mode

```bash
npm run sync:gtpl -- --apply
```

**Output:**

- Same preview as dry-run
- **Makes database changes**
- Updates TransportRoster table
- Updates CabRosterStatus table
- Updates DriverAssignment table
- Cannot be undone (use database backup if needed)

---

## Database Models

### TransportRoster

```prisma
model TransportRoster {
  id                  String   @id @default(uuid())
  employeeId          String
  employee            Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  date                String   // e.g. "2026-06-16"
  transportRosterStatus String  // PRESENT, NO_SHOW, ON_LEAVE, MEDICAL_LEAVE
  transportRosterDate DateTime @default(now())
  sourceSheet         String?  // e.g. "16-6-26"
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([employeeId, date])
  @@index([date])
}
```

### CabRosterStatus

```prisma
model CabRosterStatus {
  id                String   @id @default(uuid())
  cabId             String
  cab               Cab      @relation(fields: [cabId], references: [id], onDelete: Cascade)
  date              String   // e.g. "2026-06-16"
  cabRosterStatus   String   // ACTIVE, INACTIVE, MAINTENANCE
  activeForDate     DateTime?
  inactiveForDate   DateTime?
  sourceSheet       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([cabId, date])
  @@index([date])
}
```

### DriverAssignment

```prisma
model DriverAssignment {
  id                String   @id @default(uuid())
  cabId             String
  cab               Cab      @relation(fields: [cabId], references: [id], onDelete: Cascade)
  driverName        String
  driverPhone       String
  date              String   // e.g. "2026-06-16"
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([cabId, date])
}
```

---

## Application Behavior (PHASE 7)

After sync is complete, the optimization app filters data by date:

### When user selects date: 2026-06-16

**Employees displayed:**

```sql
-- Include only employees with PRESENT status
SELECT * FROM Employee
WHERE NOT EXISTS (
  SELECT 1 FROM TransportRoster
  WHERE date = "2026-06-16"
  AND transportRosterStatus = "NO_SHOW"
  AND employeeId = Employee.id
)
```

**Cabs displayed:**

```sql
-- Include only ACTIVE cabs for the date
SELECT * FROM Cab
WHERE EXISTS (
  SELECT 1 FROM CabRosterStatus
  WHERE date = "2026-06-16"
  AND cabRosterStatus = "ACTIVE"
  AND cabId = Cab.id
)
```

### When user selects date: 2026-06-12

**Employees displayed:**

```sql
-- 12-Jun roster still works independently
-- Uses TransportRoster entries for 2026-06-12
```

---

## Data Integrity Safeguards

✅ **No Global Employee Deactivation**

- Only date-specific roster status is updated
- Employee.status remains ACTIVE/INACTIVE
- Can work with multiple dates simultaneously

✅ **No Cab Deletion**

- Cabs marked as INACTIVE for specific dates
- Historical data preserved
- Can be reactivated for different dates

✅ **Driver Name Normalization**

- Removes "Mob-" prefixes
- Standardizes casing
- Prevents duplicate driver entries

✅ **Dry-Run Safety**

- Default mode is dry-run (preview only)
- Requires `--apply` flag to make changes
- All changes logged to report files

---

## Workflow Example

```bash
# Step 1: Analyze workbook (PHASE 1)
npm run analyze:gtpl
# Output: data/outputs/gtpl-sheets-analysis-report.json

# Step 2: Audit database (PHASE 2)
npm run audit:gtpl
# Output: data/outputs/gtpl-audit-report-16june.json

# Step 3: Preview sync (PHASES 3-6, dry-run)
npm run sync:gtpl
# Output: data/outputs/gtpl-sync-report-16june.json (dry-run)

# Step 4: Apply sync
npm run sync:gtpl -- --apply
# Output: data/outputs/gtpl-sync-report-16june.json (with applied=true)

# Step 5: Verify in app
# - Open optimization page
# - Select date 2026-06-16
# - Verify employee list shows only PRESENT employees
# - Verify cab list shows only ACTIVE cabs
```

---

## Report Files

All reports saved to: `data/outputs/`

1. **gtpl-sheets-analysis-report.json** - PHASE 1 workbook comparison
2. **gtpl-audit-report-16june.json** - PHASE 2 database audit
3. **gtpl-sync-report-16june.json** - PHASES 3-6 sync results (dry-run or applied)

Each report includes:

- Timestamp
- Source/target data
- Counts and lists
- Dryrun flag (if applicable)
- Field mappings

---

## Troubleshooting

### Script won't run

```bash
# Ensure Prisma schema is generated
npm run postinstall

# Try running sync script with full ts-node
npx ts-node --transpile-only scripts/sync-gtpl-16june.ts
```

### Database connection error

```bash
# Check .env variables
cat .env | grep DATABASE_URL

# Test connection
npm run db:seed -- --dry-run
```

### No employees found

- Check workbook sheet name (should be "16-6-26")
- Verify Excel file path: `data/GTPL Cab Sheet June 26  (3).xlsx`
- Run PHASE 1 analysis to verify workbook structure

### Want to revert changes

- Database: Use backup or restore from git
- TransportRoster: Delete date-specific entries
  ```sql
  DELETE FROM "TransportRoster" WHERE date = '2026-06-16';
  DELETE FROM "CabRosterStatus" WHERE date = '2026-06-16';
  DELETE FROM "DriverAssignment" WHERE date = '2026-06-16';
  ```

---

## Safety Checklist

Before running `--apply`:

- [ ] Database backup taken
- [ ] Dry-run output reviewed
- [ ] No conflicts with other date syncs
- [ ] Excel workbook validated
- [ ] Employee/cab counts verified
- [ ] Test environment has been used (if possible)

---

## Next Steps

1. Run analysis: `npm run analyze:gtpl`
2. Run audit: `npm run audit:gtpl`
3. Review reports in `data/outputs/`
4. Run sync (dry-run): `npm run sync:gtpl`
5. Apply changes: `npm run sync:gtpl -- --apply`
6. Test in app with date 2026-06-16
7. Verify employee filtering works correctly
