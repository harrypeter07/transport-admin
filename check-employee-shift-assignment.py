import psycopg2
from psycopg2.extras import RealDictCursor

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
    
    print("=" * 80)
    print("🔍 INVESTIGATING API & EMPLOYEE-SHIFT RELATIONSHIP")
    print("=" * 80)
    
    # Check total employees
    cur.execute("SELECT COUNT(*) as cnt FROM \"Employee\" WHERE status = 'ACTIVE'")
    total_emp = cur.fetchone()['cnt']
    print(f"\n✅ Total ACTIVE Employees: {total_emp}")
    
    # Check employees with shiftId assigned
    cur.execute("""
        SELECT COUNT(*) as cnt FROM "Employee" 
        WHERE status = 'ACTIVE' AND "shiftId" IS NOT NULL
    """)
    emp_with_shift = cur.fetchone()['cnt']
    print(f"📌 Employees WITH shiftId: {emp_with_shift}")
    
    # Check employees WITHOUT shiftId
    cur.execute("""
        SELECT COUNT(*) as cnt FROM "Employee" 
        WHERE status = 'ACTIVE' AND "shiftId" IS NULL
    """)
    emp_without_shift = cur.fetchone()['cnt']
    print(f"⚠️  Employees WITHOUT shiftId: {emp_without_shift}")
    
    # Check shifts
    cur.execute("SELECT COUNT(*) as cnt FROM \"Shift\"")
    total_shifts = cur.fetchone()['cnt']
    print(f"\n📍 Total Shifts: {total_shifts}")
    
    # List shifts
    cur.execute("""
        SELECT s.id, s.name, s."startTime", s."endTime", 
               COUNT(e.id) as emp_count 
        FROM "Shift" s 
        LEFT JOIN "Employee" e ON e."shiftId" = s.id AND e.status = 'ACTIVE'
        GROUP BY s.id, s.name, s."startTime", s."endTime"
        ORDER BY s."startTime"
    """)
    
    print(f"\n📊 SHIFTS WITH EMPLOYEE COUNTS:")
    for row in cur.fetchall():
        shift_id = row['id']
        name = row['name']
        start = row['startTime']
        end = row['endTime']
        count = row['emp_count'] or 0
        print(f"  {name:20s} ({start} - {end}): {count:2d} employees")
    
    # Check if all employees have null shiftId
    if emp_without_shift > 0:
        print(f"\n⚠️  ISSUE: {emp_without_shift} employees missing shift assignments!")
        print("   This is why optimization shows 'No active employees'")
    
    print("\n" + "=" * 80)
    
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
