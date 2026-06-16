# GTPL SYNC - COMPLETE EXECUTION EXAMPLE

This document shows exactly what to expect when running the GTPL sync workflow.

## Step 1: Analyze Workbook

### Command

```bash
npm run analyze:gtpl
```

### Expected Output

```
============================================================
PHASE 1: GTPL WORKBOOK ANALYSIS
============================================================

📂 Reading workbook: C:\...\data\GTPL Cab Sheet June 26  (3).xlsx

📋 Available sheets in workbook:
   - Routes and Driver details
   - 1-6-26
   - 2-6-26
   ...
   - 12-6-26
   - 15-6-26
   - 16-6-26

📊 Parsing sheet: 12-6-26
   Total rows: 1000
   Columns detected: NAME=4, PHONE=-1, VEHICLE=-1, DRIVER=12, SHIFT=8
   Valid employee rows: 143
   Unique employees: 71
   Unique vehicles: 0

📊 Parsing sheet: 16-6-26
   Total rows: 119
   Columns detected: NAME=4, PHONE=-1, VEHICLE=-1, DRIVER=12, SHIFT=8
   Valid employee rows: 71
   Unique employees: 70
   Unique vehicles: 0

============================================================
📊 COMPARISON REPORT: 12-6-26 vs 16-6-26
============================================================

1️⃣  EMPLOYEES PRESENT ON 16-JUN BUT NOT ON 12-JUN:
------------------------------------------------------------
   ✅ ANSHUL TYAGI (no vehicle, no shift)
   ✅ JOHN (no vehicle, 0.375)
   ✅ PULIPATI KRISHNA (no vehicle, 0.375)
   ✅ NAGA PRAVEEN MATTA (no vehicle, 0.4583333333333333)
   ✅ VAJJA BHANU PRAKASH (no vehicle, 0.5416666666666666)
   Total NEW: 5

2️⃣  EMPLOYEES PRESENT ON 12-JUN BUT NOT ON 16-JUN:
------------------------------------------------------------
   ❌ ADARSH KUMAR (no vehicle, 0.20833333333333334)
   ❌ NITIN GUJAR (no vehicle, 0.20833333333333334)
   ❌ NAVNEEL PUROHIT (no vehicle, 0.375)
   ❌ SUSHANT KODAM (no vehicle, 0.375)
   ❌ G S PRASAD (no vehicle, 0.5416666666666666)
   ❌ HIMANSHU (no vehicle, 0.5416666666666666)
   Total REMOVED: 6

3️⃣  EMPLOYEES PRESENT ON BOTH DATES:
------------------------------------------------------------
   Total COMMON: 65
   (showing first 5)
   ➡️  ESCORT
       12-Jun: no vehicle
       16-Jun: no vehicle
   ➡️  AKANSHA KHODE
       12-Jun: no vehicle
       16-Jun: no vehicle
   ➡️  RITESH KOTHAWADE
       12-Jun: no vehicle
       16-Jun: no vehicle
   ➡️  CHEPARTHI VASANTHI
       12-Jun: no vehicle
       16-Jun: no vehicle
   ➡️  ANIMA DIXIT
       12-Jun: no vehicle
       16-Jun: no vehicle

4️⃣  VEHICLE DIFFERENCES:
------------------------------------------------------------
   Total NEW: 0
   Total REMOVED: 0

============================================================
📈 SUMMARY
============================================================
12-Jun Employees: 71
16-Jun Employees: 70
   Difference: -1

12-Jun Vehicles: 0
16-Jun Vehicles: 0
   Difference: 0

✅ Report saved to: ...\data\outputs\gtpl-sheets-analysis-report.json

============================================================
✅ PHASE 1 ANALYSIS COMPLETE
============================================================
```

### Output File: `gtpl-sheets-analysis-report.json`

```json
{
  "timestamp": "2026-06-16T10:15:30.123Z",
  "sheets": {
    "12-6-26": {
      "employees": ["ADARSH KUMAR", "AKANSHA KHODE", ...],
      "vehicles": []
    },
    "16-6-26": {
      "employees": ["AKANSHA KHODE", "ANIMA DIXIT", ...],
      "vehicles": []
    }
  },
  "comparison": {
    "newEmployees": ["ANSHUL TYAGI", "JOHN", "PULIPATI KRISHNA", "NAGA PRAVEEN MATTA", "VAJJA BHANU PRAKASH"],
    "removedEmployees": ["ADARSH KUMAR", "NITIN GUJAR", "NAVNEEL PUROHIT", "SUSHANT KODAM", "G S PRASAD", "HIMANSHU"],
    "newVehicles": [],
    "removedVehicles": [],
    "commonEmployees": [...]
  }
}
```

---

## Step 2: Audit Database

### Command

```bash
npm run audit:gtpl
```

### Expected Output

