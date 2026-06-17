import json

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

print("Employees with empty Shift Time:")
for r in valid_records:
    if not r.get('Shift Time', '').strip():
        print(f"Name: {r.get('Name')} | Route: {r.get('Rout No')} | Emp ID: {r.get('Emp ID')}")
        # Find other people on the same route and their shift times
        same_route = [other for other in valid_records if other.get('Rout No') == r.get('Rout No') and other.get('Shift Time', '').strip()]
        shifts_on_route = set(other.get('Shift Time').strip() for other in same_route)
        print(f"  -> Other shift times on route {r.get('Rout No')}: {shifts_on_route}")
