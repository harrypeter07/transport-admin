const fs = require('fs');

const path = 'src/app/dashboard/admin/transport/optimization/page.tsx';
let code = fs.readFileSync(path, 'utf8');

// Make the Top Workspace Bar sticky so it doesn't get hidden under the tabs when scrolling
code = code.replace(
  '<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">',
  '<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-[100px] z-30 bg-[#f7f7f7] py-2 -mx-2 px-2">'
);

fs.writeFileSync(path, code);
console.log('Fixed optimization top workspace bar scroll issue');
