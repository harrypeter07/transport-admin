"""
Fix employee coordinates and pickup point linkage:
1. Clear existing pickup point assignments for all employees
2. Create actual pickup points from newdata.json (with real addresses)
3. Geocode those pickup points
4. Geocode employee home addresses
5. Link employees to their correct pickup points

Run: python fix-employees-geocode-link.py
"""

import psycopg2
import json
import os
import time
import uuid
import urllib.request
import urllib.parse

GOOGLE_MAPS_API_KEY = "AIzaSyDXKcMeRaS7yszRq2mIdGLCJucbi43QFQU"
DATABASE_URL = os.getenv(
    'DIRECT_URL',
    'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'
)

NAGPUR_LAT = 21.1458
NAGPUR_LNG = 79.0882
MAX_RADIUS_KM = 80


def haversine_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def geocode(query, retries=3):
    """Returns (lat, lng) or (None, None)."""
    if not query or not query.strip():
        return None, None

    q = query.strip()
    if 'nagpur' not in q.lower():
        q = f"{q}, Nagpur, Maharashtra, India"

    params = urllib.parse.urlencode({
        'address': q,
        'region': 'in',
        'components': 'country:IN',
        'key': GOOGLE_MAPS_API_KEY
    })
    url = f"https://maps.googleapis.com/maps/api/geocode/json?{params}"

    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=12) as resp:
                data = json.loads(resp.read().decode())

            if data.get('status') == 'OK' and data.get('results'):
                loc = data['results'][0]['geometry']['location']
                lat, lng = loc['lat'], loc['lng']
                dist = haversine_km(NAGPUR_LAT, NAGPUR_LNG, lat, lng)
                if dist <= MAX_RADIUS_KM:
                    return lat, lng
                else:
                    print(f"      SKIP (too far {dist:.0f}km): {query[:50]}")
                    return None, None

            elif data.get('status') == 'ZERO_RESULTS':
                return None, None
            elif data.get('status') in ('OVER_QUERY_LIMIT', 'RESOURCE_EXHAUSTED'):
                print("      Rate limit - waiting 3s")
                time.sleep(3)
            else:
                print(f"      API error {data.get('status')}: {query[:50]}")
                return None, None

        except Exception as e:
            print(f"      Request error (attempt {attempt+1}): {e}")
            time.sleep(1)

    return None, None


def is_valid_record(r):
    name = r.get('Name', '').strip()
    emp_id = r.get('Emp ID', '').strip()
    if not name or not emp_id:
        return False
    if name.lower() in ['name', 'escort'] or emp_id.lower() in ['emp id', 'escort']:
        return False
    return True


