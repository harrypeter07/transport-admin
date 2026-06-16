import psycopg2
import os

DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("=" * 80)
    print("TRANSPORT ROSTER CREATION TIMELINE")
    print("=" * 80)
    
    # Get creation timestamps
    cur.execute("""
        SELECT DATE(\"createdAt\") as creation_date, COUNT(*) as count
        FROM "TransportRoster"
        WHERE date = '2026-06-16'
        GROUP BY DATE(\"createdAt\")
        ORDER BY DATE(\"createdAt\") DESC
    """)
    
    results = cur.fetchall()
    print(f"\nRecords created by date:")
    for date, count in results:
        print(f"   {date}: {count} records")
    
    # Get the actual timestamps (first and last)
    cur.execute("""
        SELECT 
            MIN("createdAt") as first_created,
            MAX("createdAt") as last_created,
            COUNT(*) as total
        FROM "TransportRoster"
        WHERE date = '2026-06-16'
    """)
    
    first, last, total = cur.fetchone()
    print(f"\n⏱️  Creation timestamp range:")
    print(f"   First: {first}")
    print(f"   Last: {last}")
    print(f"   Total records: {total}")
    
    # Check for any batch patterns (records created at similar times)
    cur.execute("""
        SELECT "createdAt", COUNT(*) as count
        FROM "TransportRoster"
        WHERE date = '2026-06-16'
        GROUP BY "createdAt"
        ORDER BY count DESC
        LIMIT 5
    """)
    
    print(f"\nTop creation timestamps (batch size):")
    for ts, count in cur.fetchall():
        print(f"   {ts}: {count} records")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
