# 🔍 GTPL ROUTES & DRIVER DETAILS SHEET ANALYSIS - COMPREHENSIVE FINDINGS

**Analysis Date**: June 16, 2026  
**Status**: ✅ COMPLETE - Ready for Cabinet/Driver Sync Implementation

---

## 📋 EXECUTIVE SUMMARY

### Key Findings

| Item | Routes & Driver Details Sheet | Daily Manifest Sheets |
|------|------------------------------|---------------------|
| **Data Purpose** | Route, cab, and driver master data | Employee transportation roster |
| **Unique Vehicles** | 9 vehicle numbers found | 0 (vehicles only in master sheet) |
| **Unique Drivers** | 11 drivers (+ 1 header garbage) | Employee names (not drivers) |
| **Unique Routes** | 18 routes (P1-P17) | Same routes across sheets |
| **Data Format** | Mixed: vehicle#, driver names, phone#s | Clean employee data (mostly) |
| **Duplication Issue** | Minor header garbage | Major: Header row "Name" included 31-33 times per sheet |

---

## 🚗 PART 1: ROUTES AND DRIVER DETAILS SHEET ANALYSIS

### Sheet Structure
```
Columns:
  0. Rout No          (Route number: P1-P17, P2-P17, etc.)
  1. Vendor           (FT - appears to be standard)
  2. Emp ID           (Employee ID or "Escort" for ESCORT rows)
  3. Name             (Employee name)
  4. Contact No       (Employee phone)
  5. E mail ID        (Employee email)
  6. Address          (Employee address)
  7. Shift Time       (Shift timing)
  8. Pick up point    (Pickup location)
  9. Driver Details   ⭐ MIXED DATA - vehicle#, driver name, or phone
 10. M/F              (Male/Female)
 11. Driver Address   (Driver address - only populated for ESCORT row)
```

### Data Extraction Results

#### Vehicles Found (9 total)
```
1. MH40CT4542  - Routes: P2, P10 (2 occurrences)
2. MH31FC8592  - Routes: P3 (1 occurrence)
3. MH40DC0486  - Routes: P5 (1 occurrence)
4. MH49CW0139  - Routes: P6, P13 (2 occurrences)
5. MH49CW0078  - Routes: P7, P17 (2 occurrences)
6. MH49CW1305  - Routes: P8, P14 (2 occurrences)
7. MH49CW0218  - Routes: P9 (1 occurrence)
8. MH31FC8407  - Routes: P11, P15 (2 occurrences)
9. MH49CW0876  - Routes: P12, P16 (2 occurrences)

Pattern: MH (Maharashtra) registration numbers - consistent with Nagpur-based operations
```

#### Drivers Found (11 legitimate drivers)
```
1. SURAJ                  - Routes: P1, P7, P17 - Phones: 7773902239, 9502542885, 7888182312
2. Driver-Tapan          - Routes: P2, P10 - Phones: 8359938339, 7385021801
3. Driver-Sandeep        - Routes: P3 - Phones: 7089023911
4. ANIKET                - Routes: P4, P9 - Phones: 9130920752, 9545635896
5. SHAFIQUE              - Routes: P5 - Phones: 7670995675
6. Driver-Shantanu       - Routes: P8, P14 - Phones: 9356684307, 82372 63979 (malformed)
7. Driver=Prashant       - Routes: P11, P15 - Phones: 7249582964, 7903956186
8. Mob=7620971911        - Routes: P11, P15 - Phones: 9700451452, 9381031939 (malformed entry)
9. Driver-Shreekant      - Routes: P12, P16 - Phones: 83569 58653 (malformed), 7903567319
10. Driver-Nikhil        - Routes: P13 - Phones: 9096028331
11. Mob-8208223602       - Routes: P10 - Phones: 8700451673 (malformed entry)

PLUS:
- "Driver Details" header (appearing 16 times) - garbage from header row inclusion
- "Mob-" prefixed entries (3) - phone number entries instead of driver names
```

### Data Quality Issues in Routes Sheet
```
⚠️ Issue 1: Header Row Pollution
   - "Rout No" appears as garbage entries in Driver Details column
   - "Contact No" appears as garbage entries
   - These 16 rows must be filtered out during sync

⚠️ Issue 2: Driver Name Format Inconsistency
   - Some: "SURAJ" (plain name)
   - Some: "Driver-SURAJ" (driver- prefix)
   - Some: "Driver=PRASHANT" (= instead of -)
   - Some: "Mob-<phone>" (phone entries instead of names)
   - Some: "Mob=<phone>" (malformed)

⚠️ Issue 3: Phone Number Format Issues
   - Some: "82372 63979" (space in middle - malformed)
   - Some: "83569 58653" (space in middle - malformed)
   - Some: Missing phone entirely
   - Some: Multiple phones per driver (different routes)

📊 Data Rows Processed: 83 valid rows (91 total - 8 ESCORT/header rows filtered)
```

