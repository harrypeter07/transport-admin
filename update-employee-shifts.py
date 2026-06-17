import os
import json
import psycopg2
from dotenv import load_dotenv

# Load database credentials
load_dotenv(dotenv_path=".env")
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

print("=" * 80)
print("Employee & Shift DB Updater")
print("=" * 80)
print(f"Connecting to database: {DATABASE_URL.split('@')[-1]}")

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

def calculate_end_time(start_time):
    try:
        parts = start_time.split(':')
        start_hour = int(parts[0])
        start_min = int(parts[1])
        end_hour = (start_hour + 9) % 24
        return f"{end_hour:02d}:{start_min:02d}"
    except Exception:
        return start_time

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Read newdata.json
    json_path = 'data/newdata.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    # Validate records
    def is_valid_record(record):
        if not record.get('Name') or not record.get('Emp ID'):
            return False
        name = record.get('Name', '').strip()
        emp_id = record.get('Emp ID', '').strip()
        if name.lower() in ['name', 'escort'] or emp_id.lower() in ['emp id', 'escort']:
            return False
        return True

    valid_records = [r for r in raw_data if is_valid_record(r)]
    print(f"\nLoaded {len(valid_records)} valid employee records from {json_path}.")

    # Pre-infer missing shift times based on route passengers
    route_shifts = {}
    for r in valid_records:
        route = r.get('Rout No', '').strip()
        shift = r.get('Shift Time', '').strip()
        if route and shift:
            if route not in route_shifts:
                route_shifts[route] = set()
            route_shifts[route].add(shift)

    for r in valid_records:
        shift = r.get('Shift Time', '').strip()
        if not shift:
            route = r.get('Rout No', '').strip()
            if route in route_shifts and len(route_shifts[route]) == 1:
                inferred_shift = list(route_shifts[route])[0]
                r['Shift Time'] = inferred_shift
                print(f"[INFO] Inferred shift '{inferred_shift}' for '{r.get('Name')}' on route '{route}'")

    # Step 1: Ensure/Standardize Shifts in the Shift Table
    print("\n--- STANDARDIZING SHIFTS IN DATABASE ---")
    unique_shifts = sorted(list(set(r.get('Shift Time', '').strip() for r in valid_records if r.get('Shift Time', '').strip())))
    shift_id_map = {} # Maps start_time string to database Shift ID

    for s_time in unique_shifts:
        # Find if shift exists by start_time
        cur.execute('SELECT id, name, "startTime", "endTime" FROM "Shift" WHERE "startTime" = %s', (s_time,))
        row = cur.fetchone()
        
        standard_end = calculate_end_time(s_time)
        standard_name = f"Shift {s_time}" if s_time in ['07:00', '09:00'] else (f"APAC {s_time}" if s_time == '05:00' else f"IST {s_time}")
        
        if row:
            db_id, db_name, db_start, db_end = row
            shift_id_map[s_time] = db_id
            
            # Update shift details if they differ from standard
            if db_end != standard_end or db_name != standard_name:
                cur.execute("""
                    UPDATE "Shift"
                    SET name = %s, "endTime" = %s
                    WHERE id = %s
                """, (standard_name, standard_end, db_id))
                print(f"[SHIFT] Updated Shift '{db_id}': Name='{db_name}' -> '{standard_name}' | EndTime='{db_end}' -> '{standard_end}'")
            else:
                print(f"[SHIFT] Shift '{db_id}' ({standard_name}) already standard.")
        else:
            # Create new standard shift
            new_id = f"shift-{s_time.replace(':', '')}"
            cur.execute("""
                INSERT INTO "Shift" (id, name, "startTime", "endTime")
                VALUES (%s, %s, %s, %s)
            """, (new_id, standard_name, s_time, standard_end))
            shift_id_map[s_time] = new_id
            print(f"[SHIFT] Created Shift '{new_id}': Name='{standard_name}' | StartTime='{s_time}' | EndTime='{standard_end}'")

    # Step 2: Fetch DB Pickup Points to match by name
    cur.execute('SELECT id, name, zone, "subZone" FROM "PickupPoint"')
    db_pickups = cur.fetchall()
    pickup_map = {p[1].strip().lower(): {'id': p[0], 'zone': p[2], 'subZone': p[3], 'name': p[1]} for p in db_pickups}

    # Step 3: Fetch DB Employees to match by name
    cur.execute("""
        SELECT id, "employeeCode", name, email, phone, gender, address, "shiftId", "pickupPointId", zone, "subZone"
        FROM "Employee"
    """)
    db_employees = cur.fetchall()
    db_emp_map = {emp[2].strip().lower(): emp for emp in db_employees}

    print(f"\nReady to update employees. DB Employees: {len(db_employees)} | JSON Employees: {len(valid_records)}")

    # Step 4: Perform Update Transaction
    print("\n--- UPDATING EMPLOYEE DATA ---")
    updated_count = 0
    skipped_count = 0
    not_found_count = 0

    # Map JSON records by name for easy lookup
    json_emp_map = {r.get('Name', '').strip().lower(): r for r in valid_records}

    for db_name_key, db_emp in db_emp_map.items():
        db_id, db_code, db_name, db_email, db_phone, db_gender, db_address, db_shift_id, db_pickup_id, db_zone, db_subzone = db_emp
        
        if db_name_key in json_emp_map:
            r = json_emp_map[db_name_key]
            
            json_name = r.get('Name', '').strip()
            json_phone = clean_phone(r.get('Contact No', ''))
            json_email = clean_email(r.get('E mail ID', ''))
            if not json_email:
                # Keep existing email if JSON lacks one
                json_email = db_email
                
            json_gender = 'MALE' if r.get('M/F', '').upper() == 'M' else 'FEMALE'
            json_address = r.get('Address', '').strip().replace('\n', ' ')
            json_shift_start = r.get('Shift Time', '').strip()
            json_pickup_name = r.get('Pick up point', '').strip()

            # Find matching shift
            target_shift_id = shift_id_map.get(json_shift_start)
            if not target_shift_id:
                print(f"[ERROR] Shift time '{json_shift_start}' for '{db_name}' not found.")
                continue

            # Find matching pickup point
            pickup_info = pickup_map.get(json_pickup_name.lower())
            if not pickup_info:
                print(f"[ERROR] Pickup point '{json_pickup_name}' for '{db_name}' not found in database.")
                continue
                
            target_pickup_id = pickup_info['id']
            target_zone = pickup_info['zone']
            target_subzone = pickup_info['subZone']

            # Compare to check if any field actually changed
            db_addr_norm = " ".join(db_address.split()).lower()
            json_addr_norm = " ".join(json_address.split()).lower()
            
            needs_update = (
                db_name != json_name or
                db_phone != json_phone or
                db_email != json_email or
                db_gender != json_gender or
                db_addr_norm != json_addr_norm or
                db_shift_id != target_shift_id or
                db_pickup_id != target_pickup_id or
                db_zone != target_zone or
                db_subzone != target_subzone
            )

            if needs_update:
                changes = []
                if db_name != json_name: changes.append(f"Name: '{db_name}' -> '{json_name}'")
                if db_phone != json_phone: changes.append(f"Phone: '{db_phone}' -> '{json_phone}'")
                if db_email != json_email: changes.append(f"Email: '{db_email}' -> '{json_email}'")
                if db_gender != json_gender: changes.append(f"Gender: '{db_gender}' -> '{json_gender}'")
                if db_addr_norm != json_addr_norm: changes.append("Address updated")
                if db_shift_id != target_shift_id: changes.append(f"ShiftId: '{db_shift_id}' -> '{target_shift_id}'")
                if db_pickup_id != target_pickup_id: changes.append(f"PickupPointId: '{db_pickup_id}' -> '{target_pickup_id}'")
                if db_zone != target_zone or db_subzone != target_subzone: changes.append(f"Zone: '{db_zone}/{db_subzone}' -> '{target_zone}/{target_subzone}'")

                cur.execute("""
                    UPDATE "Employee"
                    SET name = %s, phone = %s, email = %s, gender = %s, address = %s, 
                        "shiftId" = %s, "pickupPointId" = %s, zone = %s, "subZone" = %s, status = 'ACTIVE'
                    WHERE id = %s
                """, (
                    json_name,
                    json_phone,
                    json_email,
                    json_gender,
                    json_address,
                    target_shift_id,
                    target_pickup_id,
                    target_zone,
                    target_subzone,
                    db_id
                ))
                print(f"[UPDATE] Updated {db_name} ({db_code}): {', '.join(changes)}")
                updated_count += 1
            else:
                skipped_count += 1
        else:
            print(f"[WARN] Database employee '{db_name}' not found in JSON data.")
            not_found_count += 1

    # Commit all changes
    conn.commit()
    
    print("\n" + "=" * 80)
    print("DB UPDATE SUMMARY")
    print("=" * 80)
    print(f"   Employees Updated: {updated_count}")
    print(f"   Employees Unchanged: {skipped_count}")
    print(f"   Employees Missing in JSON: {not_found_count}")
    print(f"   Total DB Employees Processed: {len(db_employees)}")
    print("=" * 80)

    cur.close()
    conn.close()
    print("\nDatabase transaction successfully committed! All shifts are corrected.")

except Exception as e:
    print(f"\n[ERROR] Error during execution: {e}")
    if 'conn' in locals():
        conn.rollback()
        print("[ROLLBACK] Database transaction rolled back.")
    import traceback
    traceback.print_exc()
