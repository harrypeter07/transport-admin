const fs = require('fs');
const path = require('path');

const replacements = [
  // Text Colors
  { regex: /\btext-slate-900\b/g, replacement: 'text-[#1c1b1f]' },
  { regex: /\btext-slate-800\b/g, replacement: 'text-[#1c1b1f]' },
  { regex: /\btext-slate-700\b/g, replacement: 'text-[#4a4a4a]' },
  { regex: /\btext-slate-600\b/g, replacement: 'text-[#6b6b6b]' },
  { regex: /\btext-slate-500\b/g, replacement: 'text-[#6b6b6b]' },
  { regex: /\btext-slate-400\b/g, replacement: 'text-[#9a9a9a]' },
  { regex: /\btext-slate-300\b/g, replacement: 'text-[#b0b0b0]' },
  
  // Background Colors
  { regex: /\bbg-slate-950\b/g, replacement: 'bg-black' },
  { regex: /\bbg-slate-900\b/g, replacement: 'bg-[#1c1b1f]' },
  { regex: /\bhover:bg-slate-800\b/g, replacement: 'hover:bg-black' },
  { regex: /\bhover:bg-slate-900\b/g, replacement: 'hover:bg-black' },
  { regex: /\bactive:bg-slate-950\b/g, replacement: 'active:bg-black' },
  { regex: /\bbg-slate-100\b/g, replacement: 'bg-[#f7f7f7]' },
  { regex: /\bbg-slate-50\b/g, replacement: 'bg-[#f7f7f7]' },
  { regex: /\bhover:bg-slate-100\b/g, replacement: 'hover:bg-[#f7f7f7]' },
  { regex: /\bhover:bg-slate-50\b/g, replacement: 'hover:bg-[#f7f7f7]' },
  
  // Borders
  { regex: /\bborder-slate-200\b/g, replacement: 'border-[#e8e8e8]' },
  { regex: /\bborder-slate-300\b/g, replacement: 'border-[#d0d0d0]' },
  { regex: /\bborder-slate-800\b/g, replacement: 'border-[#1c1b1f]' },
  
  // Primary brand accents (blue -> orange)
  { regex: /\btext-blue-600\b/g, replacement: 'text-[#ff4f00]' },
  { regex: /\btext-blue-500\b/g, replacement: 'text-[#ff4f00]' },
  { regex: /\bbg-blue-600\b/g, replacement: 'bg-[#ff4f00]' },
  { regex: /\bhover:bg-blue-700\b/g, replacement: 'hover:bg-[#e64500]' },
  { regex: /\btext-indigo-600\b/g, replacement: 'text-[#ff4f00]' },
  { regex: /\bbg-indigo-600\b/g, replacement: 'bg-[#ff4f00]' },
  
  // Focus & Rings
  { regex: /\bfocus:border-slate-500\b/g, replacement: 'focus:border-[#ff4f00]' },
  { regex: /\bfocus:ring-slate-900\/10\b/g, replacement: 'focus:ring-[#ff4f00]/20' },
  { regex: /\bring-slate-900\/10\b/g, replacement: 'ring-[#1c1b1f]/10' },
  
  // Overly heavy shadows
  { regex: /\bshadow-sm\b/g, replacement: 'shadow-none' },
  { regex: /\bshadow-md\b/g, replacement: 'shadow-none' },
  { regex: /\bshadow-lg\b/g, replacement: 'shadow-sm' }
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      
      for (const { regex, replacement } of replacements) {
        content = content.replace(regex, replacement);
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated UI tokens in: ${fullPath}`);
      }
    }
  }
}

// Start processing from src/app and src/components
processDirectory(path.join(__dirname, 'src', 'app'));
processDirectory(path.join(__dirname, 'src', 'components'));

console.log('UI Overhaul completed successfully.');
