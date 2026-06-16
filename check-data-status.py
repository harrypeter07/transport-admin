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
    
    print("=== SHIFTS ===")
    cur.execute("SELECT id, name, \"startTime\", \"endTime\" FROM \"Shift\" ORDER BY \"startTime\"")
    shifts = cur.fetchall()
    print(f"✅ Total Shifts: {len(shifts)}")
    for i, shift in enumerate(shifts, 1):
        print(f"  {i}. {shift['name']} ({shift['startTime']} - {shift['endTime']})")
    
    print("\n=== EMPLOYEE ZONE DATA ===")
    cur.execute("SELECT zone, COUNT(*) as emp_count FROM \"Employee\" GROUP BY zone ORDER BY zone")
    zone_counts = cur.fetchall()
    print(f"Employees by Zone field:")
    for row in zone_counts:
        zone = row['zone'] or 'NULL'
        print(f"  {zone}: {row['emp_count']}")
    
    print("\n=== EMPLOYEES WITH NULL X/Y ===")
    cur.execute("SELECT COUNT(*) as cnt FROM \"Employee\" WHERE x IS NULL OR y IS NULL")
    null_coords = cur.fetchone()
    print(f"Employees without coordinates: {null_coords['cnt']}")
    
    print("\n=== PICKUP POINT ZONES ===")
    cur.execute("SELECT zone, COUNT(*) as cnt FROM \"PickupPoint\" GROUP BY zone ORDER BY zone")
    pp_zones = cur.fetchall()
    for row in pp_zones:
        print(f"  Zone {row['zone']}: {row['cnt']} pickup points")
    
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
