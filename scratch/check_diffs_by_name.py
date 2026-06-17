import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env")
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

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

# Map JSON records by name
json_by_name = {r.get('Name', '').strip().lower(): r for r in valid_records}

diffs = []
for db_emp in db_employees:
    db_id, db_code, db_name, db_email, db_phone, db_gender, db_address, db_shift_id, db_shift_name, db_shift_start, db_pickup_id, db_pickup_name = db_emp
    
    name_key = db_name.strip().lower()
    if name_key in json_by_name:
        r = json_by_name[name_key]
        
        json_code = r.get('Emp ID', '').strip()
        json_name = r.get('Name', '').strip()
        json_email = clean_email(r.get('E mail ID', ''))
        json_phone = clean_phone(r.get('Contact No', ''))
        json_gender = 'MALE' if r.get('M/F', '').upper() == 'M' else 'FEMALE'
        json_address = r.get('Address', '').strip().replace('\n', ' ')
        json_shift_start = r.get('Shift Time', '').strip()
        json_pickup = r.get('Pick up point', '').strip()

        emp_diff = {}
        # Normalize comparison fields
        if db_name != json_name:
            emp_diff['name'] = (db_name, json_name)
        
        # Check code mismatch (note: DB might have -1 suffix, but let's check)
        if db_code != json_code and db_code.split('-')[0] != json_code:
            emp_diff['code'] = (db_code, json_code)

        if json_email and db_email != json_email:
            emp_diff['email'] = (db_email, json_email)

        if db_phone != json_phone:
            emp_diff['phone'] = (db_phone, json_phone)
        
        if db_gender != json_gender:
            emp_diff['gender'] = (db_gender, json_gender)
            
        # Normalize whitespace in addresses
        db_addr_norm = " ".join(db_address.split())
        json_addr_norm = " ".join(json_address.split())
        if db_addr_norm != json_addr_norm:
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

print(f"Total matched by name with differences: {len(diffs)} out of 66")
for d in diffs:
    print(f"\nEmployee: {d['employee']} ({d['code']})")
    for field, (db_val, json_val) in d['diff'].items():
        print(f"  * {field}: DB='{db_val}' | JSON='{json_val}'")
