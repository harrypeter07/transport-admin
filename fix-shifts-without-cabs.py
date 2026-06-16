#!/usr/bin/env python3
"""
Fix shifts without cabs assigned
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
    print("🔧 ANALYZING SHIFT-CAB ASSIGNMENT")
    print("=" * 100)
    
    # Find shifts without cabs
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
    
    print("\n📊 SHIFT-CAB ASSIGNMENT STATUS:")
    print("-" * 100)
    
    shifts_without_cabs = []
    for shift_id, name, start, end, emp_count, cab_count in shifts:
        status = "✅" if cab_count > 0 else "❌"
        print(f"  {status} {name:25} | {start:5}-{end:5} | Emp: {emp_count:3} | Cabs: {cab_count}")
        if cab_count == 0 and emp_count > 0:
            shifts_without_cabs.append((shift_id, name, emp_count))
    
    if shifts_without_cabs:
        print(f"\n⚠️  FOUND {len(shifts_without_cabs)} SHIFTS WITHOUT CABS:")
        for shift_id, name, emp_count in shifts_without_cabs:
            print(f"    • {name} → {emp_count} employees need cabs")
        
        # Get all available cabs
        print(f"\n📋 AVAILABLE CABS TO ASSIGN:")
        cur.execute('''
            SELECT id, "vehicleNumber", capacity 
            FROM "Cab"
            ORDER BY "vehicleNumber"
        ''')
        
        cabs = cur.fetchall()
        print(f"  Found {len(cabs)} total cabs:")
        for cab_id, vnum, capacity in cabs:
            print(f"    • {vnum} (capacity: {capacity})")
        
        # Assign cabs to shifts without them
        print(f"\n🔗 ASSIGNING CABS TO SHIFTS:")
        
        cab_idx = 0
        for shift_id, name, emp_count in shifts_without_cabs:
            if cab_idx >= len(cabs):
                print(f"    ❌ Not enough cabs to assign to {name}")
                break
            
            cab_id, vnum, capacity = cabs[cab_idx]
            
            # Check if this cab is already assigned to another shift
            cur.execute('''
                SELECT COUNT(*) FROM "_CabToShift" 
                WHERE "A" = %s
            ''', (cab_id,))
            
            existing_count = cur.fetchone()[0]
            
            if existing_count > 0:
                print(f"    ⚠️  {vnum} already assigned to another shift, skipping")
                cab_idx += 1
                continue
            
            # Assign this cab to the shift
            cur.execute('''
                INSERT INTO "_CabToShift" ("A", "B")
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
            ''', (cab_id, shift_id))
            
            conn.commit()
            print(f"    ✅ Assigned {vnum} (cap: {capacity}) → {name}")
            cab_idx += 1
        
        print(f"\n✅ CAB ASSIGNMENT COMPLETE")
    else:
        print(f"\n✅ ALL SHIFTS HAVE CABS ASSIGNED")
    
    # Verify after assignment
    print(f"\n📊 VERIFICATION AFTER ASSIGNMENT:")
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
    all_good = True
    
    for shift_id, name, start, end, emp_count, cab_count in shifts:
        if emp_count == 0:
            continue
        status = "✅" if cab_count > 0 else "❌"
        if cab_count == 0:
            all_good = False
        print(f"  {status} {name:25} | Emp: {emp_count:3} | Cabs: {cab_count}")
    
    if all_good:
        print(f"\n✅ ALL SHIFTS WITH EMPLOYEES NOW HAVE CABS")
    
    print("\n" + "=" * 100)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
