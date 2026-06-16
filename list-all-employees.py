import psycopg2
import os

DATABASE_URL = os.getenv('DIRECT_URL', 'postgresql://postgres.birsbvwnzjbwbcnypeav:Moksh%401816%23transitadmin@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres')

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("=" * 120)
    print("📋 ALL EMPLOYEES IN DATABASE (66 Total)")
    print("=" * 120)
    print()

    # Fetch all employees
    cur.execute("""
        SELECT 
            "employeeCode",
            name,
            email,
            phone,
            address,
            gender,
            status,
            department
        FROM "Employee"
        WHERE status = 'ACTIVE'
        ORDER BY "employeeCode"
    """)

    employees = cur.fetchall()
    
    if employees:
        # Print header
        print(f"{'#':<4} {'Employee Code':<20} {'Name':<25} {'Email':<30} {'Phone':<12} {'Gender':<6} {'Dept':<15}")
        print("-" * 120)
        
        # Print each employee
        for i, emp in enumerate(employees, 1):
            emp_code, name, email, phone, address, gender, status, dept = emp
            print(f"{i:<4} {str(emp_code):<20} {str(name):<25} {str(email):<30} {str(phone):<12} {str(gender):<6} {str(dept):<15}")
        
        print("-" * 120)
        
        print()
        print("=" * 100)
        print(f"✅ TOTAL EMPLOYEES: {len(employees)}")
        print("=" * 100)
        
        # Summary statistics
        print("\n📊 SUMMARY STATISTICS:")
        print("-" * 100)
        
        # Gender breakdown
        cur.execute("""
            SELECT gender, COUNT(*) as count
            FROM "Employee"
            WHERE status = 'ACTIVE'
            GROUP BY gender
        """)
        gender_stats = cur.fetchall()
        print("\n👥 Gender Breakdown:")
        for gender, count in gender_stats:
            print(f"   {gender}: {count}")
        
        # Department breakdown
        cur.execute("""
            SELECT department, COUNT(*) as count
            FROM "Employee"
            WHERE status = 'ACTIVE'
            GROUP BY department
        """)
        dept_stats = cur.fetchall()
        print("\n🏢 Department Breakdown:")
        for dept, count in dept_stats:
            print(f"   {dept}: {count}")
        
        # Employees with email
        cur.execute("""
            SELECT COUNT(*) FROM "Employee"
            WHERE status = 'ACTIVE' AND email IS NOT NULL AND email != ''
        """)
        email_count = cur.fetchone()[0]
        print(f"\n📧 Employees with Email: {email_count}/{len(employees)}")
        
        # Employees with phone
        cur.execute("""
            SELECT COUNT(*) FROM "Employee"
            WHERE status = 'ACTIVE' AND phone IS NOT NULL AND phone != ''
        """)
        phone_count = cur.fetchone()[0]
        print(f"📞 Employees with Phone: {phone_count}/{len(employees)}")
        
        # Employee code patterns
        cur.execute("""
            SELECT 
                CASE 
                    WHEN "employeeCode" LIKE 'EXCEL-%' THEN 'EXCEL-*'
                    WHEN "employeeCode" LIKE 'NEW-%' THEN 'NEW-*'
                    ELSE 'NUMERIC'
                END as code_type,
                COUNT(*) as count
            FROM "Employee"
            WHERE status = 'ACTIVE'
            GROUP BY code_type
        """)
        code_patterns = cur.fetchall()
        print(f"\n🔖 Employee Code Patterns:")
        for pattern, count in code_patterns:
            print(f"   {pattern}: {count}")
        
        print("\n" + "=" * 100)
    else:
        print("❌ No employees found!")

    cur.close()
    conn.close()

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
