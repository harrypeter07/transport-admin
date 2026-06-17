import json

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

print("Searching for '2576584' in valid records:")
for r in valid_records:
    if '2576584' in str(r.get('Emp ID')) or 'deepak' in r.get('Name', '').lower() or 'yash' in r.get('Name', '').lower():
        print(f"Record: {r}")

print("\nSearching in all raw records (including headers or invalid ones):")
for idx, r in enumerate(raw_data):
    if '2576584' in str(r.get('Emp ID')) or 'deepak' in str(r.get('Name', '')).lower() or 'yash' in str(r.get('Name', '')).lower():
        print(f"[{idx}]: {r}")
