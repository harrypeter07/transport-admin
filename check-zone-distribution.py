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
    
    # Count total employees
    cur.execute("SELECT COUNT(*) as total FROM \"Employee\"")
    total = cur.fetchone()
    print(f"✅ Total Employees: {total['total']}")
    
    # Check pickup point distribution
    cur.execute("""
        SELECT pp.zone, COUNT(e.id) as emp_count 
        FROM "PickupPoint" pp 
        LEFT JOIN "Employee" e ON e."pickupPointId" = pp.id 
        GROUP BY pp.zone 
        ORDER BY pp.zone
    """)
    zone_dist = cur.fetchall()
    print("\n📍 Employees by Zone:")
    for row in zone_dist:
        print(f"  Zone {row['zone']}: {row['emp_count']} employees")
    
    # Check employees without pickup point
    cur.execute("SELECT COUNT(*) as unassigned FROM \"Employee\" WHERE \"pickupPointId\" IS NULL")
    unassigned = cur.fetchone()
    print(f"\n⚠️  Employees without Pickup Point: {unassigned['unassigned']}")
    
    # Check total pickup points
    cur.execute("SELECT COUNT(*) as total, COUNT(DISTINCT zone) as zones FROM \"PickupPoint\"")
    pp_info = cur.fetchone()
    print(f"\n🗺️  Pickup Points: {pp_info['total']} | Unique Zones: {pp_info['zones']}")
    
    # Check if there are duplicate records
    cur.execute("SELECT \"pickupPointId\", COUNT(*) as cnt FROM \"Employee\" WHERE \"pickupPointId\" IS NOT NULL GROUP BY \"pickupPointId\" ORDER BY cnt DESC LIMIT 10")
    dups = cur.fetchall()
    print("\n🔍 Top 10 Pickup Points by Employee Count:")
    for row in dups:
        print(f"  {row['pickupPointId']}: {row['cnt']} employees")
    
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