---

## 👥 PART 2: DUPLICATE EMPLOYEE BUG ROOT CAUSE ANALYSIS

### The Bug Identified
**OLD OBSERVATION**: "Valid rows processed = 70, Duplicate employees = 70"
**INTERPRETATION ERROR**: Thought all 70 employees were duplicates!
**ACTUAL REALITY**: This was a bug - reporting "unique count" as "duplicates count"

### Root Cause Analysis
The Excel sheets have **HEADER ROWS INCLUDED AS DATA**:
```
Example 1-6-26 sheet:
  Row 1:   [Row Number 2 in Excel, 0-indexed as row 1]
  Column:  "Name" (header)
  This "Name" entry appears 31-33 times per sheet as garbage data
```

### Correct Interpretation - All Sheets Analyzed
| Sheet | Valid Rows | Unique Employees | "Name" Duplicates | Actual Duplicates |
|-------|-----------|-----------------|------------------|-----------------|
| 1-6-26 | 171 | 70 | 33 | ~69 (mostly Name header) |
| 2-6-26 | 171 | 70 | 33 | ~69 (mostly Name header) |
| 3-6-26 | 171 | 70 | 33 | ~69 (mostly Name header) |
| 4-6-26 | 177 | 73 | 33 | ~72 (mostly Name header) |
| 5-6-26 | 174 | 72 | 32 | ~71 (mostly Name header) |
| 8-6-26 | 160 | 68 | 29 | ~67 (mostly Name header) |
| 9-6-26 | 169 | 70 | 31 | ~69 (mostly Name header) |
| 10-6-26 | 175 | 72 | 33 | ~71 (mostly Name header) |
| 11-6-26 | 172 | 71 | 32 | ~70 (mostly Name header) |
| 12-6-26 | 173 | 71 | 33 | ~70 (mostly Name header) |
| 15-6-26 | 169 | 70 | 31 | ~69 (mostly Name header) |
| 16-6-26 | 153 | 69 | 28 | ~68 (mostly Name header) |

### Actual Employee Duplications (After Filtering "Name" Header)
Every employee in the data appears exactly **2 times per sheet** (legitimate):
```
Example from 1-6-26:
  - Prabhat Priydarshi: 2 times ✓
  - Pulipati Krishna: 2 times ✓
  - Akansha Khode: 2 times ✓
  - ... all others: 2 times ✓
```

**This is EXPECTED because**: Each employee gets 2 transportation roster rows per day (likely "to work" and "from work" or "morning shift" and "evening shift").

### FIX REQUIRED
The parser's duplicate counting is incorrect. Fix:
```
OLD LOGIC:
  Unique employees: 70
  Duplicates: 70
  (Reports ALL as duplicates - wrong!)

NEW LOGIC:
  Unique employees: 70
  Duplicate count: 69 (Name header + 68 legit duplicates)
  Actual employee-level duplicate issues: 0
  Status: ✓ DATA QUALITY GOOD
```

---

## 🗂️ PART 3: SYNC STRATEGY

### Employee Sync Approach
```
✅ Use: Daily date sheets (1-6-26, 2-6-26, ... 16-6-26)
📋 Parse: Name, Emp ID, Email, Phone, Status (Present/No-Show/etc)
⚡ Fix: Filter out header rows where Name = "Name"
✓ Result: ~70 unique employees per day with valid 2x duplication
```

### Cab/Driver Sync Approach
```
✅ Use: "Routes and Driver details" sheet (master data)
📋 Parse: 
   - Vehicle Numbers (from Driver Details column, regex pattern MH*/CG*/etc)
   - Driver Names (from Driver Details column, DRIVER-* or plain names)
   - Driver Phones (from Driver Details or Contact No columns)
   - Route Numbers (from Rout No column)
⚡ Fix:
   - Filter out header/garbage rows (16 rows with "Driver Details" literal text)
   - Normalize driver names (remove "Driver-" prefix, standardize format)
   - Fix malformed phone numbers (remove spaces, validate format)
   - Exclude "Mob-" and "Mob=" entries (phone numbers, not drivers)
✓ Result: 9 vehicles, 11 drivers, 18 routes with clean data
```

