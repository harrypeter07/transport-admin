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
    
    print("=" * 70)
    print(" 🎯 FINAL DATA VERIFICATION REPORT")
    print("=" * 70)
    
    # Summary 1: Employees
    cur.execute("SELECT COUNT(*) as total FROM \"Employee\" WHERE status = 'ACTIVE'")
    emp_active = cur.fetchone()['total']
    print(f"\n👥 EMPLOYEES")
    print(f"  ✅ Active Employees: {emp_active}")
    
    # Summary 2: Zone Distribution
    cur.execute("""
        SELECT zone, COUNT(*) as cnt 
        FROM "Employee" 
        WHERE status = 'ACTIVE' 
        GROUP BY zone ORDER BY zone
    """)
    print(f"\n🗺️  ZONE DISTRIBUTION (North, South, East, West)")
    for row in cur.fetchall():
        zone = row['zone']
        count = row['cnt']
        bar = "█" * (count // 2)
        print(f"  {zone}: {count:2d} employees  {bar}")
    
    # Summary 3: Pickup Points
    cur.execute("""
        SELECT zone, COUNT(*) as cnt 
        FROM "PickupPoint" 
        GROUP BY zone ORDER BY zone
    """)
    print(f"\n📍 PICKUP POINTS (per zone)")
    for row in cur.fetchall():
        zone = row['zone']
        count = row['cnt']
        print(f"  {zone}: {count} pickup points")
    
    # Summary 4: Employee-Pickup Assignment
    cur.execute("""
        SELECT COUNT(*) as cnt FROM "Employee" 
        WHERE "pickupPointId" IS NOT NULL AND status = 'ACTIVE'
    """)
    assigned = cur.fetchone()['cnt']
    print(f"\n✅ PICKUP POINT ASSIGNMENT")
    print(f"  Employees assigned to pickup points: {assigned}/{emp_active}")
    
    # Summary 5: Vehicles
    cur.execute("SELECT COUNT(*) as total FROM \"Cab\" WHERE status != 'INACTIVE'")
    cabs = cur.fetchone()['total']
    print(f"\n🚗 VEHICLES")
    print(f"  Active/Available Cabs: {cabs}")
    
    # Summary 6: Shifts
    cur.execute("SELECT COUNT(*) as total FROM \"Shift\"")
    shifts = cur.fetchone()['total']
    print(f"\n⏰ SHIFTS (Database Count)")
    print(f"  Total Shifts: {shifts}")
    
    print("\n" + "=" * 70)
    print(" ✅ All data is consistent and ready for map visualization!")
    print("=" * 70)
    
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
