#!/usr/bin/env python3
"""Check cab data in database"""
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
    
    cur.execute('SELECT "vehicleNumber", "driverName", "driverX", "driverY" FROM "Cab"')
    cabs = cur.fetchall()
    
    print("Cabs in database:")
    for vehicle, driver, x, y in cabs:
        print(f"  {vehicle:12} | {driver:25} | X={x}, Y={y}")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
