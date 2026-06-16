import psycopg2
from psycopg2.extras import RealDictCursor

try:
    conn = psycopg2.connect(
        host="aws-1-ap-northeast-2.pooler.supabase.com",
        port=6543,
        user="postgres.birsbvwnzjbwbcnypeav",
        password="Moksh@1816#transitadmin",
        database="postgres",
        sslmode="require"
    )
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    print("=" * 80)
    print(" 📊 EMPLOYEE COUNT VERIFICATION")
    print("=" * 80)
    
    # Total active employees
    cur.execute("SELECT COUNT(*) as cnt FROM \"Employee\" WHERE status = 'ACTIVE'")
    total_active = cur.fetchone()['cnt']
    
    # Total all employees
    cur.execute("SELECT COUNT(*) as cnt FROM \"Employee\"")
    total_all = cur.fetchone()['cnt']
    
    # Inactive employees
    cur.execute("SELECT COUNT(*) as cnt FROM \"Employee\" WHERE status = 'INACTIVE'")
    total_inactive = cur.fetchone()['cnt']
    
    print(f"\n📈 TOTAL COUNTS:")
    print(f"  ✅ ACTIVE Employees: {total_active}")
    print(f"  ❌ INACTIVE Employees: {total_inactive}")
    print(f"  📊 TOTAL (all): {total_all}")
    
    # Detailed breakdown
    cur.execute("""
        SELECT status, COUNT(*) as cnt 
        FROM "Employee" 
        GROUP BY status
        ORDER BY status
    """)
    
    print(f"\n🔍 DETAILED STATUS BREAKDOWN:")
    for row in cur.fetchall():
        status = row['status'] or 'NULL'
        count = row['cnt']
        print(f"  {status}: {count}")
    
    # Verify by zone
    print(f"\n🗺️  ACTIVE EMPLOYEES BY ZONE:")
    cur.execute("""
        SELECT zone, COUNT(*) as cnt 
        FROM "Employee" 
        WHERE status = 'ACTIVE'
        GROUP BY zone 
        ORDER BY zone
    """)
    
    zone_total = 0
    for row in cur.fetchall():
        zone = row['zone']
        count = row['cnt']
        zone_total += count
        print(f"  Zone {zone}: {count}")
    
    print(f"  TOTAL BY ZONES: {zone_total}")
    
    # Check if all have pickup points
    cur.execute("""
        SELECT COUNT(*) as cnt 
        FROM "Employee" 
        WHERE status = 'ACTIVE' AND "pickupPointId" IS NULL
    """)
    unassigned = cur.fetchone()['cnt']
    
    print(f"\n✅ PICKUP POINT ASSIGNMENT:")
    print(f"  Unassigned: {unassigned}")
    print(f"  Assigned: {total_active - unassigned}")
    
    print("\n" + "=" * 80)
    if total_active == 66:
        print(" ✅ DATABASE HAS CORRECT COUNT: 66 ACTIVE EMPLOYEES")
    else:
        print(f" ⚠️  DATABASE HAS: {total_active} ACTIVE EMPLOYEES (EXPECTED: 66)")
    print("=" * 80)
    
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
