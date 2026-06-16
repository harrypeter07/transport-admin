"""
Geocode all employees and pickup points in the DB using Google Maps API,
then link each employee to their pickup point based on the newdata.json mapping.

Run: python geocode-and-fix-coords.py
"""

import psycopg2
import json
import os
import time
import urllib.request
import urllib.parse

GOOGLE_MAPS_API_KEY = "AIzaSyDXKcMeRaS7yszRq2mIdGLCJucbi43QFQU"
DATABASE_URL = os.getenv(
    'DIRECT_URL',
    'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'
)

NAGPUR_LAT = 21.1458
NAGPUR_LNG = 79.0882
MAX_RADIUS_KM = 80  # max acceptable distance from Nagpur center


def haversine_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def geocode_address(address: str, retries=3):
    """Geocode an address using Google Maps API. Returns (lat, lng) or (None, None)."""
    if not address or not address.strip():
        return None, None

    # Append Nagpur context if not already present
    query = address.strip()
    if 'nagpur' not in query.lower():
        query = f"{query}, Nagpur, Maharashtra, India"

    params = urllib.parse.urlencode({
        'address': query,
        'region': 'in',
        'components': 'country:IN',
        'key': GOOGLE_MAPS_API_KEY
    })
    url = f"https://maps.googleapis.com/maps/api/geocode/json?{params}"

    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode())

            if data.get('status') == 'OK' and data.get('results'):
                loc = data['results'][0]['geometry']['location']
                lat, lng = loc['lat'], loc['lng']

                # Validate within Nagpur region
                dist = haversine_km(NAGPUR_LAT, NAGPUR_LNG, lat, lng)
                if dist <= MAX_RADIUS_KM:
                    return lat, lng
                else:
                    print(f"    [SKIP] Result too far from Nagpur ({dist:.1f}km): {address[:60]}")
                    return None, None

            elif data.get('status') == 'ZERO_RESULTS':
                return None, None
            elif data.get('status') in ('OVER_QUERY_LIMIT', 'RESOURCE_EXHAUSTED'):
                print(f"    [WAIT] Rate limit hit, waiting 2s...")
                time.sleep(2)
            else:
                print(f"    [ERR] Geocode status={data.get('status')} for: {address[:60]}")
                return None, None

        except Exception as e:
            print(f"    [ERR] Request error (attempt {attempt+1}): {e}")
            time.sleep(1)

    return None, None


def is_valid_record(record):
    """Check if record is valid (not a header/escort/empty row)."""
    name = record.get('Name', '').strip()
    emp_id = record.get('Emp ID', '').strip()
    if not name or not emp_id:
        return False
    if name.lower() in ['name', 'escort'] or emp_id.lower() in ['emp id', 'escort']:
        return False
    return True


