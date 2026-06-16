#!/usr/bin/env python3
"""
Verify employee locations are within Nagpur city bounds
Nagpur city center: 21.1442°N, 79.0882°E
City bounds approximately: 20.8°-21.5°N, 78.8°-79.5°E
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
    print("🗺️  VERIFYING EMPLOYEE LOCATIONS")
    print("=" * 100)
    print("\nNagpur City Bounds: 20.8-21.5°N, 78.8-79.5°E")
    print("Center: 21.1442°N, 79.0882°E\n")
    
    # Get all employees with their coordinates
    cur.execute('''
        SELECT name, email, "address", x, y, zone, "pickupPointId"
        FROM "Employee"
        ORDER BY name
    ''')
    
    employees = cur.fetchall()
    
    inside_city = 0
    outside_city = []
    
    for name, email, address, lat, lng, zone, pp_id in employees:
        # Check if coordinates are within Nagpur city
        if lat and lng:
            in_bounds = (20.8 <= lat <= 21.5) and (78.8 <= lng <= 79.5)
            if in_bounds:
                inside_city += 1
            else:
                outside_city.append({
                    'name': name,
                    'lat': lat,
                    'lng': lng,
                    'zone': zone,
                    'address': address[:50] if address else 'N/A'
                })
    
    print(f"✅ Inside Nagpur city: {inside_city} employees")
    print(f"❌ Outside Nagpur city: {len(outside_city)} employees\n")
    
    if outside_city:
        print("⚠️  EMPLOYEES WITH COORDINATES OUTSIDE NAGPUR:")
        for emp in outside_city:
            print(f"  {emp['name']:25} | {emp['lat']:.4f}, {emp['lng']:.4f} | Zone: {emp['zone']} | {emp['address']}")
    
    # Get sample addresses
    print("\n" + "=" * 100)
    print("📍 SAMPLE EMPLOYEE DATA (First 10)")
    print("=" * 100 + "\n")
    
    cur.execute('''
        SELECT name, address, x, y, zone
        FROM "Employee"
        LIMIT 10
    ''')
    
    for name, address, lat, lng, zone in cur.fetchall():
        print(f"{name:25} | Zone: {zone} | Lat: {lat:.4f}, Lng: {lng:.4f}")
        if address:
            print(f"  Address: {address}")
        print()
    
    # Check for NULL coordinates
    cur.execute('SELECT COUNT(*) FROM "Employee" WHERE x IS NULL OR y IS NULL')
    null_coords = cur.fetchone()[0]
    print(f"\n⚠️  Employees with NULL coordinates: {null_coords}")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
