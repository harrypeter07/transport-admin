import psycopg2
conn = psycopg2.connect('postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')
cur = conn.cursor()

# Check specific employees and their pickup points
cur.execute("""
    SELECT e.name, e.x, e.y, e.address, pp.name, pp.x, pp.y 
    FROM "Employee" e 
    LEFT JOIN "PickupPoint" pp ON e."pickupPointId" = pp.id 
    WHERE e.status = 'ACTIVE' AND (e.x = 0 OR e.y = 0 OR e.x IS NULL OR e.y IS NULL)
""")
rows = cur.fetchall()
print(f"Employees with zero/null coords: {len(rows)}")
for r in rows:
    print(f"  {r[0]} emp=({r[1]},{r[2]}) pp={r[4]} pp_xy=({r[5]},{r[6]})")

# Check pickup points with zero coords
cur.execute("SELECT name, x, y FROM \"PickupPoint\" WHERE x = 0 OR y = 0 OR x IS NULL OR y IS NULL")
rows = cur.fetchall()
print(f"\nPickup points with zero/null coords: {len(rows)}")
for r in rows:
    print(f"  {r[0]}")

cur.close()
conn.close()
