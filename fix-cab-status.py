#!/usr/bin/env python3
"""
Fix cab status from ACTIVE to AVAILABLE
This is why API couldn't find cabs - it was filtering for AVAILABLE but cabs were ACTIVE
"""
import psycopg2

try:
    user = "postgres.birsbvwnzjbwbcnypeav"
    password = "Moksh@1816#transitadmin"
    host = "aws-1-ap-northeast-2.pooler.supabase.com"
    port = 6543
    database = "postgres"
    
    conn = psycopg2.connect(
        host=host, port=port, database=database, user=user, password=password
    )
    cur = conn.cursor()
    
    print("=" * 80)
    print("🔧 FIXING CAB STATUS: ACTIVE → AVAILABLE")
    print("=" * 80)
    
    # Check before
    cur.execute('SELECT status, COUNT(*) FROM "Cab" GROUP BY status')
    print("\nBEFORE:")
    for status, count in cur.fetchall():
        print(f"  {status:12} {count} cab(s)")
    
    # Fix it
    cur.execute('''
        UPDATE "Cab"
        SET status = 'AVAILABLE'
        WHERE status = 'ACTIVE'
    ''')
    
    print(f"\n✅ Updated {cur.rowcount} cabs from ACTIVE to AVAILABLE")
    conn.commit()
    
    # Check after
    cur.execute('SELECT status, COUNT(*) FROM "Cab" GROUP BY status')
    print("\nAFTER:")
    for status, count in cur.fetchall():
        print(f"  {status:12} {count} cab(s)")
    
    # Verify relationships still exist
    cur.execute('SELECT COUNT(*) FROM "_CabToShift"')
    rel_count = cur.fetchone()[0]
    print(f"\n✅ Cab-shift relationships intact: {rel_count} relationships")
    
    # Verify actual cabs
    cur.execute('''
        SELECT c."vehicleNumber", c.status, s.name
        FROM "Cab" c
        LEFT JOIN "_CabToShift" cs ON c.id = cs."A"
        LEFT JOIN "Shift" s ON cs."B" = s.id
        ORDER BY c."vehicleNumber"
    ''')
    
    print("\n📊 CAB STATUS VERIFICATION:")
    for vehicle, status, shift in cur.fetchall():
        shift_str = f"→ {shift}" if shift else "(no shift)"
        print(f"  {vehicle:12} | {status:12} | {shift_str}")
    
    print("\n" + "=" * 80)
    print("✅ FIX COMPLETE")
    print("=" * 80)
    print("\n💡 Next: Restart dev server with Ctrl+C, then npm run dev")
    print("   The API will now find these cabs!")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