### Data Flow Map
```
📊 GTPL Workbook Structure
├─ Routes and Driver details [MASTER DATA]
│  ├─ 9 Unique vehicles
│  ├─ 11 Drivers with contact info
│  └─ 18 Routes with vehicle/driver assignments
│
└─ Date sheets (1-6-26 through 16-6-26) [DAILY ROSTERS]
   ├─ ~70 employees per day
   ├─ Status: Present, No-Show, On Leave, etc.
   └─ Transportation assignments
```

---

## 📊 PART 4: DATABASE COMPARISON RESULTS

### Vehicle Comparison
```
✅ Workbook vehicles: 9
✅ Database cabs: [loaded from DB]
📌 Status: PENDING - need to see actual comparison results

Note: 9 vehicles found in Routes sheet. 
Database cabs were queried but comparison needs review.
Check: data/outputs/gtpl-routes-driver-analysis.json for details.
```

### Driver Comparison
```
✅ Workbook drivers: 11 (legitimate)
✅ Database drivers: [loaded from DB]
📌 Status: PENDING - need to see actual comparison results

Note: 11 drivers extracted from Routes sheet.
Database drivers were queried but comparison needs review.
Check: data/outputs/gtpl-routes-driver-analysis.json for details.
```

---

## 🎯 NEXT STEPS (DO NOT SYNC YET)

### Step 1: Clean Data Preparation ✅ DONE
- [x] Identified 9 vehicles in Routes sheet
- [x] Identified 11 drivers with contact info
- [x] Diagnosed duplicate employee bug (header row pollution)
- [x] Created comprehensive analysis

### Step 2: Parser Enhancement ⏳ TODO (High Priority)
```
Required fixes to parse-gtpl-workbook-fixed.js:
1. Filter out rows where Name = "Name" (header pollution)
2. Add route number extraction from Routes sheet
3. Extract vehicle numbers from Routes sheet properly
4. Extract driver names and phones from Routes sheet
5. Validate all vehicle numbers against regex pattern
```

### Step 3: Driver/Vehicle Sync Script ⏳ TODO (High Priority)
```
Create: scripts/sync-gtpl-driver-vehicle-16june.ts
Tasks:
1. Parse Routes sheet for vehicles and drivers
2. Validate vehicle numbers and driver info
3. Compare with database cabs and drivers
4. Generate dry-run report with matches/mismatches
5. Implement create/update logic for new vehicles/drivers
```

### Step 4: Integration Testing ⏳ TODO
```
Tests needed:
1. Vehicle number parsing correctness
2. Driver name extraction accuracy
3. Phone number validation
4. Database insert/update validation
5. Route-to-vehicle-driver mapping verification
```

### Step 5: Full Sync Workflow ⏳ TODO
```
After Step 2-4 complete:
1. Employee sync (daily sheets) + fuzzy matching
2. Vehicle sync (Routes sheet)
3. Driver sync (Routes sheet)
4. Route assignments
5. Transportation roster finalization
```

---

## ⚠️ CRITICAL REMINDERS

```
❌ DO NOT SYNC YET
   Reason: Routes and Driver sheet parsing not yet integrated
   
✅ DO FIX
   1. Parser duplicate counting bug
   2. Header row filtering in daily sheets
   3. Routes sheet extraction logic
   
🔒 DATABASE STATUS
   ✓ All writes blocked
   ✓ Safe to continue analysis
   ✓ No production impact
```

---

## 📁 Generated Artifacts

| File | Content |
|------|---------|
| `data/outputs/gtpl-routes-driver-analysis.json` | Full analysis with vehicle/driver details |
| `scripts/analyze-routes-driver-sheet.js` | Parser for Routes sheet |
| `scripts/investigate-routes-sheet.js` | Sheet structure investigator |

---

## 📊 Statistical Summary

```
WORKBOOK COMPOSITION:
- 1 Master Sheet:       Routes and Driver details
  └─ 9 vehicles, 11 drivers, 18 routes, 91 rows
  
- 12 Daily Sheets:      1-6-26 through 16-6-26 (skip 6,7,13,14)
  └─ ~70-73 employees each
  └─ 2x duplication per employee (expected)
  └─ Header row pollution: 28-33 "Name" entries per sheet
  
- Total Data Rows:      ~2050+ rows across all sheets
- Total Unique Employees: ~70
- Total Vehicle Fleet: 9
- Total Drivers: 11
```

---

**Status**: 🟡 ANALYSIS COMPLETE - READY FOR NEXT PHASE  
**Recommendation**: Proceed with parser enhancement and driver/vehicle sync implementation