try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    print("Connected to DB.")

    # Load newdata.json
    with open('data/newdata.json', 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    valid_records = [r for r in raw_data if is_valid_record(r)]
    print(f"Loaded {len(valid_records)} valid records from newdata.json")

    # Build unique pickup points from JSON
    pickup_points_map = {}  # name -> {name, address, route}
    emp_to_pickup_name = {}  # (emp_name.lower(), emp_code) -> pp_name

    for r in valid_records:
        pp_name = r.get('Pick up point', '').strip()
        emp_name = r.get('Name', '').strip()
        emp_code = r.get('Emp ID', '').strip()
        emp_addr = r.get('Address', '').strip()
        route = r.get('Rout No', '').strip()

        if pp_name and pp_name not in pickup_points_map:
            pickup_points_map[pp_name] = {
                'name': pp_name,
                'address': emp_addr,  # use employee address as PP address
                'route': route
            }

        if emp_name and pp_name:
            emp_to_pickup_name[emp_name.lower()] = pp_name
            if emp_code and emp_code.upper() not in ('NA', 'ESCORT', 'EMP ID'):
                emp_to_pickup_name[f"code:{emp_code}"] = pp_name

    print(f"Unique pickup points from JSON: {len(pickup_points_map)}")
    print(f"Employee->pickup mappings: {len(emp_to_pickup_name)}")

    # Step 1: Fetch all employees from DB
    print("\n" + "="*60)
    print("STEP 1: CLEAR OLD PICKUP POINT LINKS + CREATE NEW PPs")
    print("="*60)

    # Unlink all employees from old pickup points
    cur.execute('UPDATE "Employee" SET "pickupPointId" = NULL')
    conn.commit()
    print("Cleared all employee pickup point links")

    # Delete old pickup points (the zone hubs - not from newdata.json)
    # But keep any that were manually created by users
    # We'll check by name - if name matches newdata.json pp names, keep them; if hub pattern, delete
    cur.execute('SELECT id, name FROM "PickupPoint"')
    existing_pps = {row[1]: row[0] for row in cur.fetchall()}
    print(f"Existing pickup points in DB: {len(existing_pps)}")

    # Delete hub pickup points (names like "N Hub 1", "S Hub 2" etc.)
    hub_pattern_deleted = 0
    for pp_name_db, pp_id_db in list(existing_pps.items()):
        if any(pp_name_db.startswith(prefix) for prefix in ['N Hub', 'S Hub', 'E Hub', 'W Hub']):
            cur.execute('DELETE FROM "PickupPoint" WHERE id = %s', (pp_id_db,))
            hub_pattern_deleted += 1
            del existing_pps[pp_name_db]
    conn.commit()
    print(f"Deleted {hub_pattern_deleted} zone hub pickup points")
    print(f"Remaining pickup points: {len(existing_pps)}")

    # Step 2: Create new pickup points from newdata.json
    print("\n" + "="*60)
    print("STEP 2: GEOCODE & CREATE PICKUP POINTS FROM NEWDATA.JSON")
    print("="*60)

    new_pp_db = {}  # pp_name -> db_id (after geocoding and insert)
    pp_created = 0
    pp_geocode_ok = 0
    pp_geocode_fail = 0

    for pp_name, pp_info in pickup_points_map.items():
        # Check if already in DB (from previous runs)
        if pp_name in existing_pps:
            new_pp_db[pp_name] = existing_pps[pp_name]
            print(f"  [EXISTS] {pp_name[:50]}")
            continue

        print(f"  [GEO] {pp_name[:55]}")
        lat, lng = geocode(pp_name)

        if lat is None:
            # Fallback: geocode the employee address
            fallback = pp_info.get('address', '')
            if fallback:
                print(f"      -> fallback address geocode...")
                lat, lng = geocode(fallback)

        pp_uuid = str(uuid.uuid4())
        pp_x = float(lng) if lng else 0.0
        pp_y = float(lat) if lat else 0.0

        if lat and lng:
            pp_geocode_ok += 1
            status = f"OK ({lat:.4f},{lng:.4f})"
        else:
            pp_geocode_fail += 1
            status = "FAILED (0,0)"

        # Determine zone from lat/lng (rough quadrant around Nagpur center)
        zone = 'N'
        if lat and lng:
            if lat < NAGPUR_LAT and lng < NAGPUR_LNG: zone = 'SW'
            elif lat < NAGPUR_LAT and lng >= NAGPUR_LNG: zone = 'SE'
            elif lat >= NAGPUR_LAT and lng < NAGPUR_LNG: zone = 'NW'
            else: zone = 'NE'

        try:
            cur.execute("""
                INSERT INTO "PickupPoint" (id, name, address, x, y, zone, "subZone", "distanceRing", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """, (
                pp_uuid,
                pp_name,
                pp_info.get('address', ''),
                pp_x,
                pp_y,
                zone[0] if zone else 'N',
                zone,
                'NEAR' if pp_y > 0 else 'UNKNOWN'
            ))
            new_pp_db[pp_name] = pp_uuid
            pp_created += 1
            print(f"      {status}")
        except Exception as e:
            print(f"      DB INSERT ERROR: {e}")

        time.sleep(0.12)  # Rate limiting

    conn.commit()
    print(f"\nPickup points created: {pp_created}")
    print(f"Geocode OK: {pp_geocode_ok}, FAILED: {pp_geocode_fail}")

    # Step 3: Geocode employee home addresses
    print("\n" + "="*60)
    print("STEP 3: GEOCODE EMPLOYEE HOME ADDRESSES")
    print("="*60)

    cur.execute('SELECT id, "employeeCode", name, address, x, y FROM "Employee" WHERE status = \'ACTIVE\'')
    emp_rows = cur.fetchall()
    print(f"Found {len(emp_rows)} active employees")

    emp_geo_ok = 0
    emp_geo_skip = 0
    emp_geo_fail = 0

    for emp_id, emp_code, emp_name, emp_address, emp_x, emp_y in emp_rows:
        # Check if already has valid non-hub coordinates
        # Since we cleared and recreated, we should re-geocode all employees
        # But skip if coordinates look already valid and not matching a hub
        
        if not emp_address or not emp_address.strip():
            print(f"  [SKIP] No address: {emp_name[:40]}")
            emp_geo_fail += 1
            continue

        print(f"  [GEO] {emp_name[:45]}")
        lat, lng = geocode(emp_address)

        if lat and lng:
            cur.execute('UPDATE "Employee" SET x = %s, y = %s WHERE id = %s',
                       (float(lng), float(lat), emp_id))
            print(f"      OK: ({lat:.5f}, {lng:.5f})")
            emp_geo_ok += 1
        else:
            print(f"      FAILED")
            emp_geo_fail += 1

        time.sleep(0.12)

    conn.commit()
    print(f"\nEmployees geocoded: {emp_geo_ok}, failed: {emp_geo_fail}")

    # Step 4: Link employees to their pickup points
    print("\n" + "="*60)
    print("STEP 4: LINK EMPLOYEES TO PICKUP POINTS")
    print("="*60)

    # Build case-insensitive lookup for new_pp_db
    pp_name_lower_to_id = {n.lower(): i for n, i in new_pp_db.items()}

    cur.execute('SELECT id, "employeeCode", name FROM "Employee" WHERE status = \'ACTIVE\'')
    all_employees = cur.fetchall()

    linked = 0
    not_found = 0

    for emp_id, emp_code, emp_name in all_employees:
        pp_name = emp_to_pickup_name.get(emp_name.lower())
        if not pp_name and emp_code:
            pp_name = emp_to_pickup_name.get(f"code:{emp_code}")

        if not pp_name:
            print(f"  [MISS] No mapping for: {emp_name[:45]}")
            not_found += 1
            continue

        pp_db_id = new_pp_db.get(pp_name) or pp_name_lower_to_id.get(pp_name.lower())

        if not pp_db_id:
            # Fuzzy match
            pp_name_lower = pp_name.lower()
            for db_name, db_id in new_pp_db.items():
                if pp_name_lower in db_name.lower() or db_name.lower() in pp_name_lower:
                    pp_db_id = db_id
                    break

        if pp_db_id:
            cur.execute('UPDATE "Employee" SET "pickupPointId" = %s WHERE id = %s',
                       (pp_db_id, emp_id))
            print(f"  [LINK] {emp_name[:35]} -> {pp_name[:35]}")
            linked += 1
        else:
            print(f"  [MISS] PP not in DB: {emp_name[:35]} wanted '{pp_name}'")
            not_found += 1

    conn.commit()
    print(f"\nLinked: {linked}, Not found: {not_found}")

    # Final summary
    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)

    cur.execute('SELECT COUNT(*) FROM "Employee" WHERE status = \'ACTIVE\'')
    total_emp = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "Employee" WHERE status = \'ACTIVE\' AND x != 0 AND y != 0')
    geocoded_emp = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "Employee" WHERE status = \'ACTIVE\' AND "pickupPointId" IS NOT NULL')
    linked_emp = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "PickupPoint"')
    total_pp = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "PickupPoint" WHERE x != 0 AND y != 0')
    geocoded_pp = cur.fetchone()[0]

    print(f"Employees: {total_emp} total | {geocoded_emp} geocoded | {linked_emp} linked to pickup point")
    print(f"Pickup Points: {total_pp} total | {geocoded_pp} geocoded")

    if linked_emp < total_emp:
        print(f"\nWARNING: {total_emp - linked_emp} employees not linked to pickup points!")
        cur.execute('SELECT name, address FROM "Employee" WHERE status = \'ACTIVE\' AND "pickupPointId" IS NULL')
        unlinked = cur.fetchall()
        for name, addr in unlinked:
            print(f"  - {name}: {(addr or '')[:60]}")

    cur.close()
    conn.close()
    print("\nDone!")

except Exception as e:
    print(f"\nFatal Error: {e}")
    import traceback
    traceback.print_exc()
