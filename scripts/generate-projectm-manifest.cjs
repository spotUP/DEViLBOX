#!/usr/bin/env node
/**
 * generate-projectm-manifest.js
 *
 * Walks public/projectm/presets/ recursively, collects all .milk files,
 * and writes public/projectm/presets-manifest.json.
 *
 * Usage: node scripts/generate-projectm-manifest.js
 */

const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.resolve(__dirname, '..', 'public', 'projectm', 'presets');
const OUTPUT = path.resolve(__dirname, '..', 'public', 'projectm', 'presets-manifest.json');

function walk(dir, base) {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...walk(fullPath, base));
    } else if (item.name.endsWith('.milk')) {
      const relPath = path.relative(base, fullPath);
      // Category = top-level directory name
      const category = relPath.split(path.sep)[0];
      // Name = filename without .milk extension
      const name = path.basename(item.name, '.milk');
      entries.push({ name, path: relPath, category });
    }
  }
  return entries;
}

const presets = walk(PRESETS_DIR, PRESETS_DIR);

// Sort by category, then name
presets.sort((a, b) => {
  const catCmp = a.category.localeCompare(b.category);
  if (catCmp !== 0) return catCmp;
  return a.name.localeCompare(b.name);
});

// Collect unique categories (sorted)
const categories = [...new Set(presets.map(p => p.category))].sort();

const manifest = { categories, presets };

fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2));
console.log(`Generated manifest: ${presets.length} presets in ${categories.length} categories`);
console.log(`Categories: ${categories.join(', ')}`);
console.log(`Output: ${OUTPUT}`);
