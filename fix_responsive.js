/**
 * Targeted responsive fix for all operation pages:
 * - Page headers: flex-col sm:flex-row
 * - Filter bars: flex-wrap gap-2
 * - Grid cols: responsive
 * - Optimization page: map height clamped
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src', 'app');

function fix(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let s = fs.readFileSync(filePath, 'utf8');
  const orig = s;

  // 1. Page-level header: "flex items-start justify-between" → flex-col sm:flex-row
  s = s.replace(
    /className="flex items-start justify-between"/g,
    'className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"'
  );
  s = s.replace(
    /className="flex items-center justify-between"(?=[\s\S]{0,60}<h1)/g,
    'className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"'
  );

  // 2. Filter bars that are "flex gap-2" but not inside table cells
  s = s.replace(
    /className="flex gap-2"(?=[\s\S]{0,200}<select)/g,
    'className="flex flex-wrap gap-2"'
  );

  // 3. max-w-sm on search inputs → remove max-w restriction on mobile
  s = s.replace(/\brelative flex-1 max-w-sm\b/g, 'relative w-full sm:flex-1 sm:max-w-sm');
  s = s.replace(/\brelative flex-1 max-w-xs\b/g, 'relative w-full sm:flex-1 sm:max-w-xs');

  // 4. Grid cols - make responsive
  s = s.replace(/\bgrid grid-cols-4\b/g, 'grid grid-cols-2 lg:grid-cols-4');
  s = s.replace(/\bgrid grid-cols-3\b/g, 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3');

  // 5. Optimization page specific — map height
  s = s.replace(/\bh-\[550px\]/g, 'h-[300px] md:h-[450px] lg:h-[550px]');
  s = s.replace(/\bh-\[500px\]/g, 'h-[280px] md:h-[400px] lg:h-[500px]');
  s = s.replace(/\bh-\[480px\]/g, 'h-[260px] md:h-[380px] lg:h-[480px]');

  // 6. Remove hard min-w that breaks mobile layout
  s = s.replace(/\bmin-w-\[800px\]/g, 'min-w-[600px]');

  // 7. Driver/employee dashboard — card grids
  s = s.replace(/\bgrid-cols-2 gap-4(?=[\s\S]{0,5}>\s*<div[\s\S]{0,200}text-3xl)/g,
    'grid-cols-1 sm:grid-cols-2 gap-4');

  if (s !== orig) {
    fs.writeFileSync(filePath, s, 'utf8');
    return true;
  }
  return false;
}

// All pages to process
const pages = [
  'dashboard/admin/operations/employees/page.tsx',
  'dashboard/admin/operations/shifts/page.tsx',
  'dashboard/admin/operations/leaves/page.tsx',
  'dashboard/admin/operations/hierarchy/page.tsx',
  'dashboard/admin/operations/calendar/page.tsx',
  'dashboard/admin/operations/users/page.tsx',
  'dashboard/admin/analytics/page.tsx',
  'dashboard/admin/settings/page.tsx',
  'dashboard/admin/notifications/page.tsx',
  'dashboard/admin/transport/optimization/page.tsx',
  'dashboard/driver/page.tsx',
  'dashboard/driver/routes/page.tsx',
  'dashboard/driver/profile/page.tsx',
  'dashboard/driver/notifications/page.tsx',
  'dashboard/employee/page.tsx',
  'dashboard/employee/route/page.tsx',
  'dashboard/employee/requests/page.tsx',
  'dashboard/employee/profile/page.tsx',
  'dashboard/employee/notifications/page.tsx',
  'dashboard/manager/page.tsx',
  'dashboard/manager/team/page.tsx',
  'dashboard/manager/approvals/page.tsx',
  'dashboard/manager/profile/page.tsx',
  'dashboard/manager/notifications/page.tsx',
];

let changed = 0;
for (const p of pages) {
  const full = path.join(SRC, p);
  if (fix(full)) {
    console.log('✓ Fixed:', p);
    changed++;
  } else {
    console.log('  Skip:', p);
  }
}

console.log(`\nDone. ${changed} files updated.`);
