const fs = require('fs');
const path = require('path');

const replacements = [
  // 1. Remove all roundness
  { regex: /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/g, replacement: 'rounded-none' },

  // 2. Kill all vibrant background colors -> Map to Surface Gray or White
  { regex: /\bbg-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:50|100|200)\b/g, replacement: 'bg-[#f7f7f7]' },
  { regex: /\bbg-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:300|400|500|600|700|800|900)\b/g, replacement: 'bg-[#1c1b1f]' },

  // 3. Kill all vibrant text colors -> Map to Near Black or Orange
  { regex: /\btext-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:50|100|200|300|400|500)\b/g, replacement: 'text-[#6b6b6b]' },
  { regex: /\btext-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:600|700|800|900)\b/g, replacement: 'text-[#1c1b1f]' },

  // 4. Kill all vibrant borders -> Map to Border Gray or Near Black
  { regex: /\bborder-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:50|100|200|300)\b/g, replacement: 'border-[#e8e8e8]' },
  { regex: /\bborder-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:400|500|600|700|800|900)\b/g, replacement: 'border-[#1c1b1f]' },

  // 5. Special gradient removals (replace with flat background)
  { regex: /\bbg-gradient-to-[a-z]+\b/g, replacement: 'bg-white' },
  { regex: /\bfrom-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan|slate|gray)-(?:50|100|200|300|400|500|600|700|800|900)\b/g, replacement: '' },
  { regex: /\bto-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan|slate|gray)-(?:50|100|200|300|400|500|600|700|800|900)\b/g, replacement: '' },
  { regex: /\bvia-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan|slate|gray)-(?:50|100|200|300|400|500|600|700|800|900)\b/g, replacement: '' },

  // 6. Ring removals
  { regex: /\bring-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:50|100|200|300|400|500|600|700|800|900)\b/g, replacement: 'ring-[#e8e8e8]' },
  { regex: /\bfocus:ring-(?:emerald|amber|red|blue|indigo|purple|green|yellow|rose|teal|cyan)-(?:50|100|200|300|400|500|600|700|800|900)\b/g, replacement: 'focus:ring-[#ff4f00]/20' }
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
      
      // Clean up multiple spaces horizontally, BUT preserve newlines!
      content = content.replace(/ +/g, ' ');
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Aggressively updated tokens in: ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, 'src', 'app'));
processDirectory(path.join(__dirname, 'src', 'components'));

console.log('Aggressive UI Overhaul completed successfully.');
