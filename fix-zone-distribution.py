import psycopg2
from psycopg2.extras import RealDictCursor
import random
import json
import uuid
from datetime import datetime

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
    
    # First, clear all existing pickup points and create fresh ones
    cur.execute('DELETE FROM "PickupPoint"')
    conn.commit()
    print("✅ Cleared old pickup points")
    
    # Define 4 zones with realistic Nagpur coordinates
    zones_data = [
        # North Zone (21.20 to 21.30, 79.00 to 79.15)
        {
            "zone": "N",
            "subZone": "NE",
            "count": 15,
            "lat_range": (21.20, 21.30),
            "lng_range": (79.00, 79.15)
        },
        # South Zone (21.10 to 21.20, 79.00 to 79.15)
        {
            "zone": "S",
            "subZone": "SE",
            "count": 15,
            "lat_range": (21.10, 21.20),
            "lng_range": (79.00, 79.15)
        },
        # East Zone (21.15 to 21.25, 79.15 to 79.30)
        {
            "zone": "E",
            "subZone": "SE",
            "count": 15,
            "lat_range": (21.15, 21.25),
            "lng_range": (79.15, 79.30)
        },
        # West Zone (21.15 to 21.25, 78.85 to 79.00)
        {
            "zone": "W",
            "subZone": "SW",
            "count": 15,
            "lat_range": (21.15, 21.25),
            "lng_range": (78.85, 79.00)
        }
    ]
    
    pickup_points_created = 0
    
    for zone_info in zones_data:
        for i in range(zone_info["count"]):
            lat = random.uniform(zone_info["lat_range"][0], zone_info["lat_range"][1])
            lng = random.uniform(zone_info["lng_range"][0], zone_info["lng_range"][1])
            
            point_id = str(uuid.uuid4())
            name = f"{zone_info['zone']} Hub {i+1}"
            address = f"Zone {zone_info['zone']} - Pickup Point {i+1}"
            distance_ring = random.choice(["NEAR", "MID", "FAR"])
            now = datetime.now()
            
            cur.execute("""
                INSERT INTO "PickupPoint" (id, "name", "address", "x", "y", "zone", "subZone", "distanceRing", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (point_id, name, address, lng, lat, zone_info["zone"], zone_info["subZone"], distance_ring, now, now))
            
            pickup_points_created += 1
    
    conn.commit()
    print(f"✅ Created {pickup_points_created} new pickup points across 4 zones")
    
    # Now get all employees
    cur.execute('SELECT id FROM "Employee"')
    employees = cur.fetchall()
    print(f"\n✅ Found {len(employees)} employees to assign")
    
    # Get all pickup points
    cur.execute('SELECT id, zone FROM "PickupPoint"')
    pickup_points = cur.fetchall()
    
    # Group by zone
    zones = {}
    for pp in pickup_points:
        zone = pp['zone']
        if zone not in zones:
            zones[zone] = []
        zones[zone].append(pp['id'])
    
    print(f"\n🗺️  Pickup Points by Zone: {json.dumps({z: len(pps) for z, pps in zones.items()})}")
    
    # Assign employees to pickup points (distribute evenly)
    assigned = 0
    for idx, emp in enumerate(employees):
        # Round-robin assign to zones, then random pickup point in zone
        zone_list = list(zones.keys())
        zone = zone_list[idx % len(zone_list)]
        pickup_point_id = random.choice(zones[zone])
        
        cur.execute("""
            UPDATE "Employee" 
            SET "pickupPointId" = %s 
            WHERE id = %s
        """, (pickup_point_id, emp['id']))
        assigned += 1
    
    conn.commit()
    print(f"✅ Assigned {assigned} employees to pickup points")
    
    # Verify assignment
    cur.execute("""
        SELECT pp.zone, COUNT(e.id) as emp_count 
        FROM "PickupPoint" pp 
        LEFT JOIN "Employee" e ON e."pickupPointId" = pp.id 
        GROUP BY pp.zone 
        ORDER BY pp.zone
    """)
    
    print("\n📊 Final Distribution by Zone:")
    zone_summary = {}
    for row in cur.fetchall():
        zone = row['zone']
        count = row['emp_count']
        zone_summary[zone] = count
        print(f"  Zone {zone}: {count} employees")
    
    cur.execute("SELECT COUNT(*) as unassigned FROM \"Employee\" WHERE \"pickupPointId\" IS NULL")
    unassigned = cur.fetchone()
    print(f"\n✅ Unassigned Employees: {unassigned['unassigned']}")
    
    conn.close()
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
