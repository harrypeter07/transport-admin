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
    print("🔄 ASSIGNING EMPLOYEES TO SHIFTS")
    print("=" * 80)
    
    # Get all shifts sorted by startTime
    cur.execute("""
        SELECT id, name, "startTime" 
        FROM "Shift" 
        ORDER BY "startTime"
    """)
    shifts = cur.fetchall()
    print(f"\n📌 Available Shifts ({len(shifts)}):")
    for i, shift in enumerate(shifts):
        print(f"  {i}: {shift['name']} ({shift['startTime']})")
    
    # Get all employees
    cur.execute("""
        SELECT id FROM "Employee" 
        WHERE status = 'ACTIVE' 
        ORDER BY id
    """)
    employees = cur.fetchall()
    emp_count = len(employees)
    print(f"\n👥 Employees to assign: {emp_count}")
    
    # Distribute employees evenly across shifts
    shift_count = len(shifts)
    emp_per_shift = emp_count // shift_count
    remainder = emp_count % shift_count
    
    print(f"\n📊 Distribution:")
    print(f"  Employees per shift: {emp_per_shift}")
    print(f"  Extra employees: {remainder}")
    
    # Assign employees to shifts
    emp_index = 0
    updated_count = 0
    
    for shift_index, shift in enumerate(shifts):
        # First {remainder} shifts get one extra employee
        count = emp_per_shift + (1 if shift_index < remainder else 0)
        
        for _ in range(count):
            if emp_index < len(employees):
                emp_id = employees[emp_index]['id']
                shift_id = shift['id']
                
                cur.execute("""
                    UPDATE "Employee" 
                    SET "shiftId" = %s 
                    WHERE id = %s
                """, (shift_id, emp_id))
                
                updated_count += 1
                emp_index += 1
    
    conn.commit()
    print(f"\n✅ Updated {updated_count} employee shift assignments")
    
    # Verify
    cur.execute("""
        SELECT s.name, COUNT(e.id) as emp_count 
        FROM "Shift" s 
        LEFT JOIN "Employee" e ON e."shiftId" = s.id AND e.status = 'ACTIVE'
        GROUP BY s.id, s.name
        ORDER BY s."startTime"
    """)
    
    print(f"\n✅ FINAL DISTRIBUTION:")
    for row in cur.fetchall():
        count = row['emp_count'] or 0
        bar = "█" * (count // 2)
        print(f"  {row['name']:20s}: {count:2d} employees {bar}")
    
    print("\n" + "=" * 80)
    print(" ✅ ALL EMPLOYEES NOW ASSIGNED TO SHIFTS!")
    print("=" * 80)
    
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
