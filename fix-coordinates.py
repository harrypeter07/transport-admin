#!/usr/bin/env python3
"""
Fix employee coordinates: they're all 0.0,0.0
Instead, use their assigned pickup point coordinates
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
    
    print("=" * 100)
    print("🔧 FIXING EMPLOYEE COORDINATES FROM PICKUP POINTS")
    print("=" * 100)
    
    # Update employee coordinates from their assigned pickup point
    cur.execute('''
        UPDATE "Employee" e
        SET x = pp.x, y = pp.y
        FROM "PickupPoint" pp
        WHERE e."pickupPointId" = pp.id
        AND (e.x = 0.0 OR e.y = 0.0 OR e.x IS NULL OR e.y IS NULL)
    ''')
    
    updated = cur.rowcount
    conn.commit()
    
    print(f"\n✅ Updated {updated} employees with pickup point coordinates\n")
    
    # Verify
    print("=" * 100)
    print("📍 VERIFICATION - Sample employees with new coordinates")
    print("=" * 100 + "\n")
    
    cur.execute('''
        SELECT e.name, e."address", e.x, e.y, e.zone, pp.x, pp.y
        FROM "Employee" e
        LEFT JOIN "PickupPoint" pp ON e."pickupPointId" = pp.id
        LIMIT 10
    ''')
    
    for name, address, emp_lat, emp_lng, zone, pp_lat, pp_lng in cur.fetchall():
        print(f"{name:25} | Zone: {zone} | Lat: {emp_lat:.4f}, Lng: {emp_lng:.4f}")
        if address:
            print(f"  Address: {address[:70]}")
        print()
    
    # Check Nagpur bounds
    cur.execute('''
        SELECT COUNT(*) as total,
               SUM(CASE WHEN x >= 20.8 AND x <= 21.5 AND y >= 78.8 AND y <= 79.5 THEN 1 ELSE 0 END) as in_city
        FROM "Employee"
    ''')
    
    total, in_city = cur.fetchone()
    print(f"\n✅ Employees within Nagpur city bounds: {in_city}/{total}")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
