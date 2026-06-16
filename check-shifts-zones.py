#!/usr/bin/env python3
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
    print("📋 SHIFTS IN DATABASE")
    print("=" * 80)
    
    # Get all shifts with employee count
    cur.execute('''
        SELECT s.id, s.name, s."startTime", s."endTime", COUNT(e.id) as emp_count
        FROM "Shift" s
        LEFT JOIN "Employee" e ON e."shiftId" = s.id
        GROUP BY s.id, s.name, s."startTime", s."endTime"
        ORDER BY s."startTime"
    ''')
    
    shifts = cur.fetchall()
    print(f"\nTotal shifts: {len(shifts)}\n")
    
    for idx, (shift_id, name, start, end, emp_count) in enumerate(shifts, 1):
        print(f"{idx:2}. {name:20} | {start:5} - {end:5} | {emp_count:2} employees")
    
    # Check for duplicates
    cur.execute('''
        SELECT "startTime", COUNT(*) as cnt
        FROM "Shift"
        GROUP BY "startTime"
        HAVING COUNT(*) > 1
    ''')
    
    duplicates = cur.fetchall()
    if duplicates:
        print("\n⚠️  DUPLICATE SHIFTS FOUND:")
        for start, count in duplicates:
            print(f"   {start} appears {count} times")
    else:
        print("\n✅ No duplicate shifts")
    
    # Check zone distribution
    print("\n" + "=" * 80)
    print("🗺️  EMPLOYEE ZONE DISTRIBUTION")
    print("=" * 80 + "\n")
    
    cur.execute('''
        SELECT zone, COUNT(*) as count
        FROM "Employee"
        GROUP BY zone
        ORDER BY zone
    ''')
    
    zones = cur.fetchall()
    total = sum(c for _, c in zones)
    for zone, count in zones:
        pct = (count/total)*100 if total > 0 else 0
        print(f"{zone}: {count} employees ({pct:.1f}%)")
    
    print(f"\nTotal: {total} employees")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
