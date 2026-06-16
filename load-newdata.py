import psycopg2
import json
import os
import uuid
import re

DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

def normalize_name(name):
    """Normalize employee name"""
    if not name:
        return None
    return name.strip()

def clean_phone(phone):
    """Clean phone number"""
    if not phone or phone.lower() == 'escort' or not any(c.isdigit() for c in phone):
        return '0000000000'
    return phone.strip()

def clean_email(email):
    """Clean and normalize email"""
    if not email or email.lower() == 'escort':
        return None
    email = email.strip().lower()
    if '@' in email:
        return email
    return None

def generate_unique_email(name, emp_id):
    """Generate a unique email if not provided"""
    if emp_id and emp_id.upper() != 'NA':
        return f"{emp_id}@globallogic.com"
    return f"{name.lower().replace(' ', '.')}@globallogic.com"

def is_valid_record(record):
    """Check if record is valid (not a header row)"""
    if not record.get('Name') or not record.get('Emp ID'):
        return False
    
    name = record.get('Name', '').strip()
    emp_id = record.get('Emp ID', '').strip()
    
    if name.lower() in ['name', 'escort'] or emp_id.lower() in ['emp id', 'escort']:
        return False
    
    return True

def extract_vehicle_number(driver_details):
    """Extract vehicle number from driver details"""
    if not driver_details:
        return None
    
    pattern = r'(MH|CG|TS|AP|KA|DL|HR|UP)\d{2}[A-Z]{2}\d{4}'
    match = re.search(pattern, driver_details.upper())
    if match:
        return match.group()
    return None

