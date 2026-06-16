#!/usr/bin/env python3
"""
ASSIGN CABS TO SHIFTS
This script distributes the 9 available cabs across 11 shifts
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv('DIRECT_URL')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    print("\n" + "="*70)
    print("🚗 ASSIGNING CABS TO SHIFTS")
    print("="*70)
    
    # Get all shifts
    cursor.execute('SELECT id, name FROM "Shift" ORDER BY name;')
    shifts = cursor.fetchall()
    
    # Get all active cabs
    cursor.execute('SELECT id, "vehicleNumber" FROM "Cab" WHERE status IN (\'AVAILABLE\', \'ACTIVE\') ORDER BY "vehicleNumber";')
    cabs = cursor.fetchall()
    
    print(f"\n📊 CURRENT STATE:")
    print(f"   Shifts: {len(shifts)}")
    print(f"   Available Cabs: {len(cabs)}")
    
    if len(cabs) == 0:
        print("\n❌ No active cabs found! Create cabs first.")
        exit(1)
    
    # Clear existing assignments
    cursor.execute('DELETE FROM "_CabToShift";')
    print(f"\n🧹 Cleared existing cab-shift assignments")
    
    # Distribute cabs to shifts
    # Strategy: Distribute 9 cabs across 11 shifts
    # Result: Most shifts get 1 cab, some get 0 (to balance)
    assignment_count = 0
    
    for idx, (shift_id, shift_name) in enumerate(shifts):
        # Assign cabs in round-robin
        # For 9 cabs and 11 shifts: shifts 0,1,2,3,4,5,6,7,8 get cabs, 9,10 get none
        if idx < len(cabs):
            cab_id, vehicle_num = cabs[idx]
            cursor.execute(
                'INSERT INTO "_CabToShift" ("A", "B") VALUES (%s, %s);',
                (cab_id, shift_id)
            )
            print(f"  ✅ {shift_name:20} ← {vehicle_num}")
            assignment_count += 1
        else:
            print(f"  ⏭️  {shift_name:20} (no cabs available)")
    
    conn.commit()
    
    print(f"\n{'='*70}")
    print(f"✅ ASSIGNMENT COMPLETE")
    print(f"{'='*70}")
    print(f"   Total assignments: {assignment_count} cab-shift pairs")
    print(f"   Coverage: {len([s for s in shifts if shifts.index(s) < len(cabs)])}/{len(shifts)} shifts")
    print(f"\n💡 RESULT:")
    print(f"   • Shifts 1-9: 1 cab each")
    print(f"   • Shifts 10-11: 0 cabs (will use any available)")
    print(f"   • Optimization can now route employees on cabs")
    
    cursor.close()
    conn.close()

except Exception as e:
    print(f"\n❌ ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
    exit(1)
