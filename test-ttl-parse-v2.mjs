import fs from 'fs';

// Read the TTL file
const filePath = 'c:\\Users\\julia\\Downloads\\dpia-mim.ttl';
const text = fs.readFileSync(filePath, 'utf-8');

// Extract prefixes with improved regex
const prefixes = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("@prefix") || line.startsWith("PREFIX"))
  .reduce((acc, line) => {
    const match = line.match(/^(?:@)?prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\.?$/i);
    if (match) {
      acc[match[1]] = match[2];
    }
    return acc;
  }, {});

console.log('Found prefixes:', Object.keys(prefixes).length);

// Try the improved block splitting
const blocks = text
  .replace(/^(?:@)?prefix.*$/gm, '')
  .split(/\.\s*(?=<|[a-zA-Z_][a-zA-Z0-9_-]*:|$)/m)
  .map((block) => block.trim())
  .filter(Boolean);

console.log('Total blocks with improved regex:', blocks.length);
console.log('\nFirst 5 blocks:');
blocks.slice(0, 5).forEach((block, i) => {
  console.log(`\n--- Block ${i + 1} ---`);
  const lines = block.split('\n').slice(0, 3);
  lines.forEach(l => console.log(l));
  if (block.split('\n').length > 3) console.log('  ...');
});
