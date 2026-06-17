import os
import json
import psycopg2
from dotenv import load_dotenv

# Load env
load_dotenv(dotenv_path="../.env")

DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

# Read newdata.json
json_path = 'data/newdata.json'
with open(json_path, 'r', encoding='utf-8') as f:
    raw_data = json.load(f)

# Helper to validate record
def is_valid_record(record):
    if not record.get('Name') or not record.get('Emp ID'):
        return False
    name = record.get('Name', '').strip()
    emp_id = record.get('Emp ID', '').strip()
    if name.lower() in ['name', 'escort'] or emp_id.lower() in ['emp id', 'escort']:
        return False
    return True

valid_records = [r for r in raw_data if is_valid_record(r)]

print(f"Total valid JSON records: {len(valid_records)}")

# Collect unique shifts in JSON
shift_times = set()
for r in valid_records:
    s_time = r.get('Shift Time', '').strip()
    if s_time:
        shift_times.add(s_time)

print(f"\nUnique Shift Times in JSON: {sorted(list(shift_times))}")

# Connect to DB to check match rates
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Get all DB employees
cur.execute("SELECT id, \"employeeCode\", name, email, phone, gender, address, \"shiftId\" FROM \"Employee\"")
db_employees = cur.fetchall()
cur.close()
conn.close()

print(f"\nTotal Employees in DB: {len(db_employees)}")

db_by_code = {emp[1].strip().lower(): emp for emp in db_employees}
db_by_name = {emp[2].strip().lower(): emp for emp in db_employees}
db_by_email = {emp[3].strip().lower(): emp for emp in db_employees if emp[3]}

matched_by_code = 0
matched_by_email = 0
matched_by_name = 0
unmatched = []

for r in valid_records:
    emp_id = r.get('Emp ID', '').strip().lower()
    name = r.get('Name', '').strip().lower()
    email = r.get('E mail ID', '').strip().lower()

    matched = None
    match_reason = ""
    
    if emp_id != 'na' and emp_id in db_by_code:
        matched = db_by_code[emp_id]
        matched_by_code += 1
        match_reason = "code"
    elif email and email in db_by_email:
        matched = db_by_email[email]
        matched_by_email += 1
        match_reason = "email"
    elif name in db_by_name:
        matched = db_by_name[name]
        matched_by_name += 1
        match_reason = "name"
    
    if not matched:
        unmatched.append(r)

print(f"\nMatch statistics:")
print(f"Matched by Code: {matched_by_code}")
print(f"Matched by Email: {matched_by_email}")
print(f"Matched by Name: {matched_by_name}")
print(f"Unmatched: {len(unmatched)}")

if unmatched:
    print("\nSome unmatched examples:")
    for idx, r in enumerate(unmatched[:10]):
        print(f"{idx+1}. ID: {r.get('Emp ID')} | Name: '{r.get('Name')}' | Email: '{r.get('E mail ID')}' | Shift: '{r.get('Shift Time')}'")
