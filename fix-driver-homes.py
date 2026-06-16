#!/usr/bin/env python3
"""
Populate driver home locations for ALL 9 cabs
Vehicle numbers are currently used as driverName
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
    print("🏠 POPULATING DRIVER HOME LOCATIONS FOR 9 CABS")
    print("=" * 80)
    
    # Office (Depot) in Nagpur: 21.1442, 79.0882
    # Distribute driver homes across Nagpur city (realistic)
    driver_homes = {
        "MH31FC8407": (21.1200, 79.1000),    # South
        "MH31FC8592": (21.1650, 79.0750),    # North-West
        "MH40CT4542": (21.1350, 79.1150),    # East
        "MH40DC0486": (21.1100, 79.0800),    # South-West
        "MH49CW0078": (21.1550, 79.0950),    # North
        "MH49CW0139": (21.1300, 79.0700),    # West
        "MH49CW0218": (21.1700, 79.1050),    # North-East
        "MH49CW0876": (21.1450, 79.1200),    # East
        "MH49CW1305": (21.1250, 79.0900),    # South-Central
    }
    
    print("\n📍 Assigning Home Locations:")
    print("   Office (Depot): 21.1442, 79.0882\n")
    
    for vehicle, (lat, lng) in driver_homes.items():
        cur.execute('''
            UPDATE "Cab"
            SET "driverX" = %s, "driverY" = %s
            WHERE "vehicleNumber" = %s
        ''', (lng, lat, vehicle))
        print(f"   {vehicle:12} → Lat {lat:.4f}, Lng {lng:.4f}")
    
    conn.commit()
    print(f"\n✅ Updated {len(driver_homes)} cabs with home coordinates")
    
    # Verify
    cur.execute('''
        SELECT "vehicleNumber", "driverX", "driverY" FROM "Cab"
        WHERE "driverX" IS NOT NULL
        ORDER BY "vehicleNumber"
    ''')
    
    print("\n✅ VERIFICATION - All drivers have home coordinates:")
    for vehicle, x, y in cur.fetchall():
        print(f"   {vehicle:12} X(lng)={x:.6f}, Y(lat)={y:.6f}")
    
    print("\n" + "=" * 80)
    print("💡 Next Steps:")
    print("   1. Ctrl+C to stop dev server")
    print("   2. npm run dev to restart")
    print("   3. Open map - drivers now start from home!")
    print("=" * 80)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
