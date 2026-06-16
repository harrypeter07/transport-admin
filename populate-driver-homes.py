#!/usr/bin/env python3
"""
Populate driver home locations (driverX, driverY)
Currently they're NULL, so drivers start at office (default depot)
Assign realistic home coordinates within Nagpur
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
    print("🏠 POPULATING DRIVER HOME LOCATIONS")
    print("=" * 80)
    
    # Realistic Nagpur driver home coordinates (scattered across city)
    # Office is at 21.1442, 79.0882
    driver_homes = {
        "Suresh Wankhede": (21.1200, 79.0950),     # South of office
        "Mahesh Borkar": (21.1650, 79.0750),       # North-west
        "Vijay Sonkusare": (21.1350, 79.1100),     # East
    }
    
    print("\n📍 Driver Home Locations:")
    print("   Office (Depot): 21.1442, 79.0882\n")
    
    for driver_name, (lat, lng) in driver_homes.items():
        cur.execute('''
            UPDATE "Cab"
            SET "driverX" = %s, "driverY" = %s
            WHERE "driverName" = %s
        ''', (lng, lat, driver_name))
        
        print(f"   {driver_name:20} → {lat:.4f}, {lng:.4f}")
    
    conn.commit()
    updated = sum(1 for _ in driver_homes)
    print(f"\n✅ Updated {updated} drivers with home coordinates")
    
    # Verify
    cur.execute('''
        SELECT "driverName", "driverX", "driverY" FROM "Cab"
        WHERE "driverX" IS NOT NULL
        ORDER BY "driverName"
    ''')
    
    print("\n✅ VERIFICATION:")
    for driver, x, y in cur.fetchall():
        print(f"   {driver:20} X={x:.6f}, Y={y:.6f}")
    
    print("\n" + "=" * 80)
    print("Next: Restart dev server (Ctrl+C, npm run dev)")
    print("Then: Check map - drivers should start from home, not office!")
    print("=" * 80)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
