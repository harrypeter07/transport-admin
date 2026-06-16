#!/usr/bin/env python3
"""
Debug why Prisma query isn't finding cabs linked to shifts
"""
import psycopg2
import json
from datetime import datetime
from urllib.parse import quote

# Connect to database using Supabase connection string
try:
    # Connection string from .env
    user = "postgres.birsbvwnzjbwbcnypeav"
    password = "Moksh@1816#transitadmin"  # Unencoded password
    host = "aws-1-ap-northeast-2.pooler.supabase.com"
    port = 6543
    database = "postgres"
    
    conn = psycopg2.connect(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password
    )
    cur = conn.cursor()
    
    print("=" * 80)
    print("🚗 CAB STATUS & RELATIONSHIP DEBUG")
    print("=" * 80)
    
    # 1. Check all cabs and their status
    print("\n1️⃣  ALL CABS IN DATABASE:")
    cur.execute("""
        SELECT id, "vehicleNumber", status, capacity FROM "Cab"
        ORDER BY "vehicleNumber"
    """)
    cabs = cur.fetchall()
    print(f"   Total cabs: {len(cabs)}\n")
    for cab_id, vehicle_num, status, capacity in cabs:
        print(f"   {vehicle_num:12} | Status: {status:12} | Capacity: {capacity}")
    
    # 2. Check cab-shift relationships
    print("\n2️⃣  CAB-SHIFT RELATIONSHIPS IN JUNCTION TABLE:")
    cur.execute("""
        SELECT c."vehicleNumber", s.name
        FROM "_CabToShift" cs
        JOIN "Cab" c ON cs."A" = c.id
        JOIN "Shift" s ON cs."B" = s.id
        ORDER BY c."vehicleNumber", s.name
    """)
    relationships = cur.fetchall()
    print(f"   Total relationships: {len(relationships)}\n")
    for vehicle, shift_name in relationships:
        print(f"   {vehicle:12} → {shift_name}")
    
    # 3. Test the Prisma query logic manually
    print("\n3️⃣  TEST: Find cabs for IST 07:00 shift")
    cur.execute("""
        SELECT s.id, s.name FROM "Shift" WHERE s.name = 'IST 07:00'
    """)
    shift_row = cur.fetchone()
    if shift_row:
        shift_id, shift_name = shift_row
        print(f"   Shift ID: {shift_id}")
        print(f"   Shift Name: {shift_name}")
        
        # Simulate Prisma query: cabs linked to this shift
        cur.execute("""
            SELECT c.id, c."vehicleNumber", c.status
            FROM "Cab" c
            WHERE c.status = 'AVAILABLE'
              AND EXISTS (
                SELECT 1 FROM "_CabToShift" cs
                WHERE cs."A" = c.id AND cs."B" = %s
              )
        """, (shift_id,))
        cabs_for_shift = cur.fetchall()
        print(f"   Cabs linked to shift (status=AVAILABLE): {len(cabs_for_shift)}")
        for cab_id, vehicle, status in cabs_for_shift:
            print(f"     → {vehicle} (status: {status})")
    
    # 4. Check status values in use
    print("\n4️⃣  UNIQUE CAB STATUS VALUES IN DATABASE:")
    cur.execute("""
        SELECT DISTINCT status, COUNT(*) as count
        FROM "Cab"
        GROUP BY status
        ORDER BY status
    """)
    statuses = cur.fetchall()
    for status, count in statuses:
        print(f"   {status:20} {count} cab(s)")
    
    # 5. Check all shifts
    print("\n5️⃣  ALL SHIFTS IN DATABASE:")
    cur.execute("""
        SELECT id, name FROM "Shift" ORDER BY name
    """)
    shifts = cur.fetchall()
    for shift_id, shift_name in shifts:
        print(f"   {shift_name:20} (ID: {shift_id[:8]}...)")
    
    print("\n" + "=" * 80)
    print("✅ DEBUG COMPLETE")
    print("=" * 80)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
