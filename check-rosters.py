import psycopg2
import os

DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Check TransportRoster for 2026-06-16
    cur.execute("""
        SELECT 
            tr."transportRosterStatus",
            COUNT(*) as count,
            array_agg(DISTINCT e.name ORDER BY e.name) as employee_names
        FROM "TransportRoster" tr
        JOIN "Employee" e ON tr."employeeId" = e.id
        WHERE tr.date = '2026-06-16'
        GROUP BY tr."transportRosterStatus"
    """)
    
    results = cur.fetchall()
    
    print("=" * 80)
    print("TRANSPORT ROSTER STATUS FOR 2026-06-16")
    print("=" * 80)
    
    total = 0
    for status, count, names in results:
        print(f"\n{status}: {count}")
        total += count
        if names:
            for name in names[:10]:
                print(f"   - {name}")
            if len(names) > 10:
                print(f"   ... and {len(names) - 10} more")
    
    print(f"\n📊 Total TransportRoster records for 2026-06-16: {total}")
    
    # Get all unique employees in rosters
    cur.execute("""
        SELECT COUNT(DISTINCT "employeeId")
        FROM "TransportRoster"
        WHERE date = '2026-06-16'
    """)
    unique_emps = cur.fetchone()[0]
    print(f"📊 Unique employees in rosters: {unique_emps}")
    
    # Check if there are any transport rosters for other dates
    cur.execute("""
        SELECT DISTINCT date FROM "TransportRoster" ORDER BY date DESC LIMIT 5
    """)
    dates = cur.fetchall()
    print(f"\n📅 Recent TransportRoster dates:")
    for (date,) in dates:
        cur.execute("""
            SELECT COUNT(*) FROM "TransportRoster" WHERE date = %s
        """, (date,))
        count = cur.fetchone()[0]
        print(f"   {date}: {count} records")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
