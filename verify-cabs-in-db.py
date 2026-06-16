#!/usr/bin/env python3
"""Verify cabs are actually in the database"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv('DIRECT_URL')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    print("\n🚗 VERIFYING CAB-SHIFT RELATIONSHIPS IN DATABASE\n")
    print("=" * 70)
    
    # Check total cabs
    cursor.execute('SELECT COUNT(*) FROM "Cab";')
    total_cabs = cursor.fetchone()[0]
    print(f"✅ Total Cabs in DB: {total_cabs}")
    
    # Check cab-shift junction table
    cursor.execute('SELECT COUNT(*) FROM "_CabToShift";')
    relations = cursor.fetchone()[0]
    print(f"✅ Total cab-shift relations: {relations}")
    
    if relations > 0:
        print("\n📊 CAB-SHIFT ASSIGNMENTS:\n")
        cursor.execute("""
        SELECT 
          s.name as shift_name,
          COUNT(c.id) as cab_count,
          STRING_AGG(c."vehicleNumber", ', ') as vehicles
        FROM "Shift" s
        LEFT JOIN "_CabToShift" cts ON s.id = cts."B"
        LEFT JOIN "Cab" c ON c.id = cts."A"
        GROUP BY s.id, s.name
        ORDER BY s.name;
        """)
        
        for row in cursor.fetchall():
            shift_name, cab_count, vehicles = row
            vehicles_str = vehicles if vehicles else "(none)"
            print(f"  {shift_name:20} → {cab_count} cab(s): {vehicles_str}")
    else:
        print("\n❌ WARNING: No cab-shift relations found!")
    
    print("\n" + "=" * 70)
    print("\n🔑 KEY FINDING:")
    if relations > 0:
        print(f"  ✅ Database HAS {relations} cab-shift relationships")
        print(f"  ⚠️  Dev server may not have reloaded Prisma client")
        print(f"\n💡 SOLUTION: Restart dev server")
        print(f"  1. Stop: Ctrl+C")
        print(f"  2. Clear: rm -r .next .prisma node_modules/.prisma")
        print(f"  3. Regenerate: npx prisma generate")
        print(f"  4. Restart: npm run dev")
    else:
        print(f"  ❌ Database does NOT have relationships")
        print(f"  Run assign-cabs-to-shifts.py again")
    
    cursor.close()
    conn.close()

except Exception as e:
    print(f"❌ ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
