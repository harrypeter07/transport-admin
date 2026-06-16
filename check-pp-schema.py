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
    
    # Get column info
    cur.execute('''
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'PickupPoint'
        ORDER BY ordinal_position
    ''')
    
    print("PickupPoint columns:")
    for col, dtype in cur.fetchall():
        print(f"  {col:20} | {dtype}")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
