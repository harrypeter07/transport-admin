import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Get count of employees with userId
cur.execute("SELECT COUNT(*) FROM \"Employee\" WHERE \"userId\" IS NOT NULL")
emp_with_user = cur.fetchone()[0]
print(f"Employees with linked User ID: {emp_with_user}")

if emp_with_user > 0:
    cur.execute("""
        SELECT e.name, e.email, u.name, u.email, u.role
        FROM "Employee" e
        JOIN "User" u ON e."userId" = u.id
        LIMIT 10
    """)
    samples = cur.fetchall()
    print("\nSample links:")
    for s in samples:
        print(f"Emp Name: {s[0]} | Emp Email: {s[1]} | User Name: {s[2]} | User Email: {s[3]} | Role: {s[4]}")

cur.close()
conn.close()