try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("=" * 70)
    print("STEP 1: GEOCODE PICKUP POINTS")
    print("=" * 70)

    # Load newdata.json for pickup point -> address mapping
    with open('data/newdata.json', 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    valid_records = [r for r in raw_data if is_valid_record(r)]

    # Build pickup_name -> address map from the JSON
    pickup_address_map = {}
    for r in valid_records:
        pp = r.get('Pick up point', '').strip()
        addr = r.get('Address', '').strip()
        if pp and pp not in pickup_address_map and addr:
            pickup_address_map[pp] = addr

    # Also build employee_name -> pickup_name for linking
    emp_to_pickup = {}
    for r in valid_records:
        name = r.get('Name', '').strip()
        pp = r.get('Pick up point', '').strip()
        emp_code = r.get('Emp ID', '').strip()
        if name and pp:
            emp_to_pickup[name.lower()] = pp
            if emp_code and emp_code.upper() not in ('NA', 'ESCORT', 'EMP ID'):
                emp_to_pickup[f"code:{emp_code}"] = pp

    # Fetch all pickup points from DB
    cur.execute('SELECT id, name, address, x, y FROM "PickupPoint"')
    pp_rows = cur.fetchall()
    print(f"\nFound {len(pp_rows)} pickup points in DB")

    pp_geocoded = 0
    pp_failed = 0

    for pp_id, pp_name, pp_address, pp_x, pp_y in pp_rows:
        # Skip if already has valid coordinates
        if pp_x and pp_y and (abs(float(pp_x)) > 0.01 or abs(float(pp_y)) > 0.01):
            print(f"  [OK]  Already geocoded: {pp_name[:50]}")
            continue

        # Use pickup point name + Nagpur as address (more reliable)
        # Also try the employee address as fallback
        address_to_try = pp_name
        fallback_address = pickup_address_map.get(pp_name, pp_address or '')

        print(f"  [GEO] Geocoding pickup: {pp_name[:55]}")
        lat, lng = geocode_address(address_to_try)

        if lat is None and fallback_address:
            print(f"       Trying fallback address...")
            lat, lng = geocode_address(fallback_address)

        if lat is not None and lng is not None:
            cur.execute(
                'UPDATE "PickupPoint" SET x = %s, y = %s WHERE id = %s',
                (float(lng), float(lat), pp_id)
            )
            print(f"       OK: {pp_name[:40]} -> ({lat:.5f}, {lng:.5f})")
            pp_geocoded += 1
        else:
            print(f"       FAILED: {pp_name[:50]}")
            pp_failed += 1

        time.sleep(0.15)  # Rate limiting

    conn.commit()
    print(f"\nPickup points geocoded: {pp_geocoded}")
    print(f"Pickup points failed:   {pp_failed}")

    print("\n" + "=" * 70)
    print("STEP 2: GEOCODE EMPLOYEES")
    print("=" * 70)

    # Fetch all employees from DB
    cur.execute('SELECT id, "employeeCode", name, address, x, y FROM "Employee" WHERE status = \'ACTIVE\'')
    emp_rows = cur.fetchall()
    print(f"\nFound {len(emp_rows)} active employees in DB")

    emp_geocoded = 0
    emp_failed = 0
    emp_skipped = 0

    for emp_id, emp_code, emp_name, emp_address, emp_x, emp_y in emp_rows:
        # Skip if already has valid coordinates
        if emp_x and emp_y and (abs(float(emp_x)) > 0.01 or abs(float(emp_y)) > 0.01):
            emp_skipped += 1
            continue

        if not emp_address or not emp_address.strip():
            print(f"  [SKIP] No address: {emp_name[:50]}")
            emp_failed += 1
            continue

        print(f"  [GEO] Geocoding employee: {emp_name[:50]}")
        lat, lng = geocode_address(emp_address)

        if lat is not None and lng is not None:
            cur.execute(
                'UPDATE "Employee" SET x = %s, y = %s WHERE id = %s',
                (float(lng), float(lat), emp_id)
            )
            print(f"       OK: ({lat:.5f}, {lng:.5f})")
            emp_geocoded += 1
        else:
            print(f"       FAILED: {emp_name[:50]}")
            emp_failed += 1

        time.sleep(0.15)  # Rate limiting

    conn.commit()
    print(f"\nEmployees geocoded: {emp_geocoded}")
    print(f"Employees skipped (already OK): {emp_skipped}")
    print(f"Employees failed: {emp_failed}")

    print("\n" + "=" * 70)
    print("STEP 3: LINK EMPLOYEES TO PICKUP POINTS")
    print("=" * 70)

    # Fetch pickup points again (now with coordinates)
    cur.execute('SELECT id, name, x, y FROM "PickupPoint"')
    all_pp_rows = cur.fetchall()
    # Map both exact and lowercase name -> DB row
    pp_with_coords = {row[1]: row for row in all_pp_rows if row[2] and row[3] and (abs(float(row[2])) > 0.01 or abs(float(row[3])) > 0.01)}
    pp_all = {row[1]: row for row in all_pp_rows}  # all pp including zero-coord ones
    pp_lower_map = {name.lower(): data for name, data in pp_with_coords.items()}
    pp_all_lower = {name.lower(): data for name, data in pp_all.items()}

    # Fetch employees again
    cur.execute('SELECT id, "employeeCode", name, "pickupPointId" FROM "Employee" WHERE status = \'ACTIVE\'')
    all_employees = cur.fetchall()

    linked = 0
    already_linked = 0
    not_found = 0

    for emp_id, emp_code, emp_name, existing_pp_id in all_employees:
        # Check if already linked
        if existing_pp_id:
            already_linked += 1
            continue

        # Find pickup point name for this employee from JSON data
        pp_name = emp_to_pickup.get(emp_name.lower())
        if not pp_name and emp_code:
            pp_name = emp_to_pickup.get(f"code:{emp_code}")

        if not pp_name:
            not_found += 1
            continue

        # Find the pickup point in DB (try exact match first, then lowercase, then fuzzy)
        pp_data = pp_with_coords.get(pp_name) or pp_lower_map.get(pp_name.lower())

        # Fallback: check all pickup points (even if zero coord) so we still link
        if not pp_data:
            pp_data = pp_all.get(pp_name) or pp_all_lower.get(pp_name.lower())

        if pp_data:
            pp_db_id = pp_data[0]
            cur.execute(
                'UPDATE "Employee" SET "pickupPointId" = %s WHERE id = %s',
                (pp_db_id, emp_id)
            )
            print(f"  [LINK] {emp_name[:35]} -> {pp_name[:35]}")
            linked += 1
        else:
            # Fuzzy match
            pp_name_lower = pp_name.lower()
            matched = False
            for db_pp_name, db_pp_data in pp_all.items():
                if pp_name_lower in db_pp_name.lower() or db_pp_name.lower() in pp_name_lower:
                    cur.execute(
                        'UPDATE "Employee" SET "pickupPointId" = %s WHERE id = %s',
                        (db_pp_data[0], emp_id)
                    )
                    print(f"  [FUZZY] {emp_name[:30]} -> {db_pp_name[:30]}")
                    linked += 1
                    matched = True
                    break
            if not matched:
                print(f"  [MISS] No PP found for: {emp_name[:45]} (wanted: '{pp_name}')")
                not_found += 1

    conn.commit()

    print(f"\nEmployees newly linked: {linked}")
    print(f"Already linked:         {already_linked}")
    print(f"No pickup point found:  {not_found}")

    print("\n" + "=" * 70)
    print("STEP 4: VERIFY FINAL STATE")
    print("=" * 70)

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

    print(f"\nFinal State:")
    print(f"  Employees: {total_emp} total, {geocoded_emp} geocoded, {linked_emp} linked to pickup point")
    print(f"  Pickup Points: {total_pp} total, {geocoded_pp} geocoded")
    print(f"\nDone! Routing will now use correct Nagpur coordinates.")

    cur.close()
    conn.close()

except Exception as e:
    print(f"\nFatal Error: {e}")
    import traceback
    traceback.print_exc()
