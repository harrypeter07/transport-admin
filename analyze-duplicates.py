#!/usr/bin/env python3
"""
Check for duplicate shifts and consolidate if needed
Database should have 11 unique shifts, not 12 or 13
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
    print("🔍 ANALYZING SHIFTS FOR DUPLICATES")
    print("=" * 100)
    
    # Get all shifts with employee count
    cur.execute('''
        SELECT s.id, s.name, s."startTime", s."endTime", COUNT(e.id) as emp_count
        FROM "Shift" s
        LEFT JOIN "Employee" e ON e."shiftId" = s.id
        GROUP BY s.id, s.name, s."startTime", s."endTime"
        ORDER BY s."startTime"
    ''')
    
    shifts = cur.fetchall()
    print(f"\nTotal shifts in database: {len(shifts)}\n")
    print(f"{'#':3} {'Name':20} {'Start-End':12} {'Employees':10} {'Duplicate?':15}")
    print("-" * 80)
    
    shift_times = {}
    duplicates = []
    
    for idx, (shift_id, name, start, end, emp_count) in enumerate(shifts, 1):
        key = start
        is_dup = "NO"
        if key in shift_times:
            is_dup = "⚠️  YES"
            duplicates.append({
                'id': shift_id,
                'name': name,
                'start': start,
                'employees': emp_count,
                'other': shift_times[key]
            })
        else:
            shift_times[key] = {'id': shift_id, 'name': name}
        
        print(f"{idx:3} {name:20} {start:5}-{end:5} {emp_count:10} {is_dup:15}")
    
    print("\n" + "=" * 100)
    
    if duplicates:
        print("⚠️  DUPLICATE SHIFTS FOUND (same start time):\n")
        for dup in duplicates:
            print(f"  Shift: {dup['name']:20} | Start: {dup['start']} | Employees: {dup['employees']}")
            print(f"    ID: {dup['id']}")
        
        print("\n❓ RECOMMENDATION:")
        print("  These shifts have the same start time but different names.")
        print("  Should they be merged? Check employee assignments first.")
    else:
        print("✅ NO DUPLICATE SHIFTS - All shift times are unique")
    
    print("\n" + "=" * 100)
    print("Zone Distribution:")
    cur.execute('''
        SELECT zone, COUNT(*) as count
        FROM "Employee"
        GROUP BY zone
        ORDER BY zone
    ''')
    
    for zone, count in cur.fetchall():
        print(f"  {zone}: {count} employees")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