def extract_driver_name(driver_details):
    """Extract driver name from driver details"""
    if not driver_details:
        return None
    
    cleaned = re.sub(r'(DRIVER[-=\s]?|MOB[-=\s]?|Mob[-=\s]?)', '', driver_details, flags=re.IGNORECASE)
    cleaned = cleaned.strip()
    
    if not cleaned or cleaned.replace('-', '').isdigit():
        return None
    return cleaned

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("=" * 80)
    print("LOADING NEW DATA FROM newdata.json")
    print("=" * 80)

    # Read JSON file
    json_path = 'data/newdata.json'
    with open(json_path, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    print(f"\n📂 Read {len(raw_data)} records from JSON\n")

    # Filter valid records
    valid_records = [r for r in raw_data if is_valid_record(r)]
    print(f"✅ Valid employee records: {len(valid_records)}")
    print(f"❌ Skipped invalid/header records: {len(raw_data) - len(valid_records)}\n")

    # Extract vehicles and drivers
    vehicles = {}
    drivers = {}
    pickup_points = {}

    for record in valid_records:
        vehicle = extract_vehicle_number(record.get('Driver Details', ''))
        driver = extract_driver_name(record.get('Driver Details', ''))
        pickup = record.get('Pick up point', '').strip()
        route = record.get('Rout No', '').strip()

        if vehicle and vehicle not in vehicles:
            vehicles[vehicle] = {
                'route': route,
                'driver_address': record.get('Driver Address ', '').strip()
            }

        if driver and driver not in drivers:
            drivers[driver] = {
                'route': route,
                'vehicle': vehicle
            }

        if pickup and pickup not in pickup_points:
            pickup_points[pickup] = {
                'route': route,
                'address': record.get('Address', '').strip()
            }

    print(f"🚗 Unique vehicles: {len(vehicles)}")
    print(f"👤 Unique drivers: {len(drivers)}")
    print(f"📍 Unique pickup points: {len(pickup_points)}\n")

    # Step 1: CLEAR OLD DATA
    print("🗑️  CLEARING OLD DATA...\n")

    cur.execute("SELECT COUNT(*) FROM \"Employee\"")
    old_emp_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM \"Cab\"")
    old_cab_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM \"PickupPoint\"")
    old_pickup_count = cur.fetchone()[0]

    print(f"   Old employees: {old_emp_count}")
    print(f"   Old cabs: {old_cab_count}")
    print(f"   Old pickup points: {old_pickup_count}\n")

    # Delete in correct order (foreign key constraints)
    cur.execute("DELETE FROM \"TransportRoster\"")
    cur.execute("DELETE FROM \"CabRosterStatus\"")
    cur.execute("DELETE FROM \"DriverAssignment\"")
    cur.execute("DELETE FROM \"RouteStop\"")
    cur.execute("DELETE FROM \"Route\"")
    cur.execute("DELETE FROM \"PickupPoint\"")
    cur.execute("DELETE FROM \"Employee\"")
    cur.execute("DELETE FROM \"Cab\"")
    
    conn.commit()
    print("   ✅ Old data cleared\n")

    # Step 2: LOAD NEW EMPLOYEES
    print("📝 LOADING NEW EMPLOYEES...\n")

    employees_created = 0
    employees_failed = 0
    used_emails = set()
    used_emp_codes = set()

    for record in valid_records:
        emp_id = record.get('Emp ID', '').strip()
        name = record.get('Name', '').strip()
        phone = clean_phone(record.get('Contact No', ''))
        email = clean_email(record.get('E mail ID', ''))
        address = record.get('Address', '').strip()
        gender = 'MALE' if record.get('M/F', '').upper() == 'M' else 'FEMALE'

        # Generate employee code
        if emp_id and emp_id.upper() != 'NA':
            emp_code = emp_id
        else:
            emp_code = f"EXCEL-{name.replace(' ', '-').upper()}"
        
        # Ensure emp_code is unique
        emp_code_base = emp_code
        counter = 1
        while emp_code in used_emp_codes:
            emp_code = f"{emp_code_base}-{counter}"
            counter += 1
        
        used_emp_codes.add(emp_code)

        # Handle email uniqueness
        if not email:
            email = generate_unique_email(name, emp_id)
        
        email_base = email.split('@')[0]
        counter = 1
        while email in used_emails:
            email = f"{email_base}{counter}@globallogic.com"
            counter += 1
        
        used_emails.add(email)

        try:
            emp_uuid = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO "Employee" 
                (id, "employeeCode", name, phone, email, address, gender, status, department, designation, x, y)
                VALUES 
                (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                emp_uuid,
                emp_code,
                name,
                phone,
                email,
                address,
                gender,
                'ACTIVE',
                'GLOBAL LOGIC',
                'Engineer',
                0.0,
                0.0
            ))
            employees_created += 1

        except Exception as e:
            employees_failed += 1
            print(f"   ⚠️  {name}: {str(e)[:60]}")

    conn.commit()
    print(f"   ✅ Created {employees_created} employees")
    if employees_failed > 0:
        print(f"   ⚠️  Failed: {employees_failed}\n")
    else:
        print()

    # Step 3: LOAD NEW CABS
    print("🚗 LOADING NEW VEHICLES...\n")

    cabs_created = 0
    for vehicle_num, details in vehicles.items():
        try:
            cab_uuid = str(uuid.uuid4())
            driver_name = ''
            
            for driver, driver_details in drivers.items():
                if driver_details.get('vehicle') == vehicle_num:
                    driver_name = driver
                    break
            
            cur.execute("""
                INSERT INTO "Cab" 
                (id, "vehicleNumber", "driverName", "driverPhone", "licenseNumber", capacity, vendor, status)
                VALUES 
                (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                cab_uuid,
                vehicle_num.upper(),
                driver_name,
                '0000000000',
                '',
                4,
                'FT',
                'ACTIVE'
            ))
            cabs_created += 1
        except Exception as e:
            print(f"   ⚠️  {vehicle_num}: {str(e)[:60]}")

    conn.commit()
    print(f"   ✅ Created {cabs_created} vehicles\n")

    # Step 4: LOAD PICKUP POINTS
    print("📍 LOADING PICKUP POINTS...\n")

    pickup_created = 0
    for point_name, details in pickup_points.items():
        try:
            point_uuid = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO "PickupPoint" 
                (id, name, address, x, y, zone, "subZone", "distanceRing", "createdAt", "updatedAt")
                VALUES 
                (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """, (
                point_uuid,
                point_name,
                details.get('address', ''),
                0.0,
                0.0,
                'N',
                'NE',
                'NEAR'
            ))
            pickup_created += 1
        except Exception as e:
            print(f"   ⚠️  {point_name}: {str(e)[:60]}")

    conn.commit()
    print(f"   ✅ Created {pickup_created} pickup points\n")

    # Final summary
    cur.execute("SELECT COUNT(*) FROM \"Employee\" WHERE status = 'ACTIVE'")
    final_emp_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM \"Cab\"")
    final_cab_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM \"PickupPoint\"")
    final_pickup_count = cur.fetchone()[0]

    print("=" * 80)
    print("✅ DATA LOAD COMPLETE")
    print("=" * 80)
    print(f"\n📊 Final Database State:")
    print(f"   ✅ Employees: {final_emp_count}")
    print(f"   ✅ Vehicles: {final_cab_count}")
    print(f"   ✅ Pickup Points: {final_pickup_count}")
    print(f"\n✨ Database ready for new application!")
    print(f"📅 Date format ready: DD/MM/YY")
    print(f"🗺️  Ready for Google Maps integration!")

    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
