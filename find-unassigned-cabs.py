#!/usr/bin/env python3
"""
Find unassigned cabs and reassign to Shift 09:00
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
    print("🔍 CHECKING CAB ASSIGNMENTS")
    print("=" * 100)
    
    # Get all cabs
    cur.execute('SELECT id, "vehicleNumber" FROM "Cab" ORDER BY "vehicleNumber"')
    all_cabs = cur.fetchall()
    
    print(f"\n📋 ALL CABS ({len(all_cabs)}):")
    for cab_id, vnum in all_cabs:
        print(f"    • {vnum}: {cab_id}")
    
    # Get assigned cabs
    cur.execute('''
        SELECT DISTINCT "A" as cab_id, c."vehicleNumber"
        FROM "_CabToShift"
        JOIN "Cab" c ON c.id = "_CabToShift"."A"
        ORDER BY c."vehicleNumber"
    ''')
    
    assigned_cabs = cur.fetchall()
    assigned_ids = set(cab_id for cab_id, vnum in assigned_cabs)
    
    print(f"\n✅ ASSIGNED CABS ({len(assigned_cabs)}):")
    for cab_id, vnum in assigned_cabs:
        print(f"    • {vnum}")
    
    # Find unassigned cabs
    unassigned = [(cid, vnum) for cid, vnum in all_cabs if cid not in assigned_ids]
    
    if unassigned:
        print(f"\n🆓 UNASSIGNED CABS ({len(unassigned)}):")
        for cab_id, vnum in unassigned:
            print(f"    • {vnum}")
        
        # Get Shift 09:00
        cur.execute('SELECT id FROM "Shift" WHERE name = %s', ('Shift 09:00',))
        shift_result = cur.fetchone()
        
        if shift_result:
            shift_id = shift_result[0]
            print(f"\n🔗 ASSIGNING TO SHIFT 09:00:")
            
            for cab_id, vnum in unassigned:
                cur.execute('''
                    INSERT INTO "_CabToShift" ("A", "B")
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                ''', (cab_id, shift_id))
                print(f"    ✅ Assigned {vnum} to Shift 09:00")
            
            conn.commit()
            print(f"\n✅ ASSIGNMENT COMPLETE")
    else:
        print(f"\n⚠️  No unassigned cabs found")
    
    # Verify
    print(f"\n📊 FINAL VERIFICATION:")
    print("-" * 100)
    
    cur.execute('''
        SELECT 
            s.name, COUNT(e.id) emp_count, COUNT(DISTINCT c.id) cab_count
        FROM "Shift" s
        LEFT JOIN "Employee" e ON e."shiftId" = s.id
        LEFT JOIN "_CabToShift" cts ON cts."B" = s.id
        LEFT JOIN "Cab" c ON c.id = cts."A"
        WHERE s.name IN ('Shift 09:00', 'IST 13:00', 'Shift 07:00')
        GROUP BY s.name
        ORDER BY s.name
    ''')
    
    for name, emp_count, cab_count in cur.fetchall():
        status = "✅" if cab_count > 0 else "❌"
        print(f"  {status} {name:25} | Employees: {emp_count} | Cabs: {cab_count}")
    
    print("\n" + "=" * 100)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
