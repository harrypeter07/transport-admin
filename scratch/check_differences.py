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

def clean_phone(phone):
    if not phone or phone.lower() == 'escort' or not any(c.isdigit() for c in phone):
        return '0000000000'
    return phone.strip()

def clean_email(email):
    if not email or email.lower() == 'escort':
        return None
    email = email.strip().lower()
    if '@' in email:
        return email
    return None

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Get all DB employees
cur.execute("""
    SELECT e.id, e."employeeCode", e.name, e.email, e.phone, e.gender, e.address, 
           s.id as "shiftId", s.name as "shiftName", s."startTime" as "shiftStart",
           p.id as "pickupId", p.name as "pickupName"
    FROM "Employee" e
    LEFT JOIN "Shift" s ON e."shiftId" = s.id
    LEFT JOIN "PickupPoint" p ON e."pickupPointId" = p.id
""")
db_employees = cur.fetchall()

# Map DB employees by code, email, name
db_by_code = {emp[1].strip().lower(): emp for emp in db_employees}
db_by_name = {emp[2].strip().lower(): emp for emp in db_employees}
db_by_email = {emp[3].strip().lower(): emp for emp in db_employees if emp[3]}

# Match records and collect diffs
diffs = []
matched_ids = set()

for r in valid_records:
    emp_id = r.get('Emp ID', '').strip().lower()
    name = r.get('Name', '').strip().lower()
    email = r.get('E mail ID', '').strip().lower()

    matched_emp = None
    match_method = ""
    
    if emp_id != 'na' and emp_id in db_by_code:
        matched_emp = db_by_code[emp_id]
        match_method = "code"
    elif email and email in db_by_email:
        matched_emp = db_by_email[email]
        match_method = "email"
    elif name in db_by_name:
        matched_emp = db_by_name[name]
        match_method = "name"
    
    if matched_emp:
        db_id, db_code, db_name, db_email, db_phone, db_gender, db_address, db_shift_id, db_shift_name, db_shift_start, db_pickup_id, db_pickup_name = matched_emp
        matched_ids.add(db_id)

        json_name = r.get('Name', '').strip()
        json_email = clean_email(r.get('E mail ID', ''))
        json_phone = clean_phone(r.get('Contact No', ''))
        json_gender = 'MALE' if r.get('M/F', '').upper() == 'M' else 'FEMALE'
        json_address = r.get('Address', '').strip().replace('\n', ' ')
        json_shift_start = r.get('Shift Time', '').strip()
        json_pickup = r.get('Pick up point', '').strip()

        # Compare
        emp_diff = {}
        if db_name != json_name:
            emp_diff['name'] = (db_name, json_name)
        
        # Email comparison
        if db_email != json_email:
            # Check if JSON email is not None
            if json_email:
                emp_diff['email'] = (db_email, json_email)

        if db_phone != json_phone:
            emp_diff['phone'] = (db_phone, json_phone)
        
        if db_gender != json_gender:
            emp_diff['gender'] = (db_gender, json_gender)
            
        if db_address.strip() != json_address.strip():
            emp_diff['address'] = (db_address, json_address)

        if db_shift_start != json_shift_start:
            emp_diff['shift'] = (db_shift_start, json_shift_start)
            
        if db_pickup_name != json_pickup:
            emp_diff['pickup'] = (db_pickup_name, json_pickup)

        if emp_diff:
            diffs.append({
                'employee': db_name,
                'code': db_code,
                'diff': emp_diff
            })

print(f"Total matched employees with differences: {len(diffs)} out of 66")
for d in diffs:
    print(f"\nEmployee: {d['employee']} ({d['code']})")
    for field, (db_val, json_val) in d['diff'].items():
        print(f"  * {field}: DB='{db_val}' | JSON='{json_val}'")

cur.close()
conn.close()
