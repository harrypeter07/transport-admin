import psycopg2
from psycopg2.extras import RealDictCursor
import math

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
    
    # Helper to assign zone based on pickup point
    def get_zone_from_pickup_point(zone):
        if zone in ['N', 'S', 'E', 'W']:
            return zone
        return 'N'  # default
    
    def get_subzone_from_pickup_point(zone, subzone):
        if subzone in ['NE', 'NW', 'SE', 'SW']:
            return subzone
        # Map primary zone to default subzone
        zone_to_subzone = {
            'N': 'NE',
            'S': 'SE',
            'E': 'SE',
            'W': 'SW'
        }
        return zone_to_subzone.get(zone, 'NE')
    
    print("📍 Populating employee zone/subzone from pickup points...")
    
    # Update employees with zone/subzone from their pickup points
    cur.execute("""
        UPDATE "Employee" e
        SET zone = pp.zone,
            "subZone" = pp."subZone"
        FROM "PickupPoint" pp
        WHERE e."pickupPointId" = pp.id AND e.zone IS NULL
    """)
    
    updated = cur.rowcount
    conn.commit()
    print(f"✅ Updated {updated} employees with zone data from pickup points")
    
    # Verify the update
    cur.execute("""
        SELECT zone, COUNT(*) as emp_count 
        FROM "Employee" 
        GROUP BY zone 
        ORDER BY zone
    """)
    
    print("\n📊 Employee Distribution by Zone (AFTER UPDATE):")
    zone_data = {}
    for row in cur.fetchall():
        zone = row['zone'] or 'NULL'
        count = row['emp_count']
        zone_data[zone] = count
        print(f"  Zone {zone}: {count} employees")
    
    # Check if all have zones now
    cur.execute("SELECT COUNT(*) as cnt FROM \"Employee\" WHERE zone IS NULL")
    unassigned = cur.fetchone()['cnt']
    print(f"\n✅ Unassigned employees: {unassigned}")
    
    if unassigned == 0:
        print("\n🎉 All employees now have proper zone/subzone data!")
    
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
