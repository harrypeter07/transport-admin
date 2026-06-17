import os
import json
import psycopg2
from dotenv import load_dotenv

# Load env from current directory
load_dotenv(dotenv_path=".env")
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'


conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Get all DB employees
cur.execute("SELECT id, \"employeeCode\", name, email FROM \"Employee\" ORDER BY name")
db_employees = cur.fetchall()
cur.close()
conn.close()

# Read newdata.json
json_path = 'data/newdata.json'
with open(json_path, 'r', encoding='utf-8') as f:
    raw_data = json.load(f)

def is_valid_record(record):
    if not record.get('Name') or not record.get('Emp ID'):
        return False
    name = record.get('Name', '').strip()
    emp_id = record.get('Emp ID', '').strip()
    if name.lower() in ['name', 'escort'] or emp_id.lower() in ['emp id', 'escort']:
        return False
    return True

json_names = sorted(list(set(r.get('Name', '').strip() for r in raw_data if is_valid_record(r))))
db_names = sorted([emp[2].strip() for emp in db_employees])

print(f"Number of DB employees: {len(db_names)}")
print(f"Number of valid JSON employee names: {len(json_names)}")

print("\nAll DB Employee Names:")
for n in db_names:
    print(f" - {n}")

print("\nAll JSON Employee Names:")
for n in json_names:
    print(f" - {n}")

# Check which DB names are not in JSON and vice versa
db_names_set = set(n.lower() for n in db_names)
json_names_set = set(n.lower() for n in json_names)

print("\nNames in DB but not in JSON:")
print([n for n in db_names if n.lower() not in json_names_set])

print("\nNames in JSON but not in DB:")
print([n for n in json_names if n.lower() not in db_names_set])
