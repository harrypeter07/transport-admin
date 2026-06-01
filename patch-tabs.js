const fs = require('fs');

const path = 'src/app/dashboard/admin/transport/optimization/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Fix the Module Tab Bar wrapping issue
code = code.replace(
  '<div className="px-6 h-11 flex items-center justify-between">',
  '<div className="px-4 md:px-6 min-h-[44px] flex items-center justify-between overflow-x-auto no-scrollbar">'
);

code = code.replace(
  '<nav className="flex items-center gap-1">',
  '<nav className="flex items-center gap-1 w-max flex-nowrap py-1.5">'
);

// Also fix the top workspace bar flex wrap spacing so buttons don't get squished
code = code.replace(
  '<div className="flex flex-wrap items-center justify-between gap-4">',
  '<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">'
);

fs.writeFileSync(path, code);
console.log('Fixed optimization tabs alignment issue');
