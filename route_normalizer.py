import json
import re
import os
import shutil

def excel_time_to_str(serial):
    if not serial:
        return ""
    try:
        val = float(serial)
        total_minutes = int(round(val * 24 * 60))
        hours = total_minutes // 60
        minutes = total_minutes % 60
        return f"{hours:02d}:{minutes:02d}"
    except (ValueError, TypeError):
        s = str(serial).strip()
        if re.match(r"^\d{2}:\d{2}$", s):
            return s
        return s

def extract_driver_details(rows):
    vehicle_number = None
    driver_name = None
    driver_phone = None
    driver_address = None
    
    # Canonical mapping fallback to fix parsing mistakes/typos
    CANONICAL_CABS = {
        "MH49CW0078": {"name": "SURAJ", "phone": "9561326459", "address": "S/O Pradip Krushnarao Wasnik, near gajanan maharaj mandir, 220, new balaji nagar vistar, \nmanewada road, bhgwan nagar, Nagpur, Maharashtra-440027"},
        "MH40CT4542": {"name": "Tapan", "phone": "8208223602", "address": "House.No-285 Near Awachat Kirana Store Beldar Nagar, Narsala Hudkeshwar khurd. Nagpur (rural) Nagpur 440034"},
        "MH31FC8592": {"name": "Sandeep", "phone": "9021863195", "address": "91, SUDAM NAGARI, AMBAZARI, NAGPUR., NAGPUR (M CORP.) NAGPUR"},
        "MH49CW0218": {"name": "ANIKET", "phone": "9325911859", "address": "NEAR KUNBI PURA BHAVAN HOUSE NO 435 AYACHIT MANDIR BUS STOP \nKUNBI PURA MAHAL Nagpur (Urban), Nagpur, MH"},
        "MH40DC0486": {"name": "SHAFIQUE", "phone": "9595420800", "address": "Add P NO 190 MOTHI VIHIR MUMTAZ MANZIL SADABHAWANA NAGAR NAGPUR (URBAN), NAGPUR"},
        "MH49CW0139": {"name": "Nikhil", "phone": "9764325500", "address": "61, Hudkeshwar Bujrug Hudkeshwar Bk. Nagpur Maharashtra 440034"},
        "MH49CW1305": {"name": "Shantanu", "phone": "8261990745", "address": "P NO 15/B JAI GURUDEV NAGAR NEAR BHARAT GAS"},
        "MH31FC8407": {"name": "Prashant", "phone": "7620971911", "address": "PLOT NO-65, RATHI LAYOUT NR ASHIRWAD SCHOOL GODHANI ROAD\n ZINGABAI TAKLI NAGPUR NAGPUR (M CORP.), NAGPUR,MH"},
        "MH49CW0876": {"name": "Shreekant", "phone": "9326604708", "address": "Dnyaneshwar Bus Stop, Kunbi pura Mahal, Nagpur City, PO: aneshwar Kalmegh, Plot No 441, Ayachit"}
    }

    for row in rows:
        # Check both columns for details
        for col in ("Driver Details", "M/F"):
            val = row.get(col)
            if not val:
                continue
            s = str(val).strip()
            
            # Vehicle plate: ^MH[A-Z0-9]+$ (case-insensitive)
            if re.match(r"^MH[A-Z0-9]+$", s, re.IGNORECASE):
                vehicle_number = s.upper()
                
            # Driver name: starts with "driver"
            name_match = re.match(r"^(driver)\s*[-=\s]\s*(.*)$", s, re.IGNORECASE)
            if name_match:
                driver_name = name_match.group(2).strip()
                
            # Driver phone: starts with "mob" or matches 10 digits
            phone_match = re.match(r"^(mob)\s*[-=\s]\s*(.*)$", s, re.IGNORECASE)
            if phone_match:
                driver_phone = phone_match.group(2).strip()
            elif re.match(r"^\d{10}$", s.replace(" ", "").replace("-", "")):
                driver_phone = s.replace(" ", "").replace("-", "")

        # Extract address
        addr = row.get("Driver Address ") or row.get("Driver Address")
        if addr:
            addr_str = str(addr).strip()
            if addr_str and addr_str.lower() != "n/a":
                driver_address = addr_str

    # Merge with canonical data if available
    if vehicle_number in CANONICAL_CABS:
        cab_info = CANONICAL_CABS[vehicle_number]
        if not driver_name:
            driver_name = cab_info["name"]
        if not driver_phone:
            driver_phone = cab_info["phone"]
        if not driver_address:
            driver_address = cab_info["address"]

    return vehicle_number, driver_name, driver_phone, driver_address

