#!/usr/bin/env python3
"""
Comprehensive data integrity verification script
Checks: coordinates, routes, pickup points, driver homes, everything
"""
import psycopg2
from collections import Counter

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
    print("🔍 COMPREHENSIVE DATA INTEGRITY VERIFICATION")
    print("=" * 100)
    
    # 1. Employee Coordinates Check
    print("\n1️⃣  EMPLOYEE COORDINATES VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            COUNT(*) total,
            SUM(CASE WHEN x IS NULL OR y IS NULL THEN 1 ELSE 0 END) null_coords,
            SUM(CASE WHEN x = 0 AND y = 0 THEN 1 ELSE 0 END) zero_coords,
            SUM(CASE WHEN x NOT BETWEEN 78.8 AND 79.5 OR y NOT BETWEEN 20.8 AND 21.5 THEN 1 ELSE 0 END) out_of_bounds
        FROM "Employee"
    ''')
    
    total, null_coords, zero_coords, out_of_bounds = cur.fetchone()
    print(f"  Total employees: {total}")
    print(f"  ❌ NULL coordinates: {null_coords}")
    print(f"  ❌ Zero coordinates (0,0): {zero_coords}")
    print(f"  ❌ Out of Nagpur bounds: {out_of_bounds}")
    
    if null_coords == 0 and zero_coords == 0 and out_of_bounds == 0:
        print(f"  ✅ ALL {total} EMPLOYEES HAVE VALID COORDINATES")
    else:
        # Sample coordinates to see what they are
        print(f"\n  📊 SAMPLE EMPLOYEE COORDINATES (x=lon, y=lat):")
        cur.execute('SELECT name, x, y FROM "Employee" LIMIT 5')
        samples = cur.fetchall()
        for name, x, y in samples:
            print(f"    {name:30} → (lon:{x:.4f}, lat:{y:.4f})")
    
    # 2. Pickup Point Check
    print("\n2️⃣  PICKUP POINT ASSIGNMENT VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            COUNT(*) total,
            SUM(CASE WHEN "pickupPointId" IS NULL THEN 1 ELSE 0 END) no_pp,
            COUNT(DISTINCT "pickupPointId") unique_pp
        FROM "Employee"
    ''')
    
    total_emp, no_pp, unique_pp = cur.fetchone()
    print(f"  Total employees: {total_emp}")
    print(f"  ❌ Without pickup point: {no_pp}")
    print(f"  Unique pickup points used: {unique_pp}")
    
    if no_pp == 0:
        print(f"  ✅ ALL {total_emp} EMPLOYEES HAVE PICKUP POINTS")
    
    # 3. Pickup Point Coordinates
    print("\n3️⃣  PICKUP POINT COORDINATES VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            COUNT(*) total,
            SUM(CASE WHEN x IS NULL OR y IS NULL THEN 1 ELSE 0 END) null_coords,
            SUM(CASE WHEN x = 0 AND y = 0 THEN 1 ELSE 0 END) zero_coords
        FROM "PickupPoint"
    ''')
    
    pp_total, pp_null, pp_zero = cur.fetchone()
    print(f"  Total pickup points: {pp_total}")
    print(f"  ❌ NULL coordinates: {pp_null}")
    print(f"  ❌ Zero coordinates: {pp_zero}")
    
    if pp_null == 0 and pp_zero == 0:
        print(f"  ✅ ALL {pp_total} PICKUP POINTS HAVE VALID COORDINATES")
    else:
        # Sample to see what's wrong
        print(f"\n  📊 SAMPLE PICKUP POINT COORDINATES:")
        cur.execute('SELECT name, x, y, zone FROM "PickupPoint" LIMIT 5')
        samples = cur.fetchall()
        for name, x, y, zone in samples:
            print(f"    {name:30} Zone {zone} → ({x:.4f}, {y:.4f})")
    
    # 4. Driver Home Locations
    print("\n4️⃣  CAB HOME LOCATIONS VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            COUNT(*) total,
            SUM(CASE WHEN "driverX" IS NULL OR "driverY" IS NULL THEN 1 ELSE 0 END) null_home,
            SUM(CASE WHEN "driverX" = 0 AND "driverY" = 0 THEN 1 ELSE 0 END) zero_home
        FROM "Cab"
    ''')
    
    cab_total, cab_null_home, cab_zero_home = cur.fetchone()
    print(f"  Total cabs: {cab_total}")
    print(f"  ❌ NULL home locations: {cab_null_home}")
    print(f"  ❌ Zero home locations: {cab_zero_home}")
    
    if cab_null_home == 0 and cab_zero_home == 0:
        print(f"  ✅ ALL {cab_total} CABS HAVE HOME LOCATIONS")
    
    cur.execute('SELECT id, "vehicleNumber", "driverX", "driverY" FROM "Cab" ORDER BY "vehicleNumber"')
    cabs = cur.fetchall()
    print(f"\n  CAB HOME LOCATIONS:")
    for cab_id, vnum, dx, dy in cabs:
        print(f"    {vnum:15} → ({dx:.4f}, {dy:.4f})")
    
    # 5. Shift Verification
    print("\n5️⃣  SHIFT VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            s.id, s.name, s."startTime", s."endTime",
            COUNT(e.id) emp_count,
            COUNT(DISTINCT c.id) cab_count
        FROM "Shift" s
        LEFT JOIN "Employee" e ON e."shiftId" = s.id
        LEFT JOIN "_CabToShift" cts ON cts."B" = s.id
        LEFT JOIN "Cab" c ON c.id = cts."A"
        GROUP BY s.id, s.name, s."startTime", s."endTime"
        ORDER BY s."startTime"
    ''')
    
    shifts = cur.fetchall()
    print(f"  Total unique shifts: {len(shifts)}")
    print(f"\n  {'#':3} {'Name':25} {'Start-End':12} {'Employees':12} {'Cabs':8}")
    print(f"  {'-'*65}")
    
    total_emp_all = 0
    for idx, (shift_id, name, start, end, emp_count, cab_count) in enumerate(shifts, 1):
        total_emp_all += emp_count
        cabs_show = cab_count if cab_count else "0"
        print(f"  {idx:3} {name:25} {start:5}-{end:5} {emp_count:12} {cabs_show:8}")
    
    print(f"\n  ✅ Total employees across all shifts: {total_emp_all}")
    
    # 6. Zone Distribution
    print("\n6️⃣  ZONE DISTRIBUTION VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT zone, COUNT(*) count 
        FROM "Employee" 
        WHERE zone IS NOT NULL
        GROUP BY zone 
        ORDER BY zone
    ''')
    
    zones = cur.fetchall()
    zone_dict = {z: c for z, c in zones}
    total_in_zones = sum(c for z, c in zones)
    
    print(f"  Zone distribution (total: {total_in_zones}):")
    for zone in ['N', 'S', 'E', 'W']:
        count = zone_dict.get(zone, 0)
        print(f"    {zone}: {count:3} employees")
    
    # 7. Route Verification
    print("\n7️⃣  ROUTE VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            COUNT(*) total_routes,
            COUNT(DISTINCT "shiftId") shifts_with_routes,
            COUNT(DISTINCT "cabId") cabs_in_routes,
            SUM(CASE WHEN "tripSequence" IS NULL THEN 1 ELSE 0 END) null_sequence
        FROM "Route"
    ''')
    
    route_total, shifts_with_routes, cabs_in_routes, null_seq = cur.fetchone()
    print(f"  Total routes in database: {route_total}")
    print(f"  Shifts with routes: {shifts_with_routes}")
    print(f"  Cabs in routes: {cabs_in_routes}")
    print(f"  ❌ Routes with NULL sequence: {null_seq}")
    
    if null_seq == 0:
        print(f"  ✅ ALL ROUTES HAVE VALID SEQUENCE")
    
    # 8. Employee-to-Zone Mapping
    print("\n8️⃣  EMPLOYEE-TO-ZONE MAPPING VERIFICATION")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            COUNT(*) null_zones,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Employee"), 2) percent
        FROM "Employee"
        WHERE zone IS NULL
    ''')
    
    null_zones, null_percent = cur.fetchone()
    print(f"  ❌ Employees without zone: {null_zones} ({null_percent}%)")
    
    if null_zones == 0:
        print(f"  ✅ ALL EMPLOYEES HAVE ZONES ASSIGNED")
    
    # 9. Orphaned Data Check
    print("\n9️⃣  ORPHANED DATA CHECK")
    print("-" * 100)
    
    cur.execute('''
        SELECT COUNT(*) orphaned_routes
        FROM "Route" r
        WHERE NOT EXISTS (SELECT 1 FROM "Shift" s WHERE s.id = r."shiftId")
    ''')
    orphaned_routes = cur.fetchone()[0]
    print(f"  ❌ Routes with non-existent shift: {orphaned_routes}")
    
    cur.execute('''
        SELECT COUNT(*) orphaned_employees
        FROM "Employee" e
        WHERE "pickupPointId" IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "PickupPoint" p WHERE p.id = e."pickupPointId"
        )
    ''')
    orphaned_emp = cur.fetchone()[0]
    print(f"  ❌ Employees with non-existent pickup point: {orphaned_emp}")
    
    if orphaned_routes == 0 and orphaned_emp == 0:
        print(f"  ✅ NO ORPHANED DATA FOUND")
    
    # 10. Detailed Employee Status
    print("\n🔟 DETAILED EMPLOYEE STATUS")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            COUNT(*) total,
            SUM(CASE WHEN "shiftId" IS NULL THEN 1 ELSE 0 END) no_shift,
            SUM(CASE WHEN zone IS NULL THEN 1 ELSE 0 END) no_zone,
            SUM(CASE WHEN "pickupPointId" IS NULL THEN 1 ELSE 0 END) no_pp,
            SUM(CASE WHEN x IS NULL OR y IS NULL THEN 1 ELSE 0 END) no_coords
        FROM "Employee"
    ''')
    
    total, no_shift, no_zone, no_pp, no_coords = cur.fetchone()
    print(f"  Total employees: {total}")
    print(f"  ❌ Without shift: {no_shift}")
    print(f"  ❌ Without zone: {no_zone}")
    print(f"  ❌ Without pickup point: {no_pp}")
    print(f"  ❌ Without coordinates: {no_coords}")
    
    issues = no_shift + no_zone + no_pp + no_coords
    if issues == 0:
        print(f"  ✅ ALL {total} EMPLOYEES COMPLETE & VALID")
    else:
        print(f"\n  ⚠️  FOUND {issues} DATA QUALITY ISSUES")
    
    # SUMMARY
    print("\n" + "=" * 100)
    print("📊 SUMMARY")
    print("=" * 100)
    
    all_good = (null_coords == 0 and zero_coords == 0 and out_of_bounds == 0 and
                no_pp == 0 and pp_null == 0 and pp_zero == 0 and
                cab_null_home == 0 and cab_zero_home == 0 and
                null_zones == 0 and orphaned_routes == 0 and orphaned_emp == 0 and
                null_seq == 0 and no_shift == 0 and no_zone == 0 and no_coords == 0)
    
    if all_good:
        print("\n✅ ✅ ✅ ALL DATA IS VALID AND COMPLETE ✅ ✅ ✅")
        print(f"\n  • {total} employees with valid coordinates")
        print(f"  • {total_emp} employees assigned to shifts")
        print(f"  • {pp_total} pickup points with coordinates")
        print(f"  • {len(shifts)} unique shifts (no duplicates)")
        print(f"  • {cab_total} cabs with home locations")
        print(f"  • Zone distribution: N={zone_dict.get('N', 0)} S={zone_dict.get('S', 0)} E={zone_dict.get('E', 0)} W={zone_dict.get('W', 0)}")
        print(f"  • {route_total} routes in system")
        print("\n✅ READY FOR PRODUCTION ✅")
    else:
        print("\n⚠️  DATA ISSUES FOUND - SEE ABOVE FOR DETAILS")
        print("⚠️  FIX REQUIRED BEFORE RUNNING")
    
    print("\n" + "=" * 100)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
