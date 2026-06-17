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

# Get all DB pickup points
cur.execute("SELECT id, name, x, y, zone, \"subZone\", address, \"distanceRing\" FROM \"PickupPoint\"")
db_pickups = cur.fetchall()
cur.close()
conn.close()

db_pickup_names = set(p[1].strip().lower() for p in db_pickups)

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

json_pickups = set()
for r in raw_data:
    if is_valid_record(r):
        p = r.get('Pick up point', '').strip()
        if p:
            json_pickups.add(p)

print(f"Total pickup points in DB: {len(db_pickups)}")
print(f"Total pickup points in JSON: {len(json_pickups)}")

new_pickups = [p for p in json_pickups if p.lower() not in db_pickup_names]
print(f"\nNew pickup points in JSON not in DB ({len(new_pickups)}):")
for p in sorted(new_pickups):
    print(f" - {p}")
