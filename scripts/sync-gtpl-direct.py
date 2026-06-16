#!/usr/bin/env python3
"""
GTPL Sync Script - Executes PHASE 2-5 using direct SQL
"""
import os
import psycopg2
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

# Load environment
load_dotenv()

# Parse database URL - try DIRECT_URL first (for migrations), then DATABASE_URL
database_url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
if not database_url:
    print("❌ DATABASE_URL or DIRECT_URL environment variable not set")
    exit(1)

# Parse connection string directly without urlparse to preserve special characters
try:
    # Try to connect using the connection string directly
    conn = psycopg2.connect(database_url)
    print("🔗 Connected to database successfully")
except Exception as e:
    print(f"❌ Connection error: {e}")
    # Try alternative parsing
    parsed = urlparse(database_url)
    db_config = {
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "database": parsed.path.lstrip("/") or "postgres",
        "user": unquote(parsed.username) if parsed.username else "postgres",
        "password": unquote(parsed.password) if parsed.password else "",
    }
    
    print(f"🔗 Connecting to database: {db_config['host']}:{db_config['port']}/{db_config['database']}")
    print(f"   User: {db_config['user']}")
    print(f"   Password length: {len(db_config['password'])} chars")
    
    try:
        conn = psycopg2.connect(**db_config)
        print("✅ Connected to database")
    except Exception as e2:
        print(f"❌ Error: {e2}")
        exit(1)

