#!/usr/bin/env node
/**
 * Generate a manifest of all importable files in /public/data
 * This avoids issues with special characters in filenames when using import.meta.glob
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(__dirname, '../src/generated/file-manifest.json');

const EXTENSIONS = [
  '.dbx', '.dbi', '.json', '.xml',
  '.mod', '.xm', '.it', '.s3m', '.mptm',
  '.669', '.amf', '.ams', '.dbm', '.digi', '.dmf',
  '.dsm', '.far', '.ftm', '.gdm', '.gmc', '.imf',
  '.j2b', '.m15', '.mdl', '.med', '.mms', '.mt2',
  '.mtm', '.okt', '.psm', '.pt36', '.ptm', '.puma',
  '.sfx', '.sfx2', '.stk', '.stm', '.stp', '.stx',
  '.symmod', '.ult', '.umx',
  '.fur', '.fui',
  '.mid', '.midi',
  '.wav', '.mp3', '.ogg', '.flac', '.aif', '.aiff'
];

function scanDirectory(dir, baseDir = dir) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      files.push(...scanDirectory(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.includes(ext)) {
        // Store as /public/data/... path for consistency with import.meta.glob format
        files.push(`/public/data/${relativePath.replace(/\\/g, '/')}`);
      }
    }
  }
  
  return files;
}

// Scan the directory
console.log('Scanning', PUBLIC_DATA_DIR);
const files = scanDirectory(PUBLIC_DATA_DIR);
console.log(`Found ${files.length} files`);

// Create output directory if it doesn't exist
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write manifest
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(files, null, 2));
console.log('Wrote manifest to', OUTPUT_FILE);