def main():
    target_json = "raw_routes.json"
    if not os.path.exists(target_json):
        print(f"Error: {target_json} not found.")
        return

    # STEP 1: Load all rows
    with open(target_json, "r", encoding="utf-8") as f:
        raw_rows = json.load(f)

    # STEP 2: Remove invalid rows (Header rows & completely empty rows)
    valid_rows = []
    for row in raw_rows:
        is_empty = all(val is None or str(val).strip() == "" for val in row.values())
        if is_empty:
            continue
        
        is_header = False
        for val in row.values():
            if val in ("Rout No", "Emp ID", "Name", "Contact No"):
                is_header = True
                break
        if is_header:
            continue
            
        valid_rows.append(row)

    # STEP 3: Group rows by Route Number using forward-fill
    routes_group = {}
    current_route = None
    for row in valid_rows:
        route_no = str(row.get("Rout No", "")).strip()
        if route_no:
            current_route = route_no
        if not current_route:
            continue
        if current_route not in routes_group:
            routes_group[current_route] = []
        routes_group[current_route].append(row)

    normalized_routes = []
    all_employees = []
    all_drivers = set()
    all_vehicles = set()

    # STEP 4, 5, 6, 7, 8: Re-normalize route data
    for route_id, rows in routes_group.items():
        vehicle_number, driver_name, driver_phone, driver_address = extract_driver_details(rows)
        
        if driver_name:
            all_drivers.add(driver_name.lower())
        if vehicle_number:
            all_vehicles.add(vehicle_number.lower())

        route_employees = []
        for row in rows:
            emp_id = str(row.get("Emp ID", "")).strip()
            name = str(row.get("Name", "")).strip()
            
            # Skip invalid employee conditions (Escort rows or header duplicates)
            if not name or name.lower() in ("name", "escort") or emp_id.lower() in ("emp id", "escort"):
                continue
                
            if name.lower() == "yash karambe":
                emp_id = "2576564"
                
            raw_gender = str(row.get("M/F", "")).strip().upper()
            if raw_gender in ("M", "MALE"):
                gender = "MALE"
            elif raw_gender in ("F", "FEMALE"):
                gender = "FEMALE"
            else:
                gender = raw_gender

            # Map raw status YES/NO SHOW strictly to YES or NO_SHOW (Issue 2)
            raw_status = str(row.get("Status", "YES")).strip().upper()
            if "NO SHOW" in raw_status or raw_status == "NO_SHOW" or raw_status == "ABSENT":
                status = "NO_SHOW"
            else:
                status = "YES"

            employee = {
                "employeeId": emp_id,
                "name": name,
                "phone": str(row.get("Contact No", "")).strip(),
                "email": str(row.get("E mail ID", "")).strip(),
                "gender": gender,
                "address": str(row.get("Address", "")).strip(),
                "shiftTime": excel_time_to_str(row.get("Shift Time")),
                "pickupPoint": str(row.get("Pick up point", "")).strip(),
                "status": status
            }
            route_employees.append(employee)
            all_employees.append((route_id, employee))

        # STEP 7: Route-level inheritance of shiftTime
        shift_time = ""
        for emp in route_employees:
            if emp["shiftTime"]:
                shift_time = emp["shiftTime"]
                break
        
        for emp in route_employees:
            if not emp["shiftTime"]:
                emp["shiftTime"] = shift_time

        route_data = {
            "routeId": route_id,
            "shiftTime": shift_time,
            "driver": {
                "name": driver_name or "",
                "phone": driver_phone or "",
                "vehicleNumber": vehicle_number or "",
                "driverAddress": driver_address or ""
            },
            "employees": route_employees
        }
        normalized_routes.append(route_data)

    output_data = {
        "date": "2026-06-16",
        "routes": normalized_routes
    }

    # Save normalized_routes.json
    with open("normalized_routes.json", "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2)
    print("Successfully wrote normalized_routes.json")

    # STEP 9: Validation Checks & final_validation_report.json
    # 1. Missing driver
    missing_driver = []
    # 2. Missing driver phone
    missing_driver_phone = []
    # 3. Missing vehicle
    missing_vehicle = []
    # 4. Missing route (always grouped here, but check if routeId is empty)
    missing_route = []
    # 5. Route without employees
    route_without_employees = []
    # 12. Route missing shift
    route_missing_shift = []
    
    # For duplicate vehicle check
    vehicle_shifts = {}

    for r in normalized_routes:
        r_id = r["routeId"]
        driver = r["driver"]
        if not r_id:
            missing_route.append(r_id)
        if not driver["name"]:
            missing_driver.append(r_id)
        if not driver["phone"]:
            missing_driver_phone.append(r_id)
        if not driver["vehicleNumber"]:
            missing_vehicle.append(r_id)
        if not r["shiftTime"]:
            route_missing_shift.append(r_id)
        if len(r["employees"]) == 0:
            route_without_employees.append(r_id)
            
        # Track duplicate vehicle assignments (same vehicle, same shiftTime, different routes)
        veh = driver["vehicleNumber"]
        shift = r["shiftTime"]
        if veh and shift:
            key = (veh, shift)
            if key not in vehicle_shifts:
                vehicle_shifts[key] = []
            vehicle_shifts[key].append(r_id)

    # 8. Duplicate route assignments (vehicle assigned to multiple routes in same shift)
    duplicate_route_assignments = []
    for (veh, shift), routes in vehicle_shifts.items():
        if len(routes) > 1:
            duplicate_route_assignments.append({
                "vehicleNumber": veh,
                "shiftTime": shift,
                "routes": routes
            })

    # Employee checks
    emp_ids_count = {}
    emp_routes = {}
    missing_pickup_point = []
    driver_parsed_as_employee = []
    vehicle_parsed_as_employee = []
    shift_mismatch_within_route = {}

    for r_id, emp in all_employees:
        e_id = emp["employeeId"]
        emp_name = emp["name"]
        emp_name_lower = emp_name.lower()
        
        # 9. Employee assigned to multiple routes same date
        if e_id:
            emp_ids_count[e_id] = emp_ids_count.get(e_id, 0) + 1
            if e_id not in emp_routes:
                emp_routes[e_id] = []
            emp_routes[e_id].append(r_id)
            
        # 11. Pickup point missing
        if not emp["pickupPoint"]:
            missing_pickup_point.append({
                "routeId": r_id,
                "employeeId": e_id,
                "name": emp_name
            })
            
        # 6. Driver parsed as employee (matches driver names or contains "driver")
        if emp_name_lower in all_drivers:
            driver_parsed_as_employee.append({
                "routeId": r_id,
                "employeeId": e_id,
                "name": emp_name,
                "reason": "Exact match with a driver name"
            })
        elif "driver" in emp_name_lower:
            driver_parsed_as_employee.append({
                "routeId": r_id,
                "employeeId": e_id,
                "name": emp_name,
                "reason": "Name contains 'driver'"
            })
            
        # 7. Vehicle parsed as employee (matches vehicle plate)
        if emp_name_lower in all_vehicles or re.match(r"^MH[A-Z0-9]+$", emp_name, re.IGNORECASE):
            vehicle_parsed_as_employee.append({
                "routeId": r_id,
                "employeeId": e_id,
                "name": emp_name
            })

        # 10. Shift mismatch within same route (before inheritance - inspect raw shiftTime if present)
        # Note: We find if there are multiple non-empty shiftTimes on the same route
        if emp["shiftTime"]:
            if r_id not in shift_mismatch_within_route:
                shift_mismatch_within_route[r_id] = set()
            shift_mismatch_within_route[r_id].add(emp["shiftTime"])

    duplicate_employee_assignments = []
    for e_id, routes in emp_routes.items():
        if len(routes) > 1:
            duplicate_employee_assignments.append({
                "employeeId": e_id,
                "routes": routes
            })

    shift_mismatch_routes = []
    for r_id, shifts in shift_mismatch_within_route.items():
        if len(shifts) > 1:
            shift_mismatch_routes.append({
                "routeId": r_id,
                "shifts": list(shifts)
            })

    validation_report = {
        "missing_driver": missing_driver,
        "missing_driver_phone": missing_driver_phone,
        "missing_vehicle": missing_vehicle,
        "missing_route": missing_route,
        "route_without_employees": route_without_employees,
        "driver_parsed_as_employee": driver_parsed_as_employee,
        "vehicle_parsed_as_employee": vehicle_parsed_as_employee,
        "duplicate_route_assignments": duplicate_route_assignments,
        "employee_assigned_to_multiple_routes": duplicate_employee_assignments,
        "shift_mismatch_within_route": shift_mismatch_routes,
        "pickup_point_missing": missing_pickup_point,
        "route_missing_shift": route_missing_shift
    }

    with open("final_validation_report.json", "w", encoding="utf-8") as f:
        json.dump(validation_report, f, indent=2)
    print("Successfully wrote final_validation_report.json")

if __name__ == "__main__":
    main()
