import psycopg2
import os
from datetime import datetime

DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Check if we can see when records were created
    # PostgreSQL doesn't track creation time by default, but Prisma usually adds createdAt
    
    print("=" * 80)
    print("ANALYZING TRANSPORT ROSTER CREATION")
    print("=" * 80)
    
    # Check the schema to see if there's a createdAt column
    cur.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'TransportRoster'
        ORDER BY ordinal_position
    """)
    
    print("\n📋 TransportRoster columns:")
    for col_name, data_type in cur.fetchall():
        print(f"   {col_name}: {data_type}")
    
    # Count records by sourceSheet if available
    cur.execute("""
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'TransportRoster' 
        AND COLUMN_NAME = 'sourceSheet'
    """)
    
    has_source_sheet = cur.fetchone()
    
    if has_source_sheet:
        print("\n📊 TransportRoster records for 2026-06-16 by sourceSheet:")
        cur.execute("""
            SELECT "sourceSheet", COUNT(*) as count
            FROM "TransportRoster"
            WHERE date = '2026-06-16'
            GROUP BY "sourceSheet"
        """)
        
        for sheet, count in cur.fetchall():
            print(f"   {sheet}: {count}")
    
    # Check CabRosterStatus as well
    print("\n📊 CabRosterStatus records for 2026-06-16:")
    cur.execute("""
        SELECT "cabRosterStatus", COUNT(*) as count
        FROM "CabRosterStatus"
        WHERE date = '2026-06-16'
        GROUP BY "cabRosterStatus"
    """)
    
    for status, count in cur.fetchall():
        print(f"   {status}: {count}")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
