#!/usr/bin/env python3
"""
Check for duplicate employees
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
    print("🔍 CHECKING FOR DUPLICATE EMPLOYEES")
    print("=" * 100)
    
    # Check for duplicate emails
    print("\n1️⃣  DUPLICATE EMAILS:")
    print("-" * 100)
    
    cur.execute('''
        SELECT email, COUNT(*) count
        FROM "Employee"
        GROUP BY email
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    ''')
    
    duplicates = cur.fetchall()
    if duplicates:
        print(f"  ❌ Found {len(duplicates)} email duplicates:")
        for email, count in duplicates:
            print(f"    • {email}: {count} times")
            cur.execute('SELECT id, name, "shiftId" FROM "Employee" WHERE email = %s', (email,))
            for emp_id, name, shift_id in cur.fetchall():
                print(f"      - {name} ({emp_id[:8]}...) → Shift {shift_id[:8]}...")
    else:
        print(f"  ✅ No duplicate emails")
    
    # Check for duplicate phones
    print("\n2️⃣  DUPLICATE PHONES:")
    print("-" * 100)
    
    cur.execute('''
        SELECT phone, COUNT(*) count
        FROM "Employee"
        WHERE phone IS NOT NULL AND phone != ''
        GROUP BY phone
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    ''')
    
    duplicates = cur.fetchall()
    if duplicates:
        print(f"  ❌ Found {len(duplicates)} phone duplicates:")
        for phone, count in duplicates:
            print(f"    • {phone}: {count} times")
    else:
        print(f"  ✅ No duplicate phones")
    
    # Check for duplicate employee codes
    print("\n3️⃣  DUPLICATE EMPLOYEE CODES:")
    print("-" * 100)
    
    cur.execute('''
        SELECT "employeeCode", COUNT(*) count
        FROM "Employee"
        GROUP BY "employeeCode"
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    ''')
    
    duplicates = cur.fetchall()
    if duplicates:
        print(f"  ❌ Found {len(duplicates)} code duplicates:")
        for code, count in duplicates:
            print(f"    • {code}: {count} times")
    else:
        print(f"  ✅ No duplicate employee codes")
    
    # Check for duplicate names
    print("\n4️⃣  DUPLICATE NAMES:")
    print("-" * 100)
    
    cur.execute('''
        SELECT name, COUNT(*) count
        FROM "Employee"
        GROUP BY name
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    ''')
    
    duplicates = cur.fetchall()
    if duplicates:
        print(f"  ⚠️  Found {len(duplicates)} name duplicates (may be legitimate):")
        for name, count in duplicates:
            print(f"    • {name}: {count} times")
    else:
        print(f"  ✅ No duplicate names")
    
    # Total employee count
    print("\n5️⃣  TOTAL EMPLOYEE COUNT:")
    print("-" * 100)
    
    cur.execute('SELECT COUNT(*) FROM "Employee"')
    total = cur.fetchone()[0]
    print(f"  Total employees in database: {total}")
    
    if total == 66:
        print(f"  ✅ Correct count (66 expected)")
    else:
        print(f"  ❌ WRONG COUNT! Expected 66, got {total}")
    
    print("\n" + "=" * 100)
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
