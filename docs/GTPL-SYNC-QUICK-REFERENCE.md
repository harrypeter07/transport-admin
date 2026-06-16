# GTPL SYNC - QUICK REFERENCE

## 🚀 One-Command Summary

```bash
# PHASE 1: Analyze sheets (12-Jun vs 16-Jun)
npm run analyze:gtpl

# PHASE 2: Audit database (preview mode)
npm run audit:gtpl

# PHASES 3-6: Sync - Preview mode (no changes)
npm run sync:gtpl

# PHASES 3-6: Sync - Apply changes
npm run sync:gtpl -- --apply
```

---

## 📊 What Each Command Does

| Command                        | Purpose                 | Changes DB? | Output                             |
| ------------------------------ | ----------------------- | ----------- | ---------------------------------- |
| `npm run analyze:gtpl`         | Compare workbook sheets | No          | `gtpl-sheets-analysis-report.json` |
| `npm run audit:gtpl`           | Audit DB vs workbook    | No          | `gtpl-audit-report-16june.json`    |
| `npm run sync:gtpl`            | Preview sync (DRY-RUN)  | No          | `gtpl-sync-report-16june.json`     |
| `npm run sync:gtpl -- --apply` | Apply sync to DB        | **YES**     | `gtpl-sync-report-16june.json`     |

---

## 🎯 Typical Workflow

```bash
# 1. Analyze (5 sec)
npm run analyze:gtpl

# 2. Audit (10 sec)
npm run audit:gtpl

# 3. Preview sync (20 sec)
npm run sync:gtpl

# 4. Review output
# Review: data/outputs/gtpl-sync-report-16june.json

# 5. Apply sync (30 sec)
npm run sync:gtpl -- --apply

# 6. Verify in app
# - Open optimization page
# - Select date 2026-06-16
# - Check employee list
```

---

## 📁 Report Locations

All reports saved to: **`data/outputs/`**

| Report                             | Created By | Contains                            |
| ---------------------------------- | ---------- | ----------------------------------- |
| `gtpl-sheets-analysis-report.json` | PHASE 1    | Workbook comparison (12 vs 16 Jun)  |
| `gtpl-audit-report-16june.json`    | PHASE 2    | DB audit (employees, cabs, drivers) |
| `gtpl-sync-report-16june.json`     | PHASES 3-6 | Sync results (dryRun or applied)    |

---

## 🔧 What Gets Updated

### PHASE 3: TransportRoster

```
Employee ID + Date → Status (PRESENT / NO_SHOW)
```

### PHASE 4: CabRosterStatus

```
Cab ID + Date → Status (ACTIVE / INACTIVE)
```

### PHASE 5: DriverAssignment

```
Cab ID + Date → Driver Name + Phone
```

---

## ⚠️ Safety Rules

✅ **Safe to run anytime:**

- `npm run analyze:gtpl`
- `npm run audit:gtpl`
- `npm run sync:gtpl` (dry-run mode)

⚠️ **Requires confirmation:**

- `npm run sync:gtpl -- --apply` (MAKES DATABASE CHANGES)

🚫 **Never:**

- Run without `--apply` flag if you want to make changes
- Run without reviewing dry-run first
- Run without database backup

---

## 📋 Expected Results

### 16-Jun Employee Roster

- **Present**: ~70 employees (in workbook)
- **No-show**: ~73 employees (not in workbook)
- **Total**: ~143 employees in DB

### New Employees (5)

- Anshul Tyagi
- John
- Pulipati Krishna
- Naga Praveen Matta
- Vajja Bhanu Prakash

### Removed Employees (6)

- Adarsh Kumar
- Nitin Gujar
- Navneel Purohit
- Sushant Kodam
- G S Prasad
- Himanshu

---

## 🔍 How to Verify Sync Worked

### In Database

```sql
-- Check TransportRoster for 16-Jun
SELECT COUNT(*) FROM "TransportRoster"
WHERE date = '2026-06-16' AND transportRosterStatus = 'PRESENT';

-- Check CabRosterStatus for 16-Jun
SELECT COUNT(*) FROM "CabRosterStatus"
WHERE date = '2026-06-16' AND cabRosterStatus = 'ACTIVE';

-- Check DriverAssignments for 16-Jun
SELECT COUNT(*) FROM "DriverAssignment" WHERE date = '2026-06-16';
```

### In App

1. Open optimization page
2. Select date: **2026-06-16**
3. Employee count should show ~70 (only PRESENT employees)
4. Cab list should show ~60 (only ACTIVE cabs)

---

## 🆘 Need Help?

### Dry-run shows wrong counts?

→ Review `gtpl-sheets-analysis-report.json` first
→ Run `npm run audit:gtpl` to debug

### Want to undo changes?

→ Delete date-specific records:

```sql
DELETE FROM "TransportRoster" WHERE date = '2026-06-16';
DELETE FROM "CabRosterStatus" WHERE date = '2026-06-16';
DELETE FROM "DriverAssignment" WHERE date = '2026-06-16';
```

### Multiple dates?

→ Create separate scripts for each date
→ Each date has its own unique records
→ No conflicts

---

## 📚 Documentation

- **Full Workflow**: `docs/GTPL-SYNC-WORKFLOW.md`
- **Implementation Details**: `docs/GTPL-SYNC-IMPLEMENTATION.md`
- **This Quick Reference**: You are here!

---

**Date**: 2026-06-16 | **Source**: 16-6-26 sheet | **Status**: ✅ Ready to use
