import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

cur.execute("""
    SELECT id, "employeeCode", name, email, phone, gender, address, "shiftId", "pickupPointId"
    FROM "Employee"
    WHERE name ILIKE '%yash karambe%' OR name ILIKE '%kushwah%'
""")
rows = cur.fetchall()
for r in rows:
    print(f"ID: {r[0]} | Code: {r[1]} | Name: {r[2]} | Email: {r[3]} | Phone: {r[4]} | Gender: {r[5]} | Shift ID: {r[7]} | Pickup ID: {r[8]}")

cur.close()
conn.close()
