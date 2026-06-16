import psycopg2
conn = psycopg2.connect('postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')
cur = conn.cursor()

print("=== Shift Summary ===")
cur.execute('SELECT s.name, s."startTime", COUNT(e.id) FROM "Shift" s LEFT JOIN "Employee" e ON e."shiftId" = s.id AND e.status = \'ACTIVE\' GROUP BY s.id ORDER BY s."startTime"')
for name, start, count in cur.fetchall():
    print(f"  {name or '?':<30} {start or '?':<10} {count} employees")

print("\n=== Employees without shift ===")
cur.execute('SELECT name, "employeeCode" FROM "Employee" WHERE status = \'ACTIVE\' AND "shiftId" IS NULL LIMIT 10')
rows = cur.fetchall()
for r in rows:
    print(f"  {r[0]} ({r[1]})")
if not rows:
    print("  (none - all employees have shifts)")

print("\n=== Cabs linked to shifts ===")
cur.execute('''
    SELECT s.name, COUNT(DISTINCT c.id)
    FROM "Shift" s
    LEFT JOIN "_CabToShift" cs ON cs."B" = s.id
    LEFT JOIN "Cab" c ON c.id = cs."A" AND c.status = 'AVAILABLE'
    GROUP BY s.id ORDER BY s."startTime"
''')
for name, count in cur.fetchall():
    print(f"  {name or '?':<30} {count} cabs")

cur.close()
conn.close()