try:
    cur = conn.cursor()
    
    print("\n================================================================================")
    print("🚀 PHASE 2: Updating TransportRoster for 69 present employees...")
    print("================================================================================\n")
    
    # PHASE 2: Update 69 employees to PRESENT
    employee_codes = [
        '2571613', '2524080', '2573850', '2575077', '2571735', '2575313', '2575102',
        '2574375', '2553609', '2563639', '2561005', '2575047', '2574282', '2539657',
        '2574207', '2575074', '2575054', '2561706', '2574364', '2571722', '2572639',
        '2573886', '2574154', '2567012', '2563938', '2560835', '2574218', '2571734',
        '2574160', '2574202', '2570925', '2571603', '2570899', '2571762', '2572532',
        '2573978', '2575113', '2572630', '2570859', '2572693', '2572694', '2566752',
        '2573931', '2571794', '2571900', '2572710', '2572896', '2561730', '2572900',
        '2572901', '2572902', '2572903', '2572904', '2572905', '2572906', '2572907',
        '2572908', '2563922', '2574174', '2559327', '2573886', '2563928',
        '2563944', '2524080', '2525211', '2566752'
    ]
    
    placeholders = ','.join(['%s'] * len(employee_codes))
    
    query = f"""
    INSERT INTO "TransportRoster" ("id", "employeeId", "date", "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
    SELECT 
      gen_random_uuid(),
      e.id,
      '2026-06-16',
      'PRESENT',
      '16-6-26',
      now(),
      now()
    FROM "Employee" e
    WHERE e."employeeCode" IN ({placeholders})
    ON CONFLICT ("employeeId", "date") DO UPDATE
    SET "transportRosterStatus" = 'PRESENT', "sourceSheet" = '16-6-26', "updatedAt" = now();
    """
    
    cur.execute(query, employee_codes)
    phase2_count = cur.rowcount
    print(f"✅ Updated {phase2_count} transport roster records for PRESENT employees")
    
    print("\n================================================================================")
    print("⚠️  PHASE 3: Marking 10 absent employees as NO_SHOW...")
    print("================================================================================\n")
    
    # PHASE 3: Mark 10 employees as NO_SHOW
    absent_employees = [
        'TANUJA K S', 'SUSHANT KODAM', 'JOHN MOSES', 'G S PRASAD', 'NITIN GUJAR',
        'KUMKUM SAHOO', 'ADARSH KUMAR', 'HIMANSHU', 'PETHANAN RAJ KUMAR', 'NAVNEEL PUROHIT'
    ]
    
    absent_placeholders = ','.join(['%s'] * len(absent_employees))
    
    query = f"""
    INSERT INTO "TransportRoster" ("id", "employeeId", "date", "transportRosterStatus", "sourceSheet", "createdAt", "updatedAt")
    SELECT 
      gen_random_uuid(),
      e.id,
      '2026-06-16',
      'NO_SHOW',
      '16-6-26',
      now(),
      now()
    FROM "Employee" e
    WHERE UPPER(TRIM(e."name")) IN ({absent_placeholders})
    ON CONFLICT ("employeeId", "date") DO UPDATE
    SET "transportRosterStatus" = 'NO_SHOW', "sourceSheet" = '16-6-26', "updatedAt" = now();
    """
    
    cur.execute(query, absent_employees)
    phase3_count = cur.rowcount
    print(f"✅ Marked {phase3_count} employees as NO_SHOW")
    
    print("\n================================================================================")
    print("🚗 PHASE 4: Updating 9 vehicles to ACTIVE status...")
    print("================================================================================\n")
    
    # PHASE 4: Update 9 vehicles
    vehicles = [
        'MH31FC8407', 'MH31FC8592', 'MH40CT4542', 'MH40DC0486', 'MH49CW0078',
        'MH49CW0139', 'MH49CW0218', 'MH49CW0876', 'MH49CW1305'
    ]
    
    vehicle_placeholders = ','.join(['%s'] * len(vehicles))
    
    query = f"""
    INSERT INTO "CabRosterStatus" ("id", "cabId", "date", "cabRosterStatus", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid(),
      c.id,
      '2026-06-16',
      'ACTIVE',
      now(),
      now()
    FROM "Cab" c
    WHERE c."vehicleNumber" IN ({vehicle_placeholders})
    ON CONFLICT ("cabId", "date") DO UPDATE
    SET "cabRosterStatus" = 'ACTIVE', "updatedAt" = now();
    """
    
    cur.execute(query, vehicles)
    phase4_count = cur.rowcount
    print(f"✅ Updated {phase4_count} vehicles to ACTIVE")
    
    # Commit all changes
    conn.commit()
    
    print("\n================================================================================")
    print("✅ GTPL SYNC COMPLETED SUCCESSFULLY")
    print("================================================================================")
    print(f"\n📊 Summary:")
    print(f"   - Transport rosters updated (PRESENT): {phase2_count}")
    print(f"   - Absent employees marked (NO_SHOW): {phase3_count}")
    print(f"   - Vehicles updated (ACTIVE): {phase4_count}")
    
    # Verify results
    print("\n📋 Verification Query Results:")
    
    cur.execute('SELECT COUNT(*) FROM "TransportRoster" WHERE "date" = \'2026-06-16\';')
    total_rosters = cur.fetchone()[0]
    print(f"   - Total TransportRoster records for 2026-06-16: {total_rosters}")
    
    cur.execute('SELECT COUNT(*) FROM "TransportRoster" WHERE "date" = \'2026-06-16\' AND "transportRosterStatus" = \'PRESENT\';')
    present_count = cur.fetchone()[0]
    print(f"   - PRESENT status records: {present_count}")
    
    cur.execute('SELECT COUNT(*) FROM "TransportRoster" WHERE "date" = \'2026-06-16\' AND "transportRosterStatus" = \'NO_SHOW\';')
    no_show_count = cur.fetchone()[0]
    print(f"   - NO_SHOW status records: {no_show_count}")
    
    cur.execute('SELECT COUNT(*) FROM "CabRosterStatus" WHERE "date" = \'2026-06-16\' AND "cabRosterStatus" = \'ACTIVE\';')
    active_cabs = cur.fetchone()[0]
    print(f"   - ACTIVE CabRosterStatus records: {active_cabs}")
    
    cur.close()
    conn.close()
    print("\n✅ All operations completed successfully!")
    
except Exception as err:
    print(f"❌ Error: {err}")
    exit(1)
