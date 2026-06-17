import os
import json
import psycopg2
from dotenv import load_dotenv

# Load env variables from root .env
load_dotenv(dotenv_path="../.env")

DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

print(f"Connecting to database: {DATABASE_URL.split('@')[-1]}")

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Get shifts
    cur.execute("SELECT id, name, \"startTime\", \"endTime\" FROM \"Shift\"")
    shifts = cur.fetchall()
    print("\n--- SHIFTS ---")
    for s in shifts:
        print(f"ID: {s[0]} | Name: {s[1]} | Start Time: {s[2]} | End Time: {s[3]}")

    # Get total employees and count of those with/without shiftId
    cur.execute("SELECT COUNT(*) FROM \"Employee\"")
    total_emp = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM \"Employee\" WHERE \"shiftId\" IS NULL")
    null_shift_emp = cur.fetchone()[0]

    print(f"\n--- EMPLOYEES ---")
    print(f"Total Employees: {total_emp}")
    print(f"Employees with NULL Shift ID: {null_shift_emp}")

    # Sample employees
    cur.execute("SELECT id, \"employeeCode\", name, email, phone, gender, \"shiftId\" FROM \"Employee\" LIMIT 10")
    sample_emp = cur.fetchall()
    print("\nSample 10 Employees:")
    for e in sample_emp:
        print(f"ID: {e[0]} | Code: {e[1]} | Name: {e[2]} | Email: {e[3]} | Phone: {e[4]} | Gender: {e[5]} | Shift ID: {e[6]}")

    cur.close()
    conn.close()

except Exception as e:
    print(f"Error checking DB: {e}")