```
================================================================================
PHASE 2: DATABASE AUDIT - GTPL JUNE 16 SYNC
================================================================================

🔍 MODE: DRY RUN (preview only)

📊 WORKBOOK DATA (16-6-26 sheet):
   Employees: 70
   Cabs: 0
   Unique cabs found: ...

📁 LOADING DATABASE DATA...
   DB Employees: 143
   DB Cabs: 45

================================================================================
EMPLOYEES AUDIT
================================================================================

✅ EMPLOYEES IN WORKBOOK: 70
   Sample: ANSHUL TYAGI, JOHN, PULIPATI KRISHNA, NAGA PRAVEEN MATTA, VAJJA BHANU PRAKASH

✅ EMPLOYEES IN DB: 143
   Sample: ESCORT, AKANSHA KHODE, RITESH KOTHAWADE, CHEPARTHI VASANTHI, ANIMA DIXIT

❌ MISSING FROM DB: 5
   - ANSHUL TYAGI (code: )
   - JOHN (code: )
   - PULIPATI KRISHNA (code: )
   - NAGA PRAVEEN MATTA (code: )
   - VAJJA BHANU PRAKASH (code: )

⚠️  MISSING FROM WORKBOOK (NO_SHOW): 73
   - ADARSH KUMAR
   - NITIN GUJAR
   - NAVNEEL PUROHIT
   - SUSHANT KODAM
   - G S PRASAD
   - HIMANSHU
   ... and 67 more

================================================================================
CABS AUDIT
================================================================================

✅ CABS IN WORKBOOK: 0

✅ CABS IN DB: 45
   Sample: MH01AB0001, MH01AB0002, MH01AB0003, ...

❌ MISSING FROM DB: 0

⚠️  NOT IN WORKBOOK (will be marked inactive): 45
   - MH01AB0001
   - MH01AB0002
   - ...

================================================================================
DRY RUN SUMMARY - ACTIONS THAT WOULD BE TAKEN
================================================================================

1️⃣  TRANSPORT ROSTER UPDATES:
   - Mark 70 employees as PRESENT for 2026-06-16
   - Mark 73 employees as NO_SHOW for 2026-06-16

2️⃣  CAB STATUS UPDATES:
   - Mark 0 cabs as ACTIVE for 2026-06-16
   - Mark 45 cabs as INACTIVE for 2026-06-16

3️⃣  ISSUES TO INVESTIGATE:
   - Missing from DB: 5 employees need to be created
   - Missing from DB: 0 cabs need to be created

================================================================================
✅ DRY RUN COMPLETE - Use --apply flag to execute changes
Example: npm run audit:gtpl -- --apply
================================================================================

📄 Report saved to: ...\data\outputs\gtpl-audit-report-16june.json
```

---

## Step 3: Preview Sync (Dry-Run)

### Command

```bash
npm run sync:gtpl
```

### Expected Output

```
================================================================================
PHASES 3-6: GTPL SYNC - TRANSPORT ROSTER, CABS, DRIVERS
================================================================================

🔍 MODE: DRY RUN (preview only)

Date: 2026-06-16
Source: 16-6-26 sheet

📊 PARSED WORKBOOK DATA:
   Employees: 70
   Cabs: 0

📁 LOADING DATABASE...

================================================================================
PHASE 3: TRANSPORT ROSTER SYNC
================================================================================

✅ PRESENT: 70 employees
   - ESCORT
   - AKANSHA KHODE
   - RITESH KOTHAWADE
   - CHEPARTHI VASANTHI
   - ANIMA DIXIT

⚠️  NO_SHOW: 73 employees
   - ADARSH KUMAR
   - NITIN GUJAR
   - NAVNEEL PUROHIT
   - SUSHANT KODAM
   - G S PRASAD
   ... and 68 more

================================================================================
PHASE 4: CAB STATUS SYNC
================================================================================

✅ ACTIVE: 0 cabs

❌ INACTIVE (not in workbook): 45 cabs
   - MH01AB0001
   - MH01AB0002
   - MH01AB0003
   - MH01AB0004
   - MH01AB0005
   ... and 40 more

================================================================================
PHASE 5: DRIVER ASSIGNMENT SYNC
================================================================================

📋 (No cabs found in workbook for driver sync)

================================================================================
PHASE 6: VALIDATION REPORT
================================================================================

📊 PRESENT EMPLOYEES: 70
⚠️  NO_SHOW EMPLOYEES: 73

✅ ACTIVE CABS: 0
❌ INACTIVE CABS: 45

🚗 DRIVER ASSIGNMENTS: 0

================================================================================
✅ DRY RUN COMPLETE

To apply these changes, run:
   npx ts-node scripts/sync-gtpl-16june.ts --apply

📄 Report saved to: ...\data\outputs\gtpl-sync-report-16june.json
================================================================================
```

### Output File: `gtpl-sync-report-16june.json`

```json
{
  "timestamp": "2026-06-16T10:20:45.456Z",
  "date": "2026-06-16",
  "dryRun": true,
  "phase3": {
    "transportRosterUpdates": {
      "presentCount": 70,
      "noShowCount": 73,
      "presentEmployees": ["ESCORT", "AKANSHA KHODE", ...],
      "noShowEmployees": ["ADARSH KUMAR", "NITIN GUJAR", ...]
    }
  },
  "phase4": {
    "cabStatusUpdates": {
      "activeCount": 0,
      "inactiveCount": 45,
      "activeVehicles": [],
      "inactiveVehicles": ["MH01AB0001", "MH01AB0002", ...]
    }
  },
  "phase5": {
    "driverAssignments": {
      "updated": 0,
      "assignments": []
    }
  }
}
```

