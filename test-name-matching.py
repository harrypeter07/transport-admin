import psycopg2
import os

DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("=" * 80)
    print("NAME MATCHING ANALYSIS")
    print("=" * 80)
    
    # Get all current employees
    cur.execute("""
        SELECT id, name, "employeeCode"
        FROM "Employee"
        WHERE status = 'ACTIVE'
        ORDER BY name
    """)
    
    db_employees = cur.fetchall()
    
    # List of 70 unique names from workbook
    workbook_names = [
        "ABHAY MARWADE",
        "ABHIJIT ZADE",
        "AKANSHA KHODE",
        "ANAND RAM KUMAR",
        "ANIKET ANAND",
        "ANIMA DIXIT",
        "ANSHUL TYAGI",
        "ANUSHRI BHISE",
        "APARNA KHADATKAR",
        "ARYAN SHENDE",
        "ATHARVA DEO",
        "AYUSH THAKRE",
        "AZAD BHASME",
        "B PRASHANTH",
        "BREJ KISHORE",
        "CHEPARTHI VASANTHI",
        "DEEPAK SINGH KUSHWAH",
        "DEVALLA SUDHEER KUMAR",
        "DIPALI SHARMA",
        "ESCORT",
        "ETHEL DELPHINE COLLINS",
        "GEETA RAJPUT",
        "GIRIVARDHAN",
        "JOHN",
        "KARTIK UKHALKAR",
        "KASHMENI SANJANA",
        "KRUNAL WATH",
        "KUMAR ADARSH",
        "LAVAKUMAR KHANAPUR",
        "LIKESH BARVE",
        "MAHESH UPADHYAY",
        "MANJIRI DOMBALE",
        "MEGHANA B U",
        "MINAL NINAWE",
        "MOHAMMED FARSHAD CHENGANAKKATTIL",
        "MONIKA JESWANI",
        "NAGA PRAVEEN MATTA",
        "NIKHIL AMBULE",
        "NISHA SHYAMSUKHA",
        "PAVANI",
        "POORVI",
        "PRABHAT PRIYDARSHI",
        "PRACHI JAIN",
        "PRANAV NACHANKAR",
        "PRANAY HASTE",
        "PRANAY WEKHANDE",
        "PRASHANT PATHLAVAT",
        "PULIPATI KRISHNA",
        "PUSHPAK SAKHARE",
        "RAVINDRA FARKADE",
        "RITESH KOTHAWADE",
        "RUSHABH BHAGATE",
        "SAGAR",
        "SAKSHI",
        "SAYALI PADOLE",
        "SAYATA CHAKRABORTY",
        "SEJAL SHAHARE",
        "SHRAVAN MESHRAM",
        "SHREYA KARALE",
        "SHUBHANKAR DAS",
        "SIDDHESHWAR RAGHUNATH RAUT",
        "SOHIT MISHRA",
        "SOMA LOHITHA",
        "TANUJA",
        "UDAY TIWARI",
        "VAJJA BHANU PRAKASH",
        "VANSH REWASKAR",
        "VISHAL SINGH",
        "YASH DUBEY",
        "YASH KARAMBE"
    ]
    
    # Simulate the matching logic from sync-gtpl-16june.ts
    db_normalized_names = [e[1].upper() for e in db_employees]
    
    matched = []
    unmatched_workbook = []
    
    for wb_name in workbook_names:
        if wb_name in db_normalized_names:
            matched.append(wb_name)
        else:
            unmatched_workbook.append(wb_name)
    
    print(f"\n📊 Matching Statistics:")
    print(f"   Workbook employees: {len(workbook_names)}")
    print(f"   DB employees: {len(db_employees)}")
    print(f"   Matched (exact name): {len(matched)}")
    print(f"   Unmatched from workbook: {len(unmatched_workbook)}")
    
    print(f"\n✅ Employees that would match (first 10):")
    for name in matched[:10]:
        db_emp = next((e for e in db_employees if e[1].upper() == name), None)
        if db_emp:
            print(f"   {db_emp[1]} (Code: {db_emp[2]})")
    
    if len(matched) > 10:
        print(f"   ... and {len(matched) - 10} more")
    
    print(f"\n❌ Employees in workbook but NOT found in DB (first 10):")
    for name in unmatched_workbook[:10]:
        print(f"   {name}")
    
    if len(unmatched_workbook) > 10:
        print(f"   ... and {len(unmatched_workbook) - 10} more")
    
    # Check for EXCEL-* mismatch
    excel_employees = [e for e in db_employees if 'EXCEL-' in e[2]]
    print(f"\n⚠️  DB employees with EXCEL-* codes: {len(excel_employees)}")
    
    # Check if EXCEL-* names would match
    excel_mismatch = []
    for excel_emp in excel_employees:
        db_name = excel_emp[1].upper()
        if db_name not in workbook_names:
            excel_mismatch.append((db_name, excel_emp[2]))
    
    print(f"   EXCEL-* employees NOT found in workbook names: {len(excel_mismatch)}")
    for name, code in excel_mismatch[:5]:
        print(f"      {name} ({code})")
    
    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
