const fs = require('fs');
const path = require('path');

// Read the TTL file
const filePath = 'c:\\Users\\julia\\Downloads\\dpia-mim.ttl';
const text = fs.readFileSync(filePath, 'utf-8');

// Extract prefixes (simplified version from the code)
const prefixes = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('@prefix') || line.startsWith('PREFIX'))
  .reduce((acc, line) => {
    const match = line.match(/^(?:@)?prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\.?$/i);
    if (match) {
      acc[match[1]] = match[2];
    }
    return acc;
  }, {});

console.log('Found prefixes:', Object.keys(prefixes).length);
Object.entries(prefixes).forEach(([k, v]) => {
  console.log(`  ${k}: ${v}`);
});

// Try to parse blocks
const blocks = text
  .replace(/^@prefix.*$/gm, '')
  .replace(/^PREFIX.*$/gm, '')
  .split(/\.\s*(?=<|[a-z]:|$)/i)
  .map((block) => block.trim())
  .filter(Boolean);

console.log('\nTotal blocks:', blocks.length);
console.log('\nFirst 3 blocks:');
blocks.slice(0, 3).forEach((block, i) => {
  console.log(`\n--- Block ${i + 1} ---`);
  console.log(block.substring(0, 200));
});

// Check for rdfs:label or rdfs:comment
const labelCount = (text.match(/rdfs:label|rdfs:comment|skos:prefLabel/gi) || []).length;
console.log('\n\nRDFS/SKOS label/comment count:', labelCount);

// Check what properties exist
const propertyMatches = text.match(/\s+([a-z]+:[a-zA-Z_-]+)\s+/gi);
const uniqueProperties = new Set(propertyMatches ? propertyMatches.map(p => p.trim()) : []);
console.log('\nUnique properties found:', uniqueProperties.size);
Array.from(uniqueProperties)
  .sort()
  .slice(0, 20)
  .forEach(p => console.log(`  ${p}`));
