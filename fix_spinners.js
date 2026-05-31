const fs = require('fs');
const path = require('path');

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
      
      // Match className="..." containing animate-spin or animate-spin-fast
      // This regex replaces rounded-none with rounded-full if animate-spin is present
      content = content.replace(/className=(["'])(.*?)\1/g, (match, quote, classNames) => {
        if (classNames.includes('animate-spin') || classNames.includes('animate-spin-fast')) {
          const newClassNames = classNames.replace(/\brounded-none\b/g, 'rounded-full');
          return `className=${quote}${newClassNames}${quote}`;
        }
        return match;
      });
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Fixed spinner in: ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(__dirname, 'src', 'app'));
processDirectory(path.join(__dirname, 'src', 'components'));

console.log('Fixed spinner roundness.');
