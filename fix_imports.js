const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'app', 'dashboard', 'admin', 'transport', 'optimization', 'page.tsx');
let content = fs.readFileSync(file, 'utf8');

// Remove one of the duplicate imports
const importStr = 'import { useRouter } from "next/navigation";';
const firstIndex = content.indexOf(importStr);
if (firstIndex !== -1) {
  const secondIndex = content.indexOf(importStr, firstIndex + importStr.length);
  if (secondIndex !== -1) {
    // Remove the second occurrence
    content = content.slice(0, secondIndex) + content.slice(secondIndex + importStr.length);
  }
}

fs.writeFileSync(file, content, 'utf8');
