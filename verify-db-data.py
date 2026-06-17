import os
import psycopg2
from dotenv import load_dotenv

# Load database credentials
load_dotenv(dotenv_path=".env")
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    DATABASE_URL = 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

output_file = "db-verification-report.txt"
print(f"Connecting to database to extract verification data...")

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("=" * 100 + "\n")
        f.write("DATABASE VERIFICATION REPORT: SHIFTS, EMPLOYEES & DRIVERS\n")
        f.write("=" * 100 + "\n\n")

        # ----------------------------------------------------
        # 1. SHIFTS SUMMARY
        # ----------------------------------------------------
        f.write("1. SHIFTS SUMMARY\n")
        f.write("-" * 50 + "\n")
        cur.execute("""
            SELECT s.id, s.name, s."startTime", s."endTime", COUNT(e.id) as emp_count
            FROM "Shift" s
            LEFT JOIN "Employee" e ON s.id = e."shiftId"
            GROUP BY s.id, s.name, s."startTime", s."endTime"
            ORDER BY s."startTime"
        """)
        shifts = cur.fetchall()
        f.write(f"{'Shift ID':<40} | {'Name':<20} | {'Start':<8} | {'End':<8} | {'Assigned Employees'}\n")
        f.write("-" * 100 + "\n")
        for s in shifts:
            f.write(f"{s[0]:<40} | {s[1]:<20} | {s[2]:<8} | {s[3]:<8} | {s[4]}\n")
        f.write("\n\n")

        # ----------------------------------------------------
        # 2. ACTIVE DRIVERS & CABS DETAILS
        # ----------------------------------------------------
        f.write("2. ACTIVE DRIVERS & CABS DETAILS\n")
        f.write("-" * 50 + "\n")
        cur.execute("""
            SELECT "vehicleNumber", "driverName", "driverPhone", capacity, vendor, status, "assignedZone", "assignedSubZone"
            FROM "Cab"
            ORDER BY "vehicleNumber"
        """)
        cabs = cur.fetchall()
        f.write(f"{'Vehicle Num':<15} | {'Driver Name':<25} | {'Driver Phone':<15} | {'Cap':<5} | {'Vendor':<6} | {'Status':<10} | {'Zone/SubZone'}\n")
        f.write("-" * 100 + "\n")
        for c in cabs:
            zone_info = f"{c[6] or 'N/A'}/{c[7] or 'N/A'}"
            f.write(f"{c[0]:<15} | {c[1]:<25} | {c[2]:<15} | {c[3]:<5} | {c[4]:<6} | {c[5]:<10} | {zone_info}\n")
        f.write("\n\n")

        # ----------------------------------------------------
        # 3. EMPLOYEE DETAILS
        # ----------------------------------------------------
        f.write("3. EMPLOYEE DETAILS (66 Total)\n")
        f.write("-" * 50 + "\n")
        cur.execute("""
            SELECT e.name, e."employeeCode", e.email, e.phone, e.gender, 
                   s.name as "shift_name", s."startTime" as "shift_time",
                   p.name as "pickup_name", e.zone, e."subZone", e.address
            FROM "Employee" e
            LEFT JOIN "Shift" s ON e."shiftId" = s.id
            LEFT JOIN "PickupPoint" p ON e."pickupPointId" = p.id
            ORDER BY s."startTime", e.name
        """)
        employees = cur.fetchall()
        
        f.write(f"{'#':<3} | {'Employee Name':<30} | {'Code':<15} | {'Gender':<7} | {'Shift Time':<10} | {'Pickup Point':<40} | {'Zone/Sub'}\n")
        f.write("-" * 120 + "\n")
        
        for idx, e in enumerate(employees):
            # Trim pickup point name for visual alignment
            p_name = e[7] if e[7] else "N/A"
            if len(p_name) > 37:
                p_name = p_name[:34] + "..."
                
            zone_sub = f"{e[8] or 'N/A'}/{e[9] or 'N/A'}"
            f.write(f"{idx+1:<3} | {e[0]:<30} | {e[1]:<15} | {e[4]:<7} | {e[6] or 'N/A':<10} | {p_name:<40} | {zone_sub}\n")
            
            # Print contact and address detail as a sub-line for compactness
            f.write(f"    * Phone: {e[3]} | Email: {e[2]}\n")
            f.write(f"    * Address: {e[10]}\n")
            f.write("-" * 120 + "\n")

    cur.close()
    conn.close()
    print(f"Success! All database details have been written to {output_file}.")

except Exception as e:
    print(f"Error extracting data from DB: {e}")
    import traceback
    traceback.print_exc()
