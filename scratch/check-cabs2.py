import psycopg2
conn = psycopg2.connect('postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')
cur = conn.cursor()

print("=== All Cabs ===")
cur.execute('SELECT "vehicleNumber", "driverName", capacity, status FROM "Cab" ORDER BY "vehicleNumber"')
for row in cur.fetchall():
    vnum = (row[0] or "?")
    driver = (row[1] or "?")
    cap = row[2]
    status = row[3]
    print(f"  {vnum} driver={driver} cap={cap} status={status}")

print("\n=== Cab count by status ===")
cur.execute('SELECT status, COUNT(*) FROM "Cab" GROUP BY status')
for status, count in cur.fetchall():
    print(f"  {status}: {count}")

print("\n=== Total cabs available ===")
cur.execute('SELECT COUNT(*) FROM "Cab" WHERE status = \'AVAILABLE\'')
print(f"  Available: {cur.fetchone()[0]}")
cur.execute('SELECT COUNT(*) FROM "Cab"')
print(f"  Total: {cur.fetchone()[0]}")

cur.close()
conn.close()