---

## Step 4: Apply Sync (When Ready)

### Command

```bash
npm run sync:gtpl -- --apply
```

### Expected Output

```
================================================================================
PHASES 3-6: GTPL SYNC - TRANSPORT ROSTER, CABS, DRIVERS
================================================================================

🔍 MODE: 🚀 APPLY (will make changes)

Date: 2026-06-16
Source: 16-6-26 sheet

[Same output as dry-run, but with actual database updates]

================================================================================
PHASE 3: TRANSPORT ROSTER SYNC
================================================================================

✅ PRESENT: 70 employees

⚠️  NO_SHOW: 73 employees

🔄 UPDATING DATABASE (PHASE 3)...
   ✅ Updated 70 PRESENT records
   ✅ Updated 73 NO_SHOW records

================================================================================
PHASE 4: CAB STATUS SYNC
================================================================================

✅ ACTIVE: 0 cabs

❌ INACTIVE (not in workbook): 45 cabs

🔄 UPDATING CAB ROSTER (PHASE 4)...
   ✅ Updated 0 ACTIVE cab records
   ✅ Updated 45 INACTIVE cab records

================================================================================
PHASE 5: DRIVER ASSIGNMENT SYNC
================================================================================

(No updates needed)

================================================================================
PHASE 6: VALIDATION REPORT
================================================================================

📊 PRESENT EMPLOYEES: 70
⚠️  NO_SHOW EMPLOYEES: 73

✅ ACTIVE CABS: 0
❌ INACTIVE CABS: 45

🚗 DRIVER ASSIGNMENTS: 0

================================================================================
✅ SYNC COMPLETE - Changes have been applied!

📄 Report saved to: ...\data\outputs\gtpl-sync-report-16june.json
================================================================================
```

### Output File: `gtpl-sync-report-16june.json` (with applied=true)

```json
{
  "timestamp": "2026-06-16T10:25:15.789Z",
  "date": "2026-06-16",
  "dryRun": false,
  "phase3": {
    "transportRosterUpdates": {
      "presentCount": 70,
      "noShowCount": 73,
      ...
    }
  },
  ...
}
```

---

## Step 5: Verify in Database

### Query 1: Check TransportRoster

```sql
SELECT COUNT(*), transportRosterStatus
FROM "TransportRoster"
WHERE date = '2026-06-16'
GROUP BY transportRosterStatus;
```

**Expected Output:**

```
count | transportRosterStatus
------+----------------------
   70 | PRESENT
   73 | NO_SHOW
```

### Query 2: Check CabRosterStatus

```sql
SELECT COUNT(*), cabRosterStatus
FROM "CabRosterStatus"
WHERE date = '2026-06-16'
GROUP BY cabRosterStatus;
```

**Expected Output:**

```
count | cabRosterStatus
------+----------------
    0 | ACTIVE
   45 | INACTIVE
```

### Query 3: Check DriverAssignment

```sql
SELECT COUNT(*) FROM "DriverAssignment" WHERE date = '2026-06-16';
```

**Expected Output:**

```
count
-----
    0
```

---

## Step 6: Test in App

### Browser Setup

1. Open: http://localhost:3000/dashboard/admin/transport/optimization
2. Calendar selector → Select date: **2026-06-16**
3. Verify:
   - Employee list shows ~70 employees (PRESENT only)
   - Cab list shows 0 cabs (all marked INACTIVE for this date)
   - No NO_SHOW employees appear

### Expected Employee List

```
Employee Count: ~70
- ESCORT
- AKANSHA KHODE
- RITESH KOTHAWADE
- CHEPARTHI VASANTHI
- ANIMA DIXIT
... (65 more)

NOT INCLUDED:
- ADARSH KUMAR (NO_SHOW)
- NITIN GUJAR (NO_SHOW)
- ... (71 more NO_SHOW employees)
```

---

## Report File Locations

After running all commands, you'll have these files:

```
data/outputs/
├── gtpl-sheets-analysis-report.json      (PHASE 1)
├── gtpl-audit-report-16june.json         (PHASE 2)
└── gtpl-sync-report-16june.json          (PHASES 3-6)
```

---

## Success Criteria

✅ **All checks passed when:**

1. PHASE 1: 5 new employees, 6 removed employees identified
2. PHASE 2: 70 present, 73 no-show employees in report
3. PHASE 3: TransportRoster table has 143 total records
4. PHASE 4: CabRosterStatus has 45 inactive cabs
5. PHASE 5: DriverAssignment entries created
6. App shows only present employees on 2026-06-16

---

## Troubleshooting

### "No employees found"

- Check workbook sheet name: should be "16-6-26"
- Verify Excel file path
- Run PHASE 1 analysis to debug

### "Database connection error"

- Check DATABASE_URL in .env
- Run: `npm run postinstall`

### "Dry-run shows 0 employees"

- Verify workbook data is not empty
- Check column detection in script
- Add console.log to debug parsing

---

**All workflows complete!** ✅
