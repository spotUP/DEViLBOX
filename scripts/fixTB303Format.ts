/**
 * Fix TB-303 .dbox files by adding missing format field
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== Fixing TB-303 .dbox Format Fields ===\n');

const tb303Dir = resolve(__dirname, '../public/demos/tb303');
const files = readdirSync(tb303Dir).filter(f => f.endsWith('.dbox'));

console.log(`Found ${files.length} .dbox files in tb303 directory\n`);

let fixedCount = 0;
let alreadyOkCount = 0;

for (const file of files) {
  const filePath = resolve(tb303Dir, file);
  console.log(`Processing: ${file}`);

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    let needsFix = false;

    // Check format field
    if (data.format !== 'devilbox-dbox') {
      if (data.format) {
        console.log(`  ⚠️  Has format: "${data.format}" - updating to "devilbox-dbox"`);
      } else {
        console.log(`  🔧 Missing format field - adding "devilbox-dbox"`);
      }
      data.format = 'devilbox-dbox';
      needsFix = true;
    }

    // Check sequence field
    if (!data.sequence || !Array.isArray(data.sequence)) {
      console.log(`  🔧 Missing sequence field - adding [0]`);
      data.sequence = [0]; // Single pattern at index 0
      needsFix = true;
    }

    if (!needsFix) {
      console.log(`  ✅ Already OK\n`);
      alreadyOkCount++;
      continue;
    }

    writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ✅ Fixed!\n`);
    fixedCount++;

  } catch (error) {
    console.error(`  ❌ Error: ${error}\n`);
  }
}

console.log('=== Summary ===');
console.log(`✅ Fixed: ${fixedCount} files`);
console.log(`✓  Already OK: ${alreadyOkCount} files`);
console.log(`📁 Total: ${files.length} files\n`);
