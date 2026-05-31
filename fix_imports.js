const fs = require('fs');
const files = [
  'src/app/dashboard/driver/layout.tsx',
  'src/app/dashboard/employee/layout.tsx',
  'src/app/dashboard/manager/layout.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  if (!content.includes('import { useState, useEffect } from "react";')) {
    content = content.replace(
      'import Link from "next/link";',
      'import Link from "next/link";\nimport { useState, useEffect } from "react";'
    );
    fs.writeFileSync(f, content, 'utf8');
    console.log("Fixed imports in", f);
  }
});
