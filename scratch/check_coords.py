import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Get coordinate statistics for employees
cur.execute("SELECT COUNT(*) FROM \"Employee\" WHERE x = 0.0 AND y = 0.0")
emp_zero = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM \"Employee\"")
emp_total = cur.fetchone()[0]

print(f"Employees: {emp_zero} out of {emp_total} have (0,0) coordinates")

# Get coordinate statistics for pickup points
cur.execute("SELECT COUNT(*) FROM \"PickupPoint\" WHERE x = 0.0 AND y = 0.0")
pp_zero = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM \"PickupPoint\"")
pp_total = cur.fetchone()[0]

print(f"Pickup points: {pp_zero} out of {pp_total} have (0,0) coordinates")

# Print a few examples of non-zero coordinates
if emp_zero < emp_total:
    cur.execute("SELECT name, x, y FROM \"Employee\" WHERE x != 0.0 LIMIT 5")
    print("\nNon-zero Employee Coordinates sample:")
    for row in cur.fetchall():
        print(f" - {row[0]}: ({row[1]}, {row[2]})")

if pp_zero < pp_total:
    cur.execute("SELECT name, x, y FROM \"PickupPoint\" WHERE x != 0.0 LIMIT 5")
    print("\nNon-zero PickupPoint Coordinates sample:")
    for row in cur.fetchall():
        print(f" - {row[0]}: ({row[1]}, {row[2]})")

cur.close()
conn.close()
