#!/usr/bin/env python3
"""
Remove duplicate shifts and consolidate employees
Keep: Shift 07:00, Shift 09:00, IST 13:00
Remove: IST 07:00, IST 09:00, Shift 13:00
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
    print("🔧 REMOVING DUPLICATE SHIFTS & CONSOLIDATING EMPLOYEES")
    print("=" * 100)
    
    # Define shifts to remove and their replacements
    consolidations = [
        {'remove_id': 'shift-0700', 'remove_name': 'IST 07:00', 'keep_id': '1b66fec0-f7d3-473e-8665-2721ba2c7f72', 'keep_name': 'Shift 07:00'},
        {'remove_id': 'shift-0900', 'remove_name': 'IST 09:00', 'keep_id': '1be10596-ddbe-4867-951f-3826040ec683', 'keep_name': 'Shift 09:00'},
        {'remove_id': 'c24a3060-e4f8-429b-aeae-d0d6b402d34e', 'remove_name': 'Shift 13:00', 'keep_id': 'shift-1300', 'keep_name': 'IST 13:00'},
    ]
    
    print("\n📋 CONSOLIDATION PLAN:\n")
    for cons in consolidations:
        # Get employee count in each
        cur.execute('SELECT COUNT(*) FROM "Employee" WHERE "shiftId" = %s', (cons['remove_id'],))
        remove_count = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM "Employee" WHERE "shiftId" = %s', (cons['keep_id'],))
        keep_count = cur.fetchone()[0]
        
        print(f"  REMOVE: {cons['remove_name']:20} ({remove_count} employees) ID: {cons['remove_id']}")
        print(f"  KEEP:   {cons['keep_name']:20} ({keep_count} employees) ID: {cons['keep_id']}")
        print(f"  → Moving {remove_count} employees to {cons['keep_name']}\n")
    
    # Perform consolidations
    total_consolidated = 0
    for cons in consolidations:
        # Move employees from remove_id to keep_id
        cur.execute('''
            UPDATE "Employee"
            SET "shiftId" = %s
            WHERE "shiftId" = %s
        ''', (cons['keep_id'], cons['remove_id']))
        
        moved = cur.rowcount
        total_consolidated += moved
        
        # Move/update routes from remove_id to keep_id
        cur.execute('''
            UPDATE "Route"
            SET "shiftId" = %s
            WHERE "shiftId" = %s
        ''', (cons['keep_id'], cons['remove_id']))
        
        routes_moved = cur.rowcount
        
        # Remove from _CabToShift junction
        cur.execute('DELETE FROM "_CabToShift" WHERE "B" = %s', (cons['remove_id'],))
        
        # Delete the shift
        cur.execute('DELETE FROM "Shift" WHERE id = %s', (cons['remove_id'],))
        
        conn.commit()
        print(f"  ✅ Consolidated {moved} employees + {routes_moved} routes from {cons['remove_name']}")
    
    print(f"\n✅ TOTAL EMPLOYEES CONSOLIDATED: {total_consolidated}")
    
    # Verify final state
    print("\n" + "=" * 100)
    print("📊 FINAL SHIFT STATE:\n")
    
    cur.execute('''
        SELECT s.id, s.name, s."startTime", s."endTime", COUNT(e.id) as emp_count
        FROM "Shift" s
        LEFT JOIN "Employee" e ON e."shiftId" = s.id
        GROUP BY s.id, s.name, s."startTime", s."endTime"
        ORDER BY s."startTime"
    ''')
    
    shifts = cur.fetchall()
    print(f"Total shifts remaining: {len(shifts)}\n")
    print(f"{'#':3} {'Name':20} {'Start-End':12} {'Employees':10}")
    print("-" * 50)
    
    for idx, (shift_id, name, start, end, emp_count) in enumerate(shifts, 1):
        print(f"{idx:3} {name:20} {start:5}-{end:5} {emp_count:10}")
    
    print("\n" + "=" * 100)
    print("✅ DUPLICATE SHIFTS REMOVED - Database cleaned!")
    print("=" * 100)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
