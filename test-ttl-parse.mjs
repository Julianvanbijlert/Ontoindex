import fs from 'fs';

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
  console.log(block.substring(0, 300));
});

// Check for rdfs:label or rdfs:comment
const labelCount = (text.match(/rdfs:label|rdfs:comment|skos:prefLabel/gi) || []).length;
console.log('\n\nRDFS/SKOS label/comment count:', labelCount);

// Check for rdfs:comment or mim properties
const mimProperties = (text.match(/\s+(mim:[a-zA-Z_-]+|rdfs:[a-zA-Z_-]+)\s+/gi) || [])
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();
console.log('\nUnique MIM/RDFS properties found:', mimProperties.length);
mimProperties.slice(0, 15).forEach(p => console.log(`  ${p.trim()}`));
