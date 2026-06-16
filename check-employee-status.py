import psycopg2
import os

DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Get all employees by status
    cur.execute("""
        SELECT status, COUNT(*) as count
        FROM "Employee"
        GROUP BY status
    """)
    
    print("=" * 80)
    print("EMPLOYEE STATUS BREAKDOWN")
    print("=" * 80)
    for status, count in cur.fetchall():
        print(f"{status}: {count}")
    
    # Get the ACTIVE employees that would be used in sync-gtpl-16june.ts
    cur.execute("""
        SELECT COUNT(*)
        FROM "Employee"
        WHERE status = 'ACTIVE'
    """)
    active_count = cur.fetchone()[0]
    print(f"\nAC TIVE employees used in sync logic: {active_count}")
    
    # Get inactive employees
    cur.execute("""
        SELECT id, name, "employeeCode", status
        FROM "Employee"
        WHERE status != 'ACTIVE'
        ORDER BY name
    """)
    
    print(f"\nINACTIVE employees (won't be in dbEmpNames):")
    for emp_id, name, code, status in cur.fetchall():
        print(f"  {name} ({code}) - {status}")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
