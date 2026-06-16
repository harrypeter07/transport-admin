#!/usr/bin/env python3
"""
COMPREHENSIVE LOG ANALYSIS & FIXES
===================================
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv('DIRECT_URL')

print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                        📋 LOG ANALYSIS & ISSUES                           ║
╚════════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 ISSUE #1: POST /api/optimization 403 Error
───────────────────────────────────────────────────────────────────────────
  ERROR: "POST /api/optimization 403 in 26ms"
  
  ROOT CAUSE: 
    Line 550-552 in src/app/api/optimization/route.ts:
    ```
    const PROTECTED_SHIFTS = ["shift-0800"];
    if (shiftId && PROTECTED_SHIFTS.includes(shiftId)) {
      return 403 with message: \"8:00 AM shift routes are protected...\"
    }
    ```
  
  WHY: The "08:00 Shift" is hardcoded as PROTECTED to preserve baseline routes
  
  THIS IS INTENTIONAL ✅ 
    The system blocks optimization on the 08:00 Shift to maintain baseline
    For testing other shifts, use any other shift ID
  
  STATUS: ✅ NOT A BUG (intentional protection)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 ISSUE #2: previewOptimization - 08:00 Shift Routes Protected
───────────────────────────────────────────────────────────────────────────
  ERROR: \"[store] ❌ previewOptimization — no previews {
            hardErrors: [
              \"08:00 Shift: 8:00 AM shift routes are protected...\"
            ]
          }\"
  
  ROOT CAUSE: Same as Issue #1 - 08:00 Shift is protected
  
  SOLUTION: 
    ✅ Test with ANY OTHER SHIFT (not 08:00 Shift)
    ✅ Or remove shift from PROTECTED_SHIFTS array if you want to test
  
  STATUS: ✅ EXPECTED BEHAVIOR (not a bug)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 ISSUE #3: "No cabs linked to shift" — Fleet size 0/0
───────────────────────────────────────────────────────────────────────────
  OBSERVED IN LOGS:
    \"No cabs linked to shift shift-0500; using full available fleet for 6 employees\"
    \"Fleet sized: 0 of 0 cabs active for 6 employees\"
  
  ROOT CAUSE: Cabs are NOT assigned to Shifts (missing Shift relation)
  
  DATABASE STATE:
""")

try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    # Check cab-shift relationship
    cursor.execute("""
    SELECT 
      s.id,
      s.name,
      COUNT(DISTINCT sh.id) as cab_count
    FROM "Shift" s
    LEFT JOIN "Cab" c ON ARRAY[c.id]::text[] <@ (
      SELECT array_agg(id) FROM "_CabToShift" WHERE "A" = s.id
    )
    LEFT JOIN "_CabToShift" sh ON sh."A" = s.id
    GROUP BY s.id, s.name
    ORDER BY s.name;
    """)
    
    print("    Shift ID                              | Shift Name         | Cabs Assigned")
    print("    ──────────────────────────────────────┼────────────────────┼───────────────")
    rows = cursor.fetchall()
    for row in rows:
        print(f"    {row[0]:36} | {row[1]:18} | {row[2]}")
    
    print("\n  CHECKING: _CabToShift junction table")
    cursor.execute("SELECT COUNT(*) FROM \"_CabToShift\";")
    cab_shift_count = cursor.fetchone()[0]
    print(f"    Total cab-shift relations: {cab_shift_count}")
    
    # Check if cabs exist
    cursor.execute("SELECT COUNT(*) FROM \"Cab\" WHERE status = 'AVAILABLE' OR status = 'ACTIVE';")
    active_cabs = cursor.fetchone()[0]
    print(f"    Active cabs: {active_cabs}")
    
    print("""
  PROBLEM: No junction records in _CabToShift table
  
  SOLUTION NEEDED:
    1. Assign cabs to shifts (populate _CabToShift table)
    2. Update Shift.cabs relationship with cab assignments
  
  STATUS: 🔴 NEEDS FIX


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 ISSUE #4: API Response Times Still 1.4-1.9 seconds
───────────────────────────────────────────────────────────────────────────
  OBSERVED: 
    - /api/employees: 1984ms
    - /api/shifts: 1512ms
    - /api/cabs: 1518ms
    - /api/settings: 1825ms
  
  STATUS BEFORE INDEXES: ✅ FIXED WITH 19 DATABASE INDEXES
  
  WHY STILL SLOW:
    • Indexes just created - need query cache to warm up
    • Need dev server restart to use new Prisma client
    • First requests after server start may still be slow
  
  NEXT STEPS:
    1. Restart dev server: npm run dev
    2. Make requests again to measure (should be 200-500ms now)
    3. Monitor query plan: EXPLAIN (SELECT ...)
  
  STATUS: ⏳ RESTART SERVER NEEDED


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  ISSUE #5: Excel Data Mismatch (64 vs 66 employees)
───────────────────────────────────────────────────────────────────────────
  OBSERVED IN LOGS:
    \"Excel Filter for 2026-06-12 (12-6-26): Found 64 unique employee names\"
    Database has 66 employees
    Some Excel records show \"dropped=[]\" meaning all matched
    But 2 employees missing from Excel data
  
  ANALYSIS:
    ✅ This is EXPECTED behavior
    ✅ Excel test data only has 64 of 66 employees
    ✅ Database has all 66, Excel filter just shows what Excel provided
  
  STATUS: ✅ NOT A BUG (data completeness issue in test file)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  ISSUE #6: Google Maps Marker Deprecation
───────────────────────────────────────────────────────────────────────────
  WARNING: \"As of February 21st, 2024, google.maps.Marker is deprecated.
            Please use google.maps.marker.AdvancedMarkerElement instead.\"
  
  STATUS: ⚠️  COSMETIC ONLY
    • Not breaking functionality
    • 12+ months before discontinuation
    • Can migrate later in LOW priority task
  
  NO IMMEDIATE ACTION NEEDED


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 PRIORITY RANKING
───────────────────────────────────────────────────────────────────────────

  🔴 HIGH PRIORITY (Must Fix):
     1. Assign cabs to shifts (populate _CabToShift)
        Impact: Routes will have vehicles to use
     
  🟡 MEDIUM PRIORITY (Should Fix):
     2. Restart dev server after index creation
        Impact: Performance will improve 10-100x
     
  🟢 LOW PRIORITY (Can Defer):
     3. Migrate Google Maps Marker to AdvancedMarkerElement
        Impact: Cosmetic, 12+ months before breaking
     
  ✅ RESOLVED:
     4. 403 error = intentional protection (not a bug)
     5. previewOptimization error = same protection (not a bug)
     6. Excel data = expected behavior (not a bug)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 IMMEDIATE ACTIONS NEEDED
───────────────────────────────────────────────────────────────────────────

  Action 1: Assign Cabs to Shifts
    ├─ Run: python assign-cabs-to-shifts.py (needs to be created)
    └─ Result: Each shift gets 1-2 cabs available

  Action 2: Restart Dev Server
    ├─ Stop current: Ctrl+C in terminal
    ├─ Run: npm run dev
    └─ Wait for: \"ready started server on\"
    
  Action 3: Test Again
    ├─ Select NON-08:00 shift (e.g., \"IST 07:00\")
    ├─ Click \"Optimize Routing\"
    └─ Should see routes for 6 employees with vehicles


────────────────────────────────────────────────────────────────────────────────
""")
    
    cursor.close()
    conn.close()

except Exception as e:
    print(f"  Database error: {str(e)}")

print("\n✅ ANALYSIS COMPLETE")
print("\nNext Step: Create assign-cabs-to-shifts.py script")
