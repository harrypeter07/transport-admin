import psycopg2
import os

# Connection string
DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Find all EXCEL-* employee codes
    cur.execute("""
        SELECT id, name, "employeeCode", email, status
        FROM "Employee"
        WHERE "employeeCode" LIKE 'EXCEL-%'
        ORDER BY "employeeCode"
    """)
    
    results = cur.fetchall()
    
    print("=" * 80)
    print("EMPLOYEES WITH EXCEL-* CODES")
    print("=" * 80)
    print(f"\nTotal: {len(results)}\n")
    
    for row in results:
        emp_id, name, code, email, status = row
        print(f"ID: {emp_id}")
        print(f"   Name: {name}")
        print(f"   Code: {code}")
        print(f"   Email: {email}")
        print(f"   Status: {status}\n")
    
    # Also get stats
    cur.execute("""
        SELECT COUNT(*) FROM "Employee" WHERE "employeeCode" LIKE 'EXCEL-%'
    """)
    excel_count = cur.fetchone()[0]
    
    cur.execute("""
        SELECT COUNT(*) FROM "Employee"
    """)
    total_count = cur.fetchone()[0]
    
    print(f"\n📊 Statistics:")
    print(f"   Total employees: {total_count}")
    print(f"   EXCEL-* codes: {excel_count}")
    print(f"   Percentage: {(excel_count/total_count*100):.1f}%")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
