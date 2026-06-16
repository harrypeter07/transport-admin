import psycopg2
conn = psycopg2.connect('postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')
cur = conn.cursor()
cur.execute("""
    SELECT e.name, e.x, e.y, e.address, pp.name as pp_name, pp.x as pp_x, pp.y as pp_y 
    FROM "Employee" e 
    LEFT JOIN "PickupPoint" pp ON e."pickupPointId" = pp.id 
    WHERE e.status = 'ACTIVE' 
    LIMIT 15
""")
rows = cur.fetchall()
print("Employee -> PickupPoint check:")
for r in rows:
    emp_name = (r[0] or '')[:28]
    emp_xy = f"({float(r[1]):.3f},{float(r[2]):.3f})" if r[1] and r[2] else "(none)"
    pp_name = (r[4] or 'NO PICKUP')[:25]
    if r[5] and r[6]:
        pp_xy = f"({float(r[5]):.3f},{float(r[6]):.3f})"
    else:
        pp_xy = "(no coords)"
    print(f"  {emp_name:<28} emp={emp_xy:<18} pp={pp_name:<25} pp_xy={pp_xy}")

cur.close()
conn.close()
