/**
 * Consolidate demo files:
 * 1. Convert .song.json demos to .dbox format
 * 2. Move all demos to unified /public/demos/ directory structure
 * 3. Organize by category (acid, tb303, general)
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DemoSong {
  file: string;
  name: string;
  category?: 'acid' | 'tb303' | 'general';
}

// Demo songs from FT2Toolbar.tsx
const DEMO_SONGS: DemoSong[] = [
  { file: 'classic-303-acid-demo.song.json', name: '🎛️ Classic 303 Acid Demo', category: 'acid' },
  { file: 'phuture-acid-tracks.song.json', name: 'Phuture - Acid Tracks', category: 'acid' },
  { file: 'hardfloor-funalogue.song.json', name: 'Hardfloor - Funalogue', category: 'acid' },
  { file: 'josh-wink-higher-state.song.json', name: 'Josh Wink - Higher State', category: 'acid' },
  { file: 'dittytoy-303.song.json', name: 'Dittytoy 303', category: 'acid' },
  { file: 'new-order-confusion.song.json', name: 'New Order - Confusion', category: 'general' },
  { file: 'fatboy-slim-everyone-needs-303.song.json', name: 'Fatboy Slim - Everyone Needs a 303', category: 'acid' },
  { file: 'fast-eddie-acid-thunder.song.json', name: 'Fast Eddie - Acid Thunder', category: 'acid' },
  { file: 'dj-tim-misjah-access.song.json', name: 'DJ Tim & Misjah - Access', category: 'acid' },
  { file: 'edge-of-motion-setup-707.song.json', name: 'Edge of Motion - 707 Setup', category: 'general' },
  { file: 'samplab-mathew-303.song.json', name: '🎹 Samplab Mathew 303', category: 'acid' },
  { file: 'samplab-mathew-full.song.json', name: '🎹 Samplab Mathew (Full)', category: 'acid' },
  { file: 'slow-creaky-acid-authentic.song.json', name: '🐌 Slow Creaky (Authentic)', category: 'acid' },
  { file: 'slow-creaky-acid-tempo-relative.song.json', name: '🐌 Slow Creaky (Tempo-Relative)', category: 'acid' },
];

// TB-303 demos (already in .dbox format)
const TB303_DEMOS = [
  { file: '1-fatboy-slim-everybody-needs-a-303.dbox', name: 'Fatboy Slim - Everybody needs a 303', category: 'tb303' },
  { file: '2-josh-wink-high-state-of-consciousness.dbox', name: 'Josh Wink - High State of Consciousness', category: 'tb303' },
  { file: '3-christophe-just-i-m-a-disco-dancer-part-1-.dbox', name: 'Christophe Just - I\'m a Disco Dancer (Part 1)', category: 'tb303' },
  { file: '4-christophe-just-i-m-a-disco-dancer-part-2-.dbox', name: 'Christophe Just - I\'m a Disco Dancer (Part 2)', category: 'tb303' },
  { file: '5-claustrophobic-sting-the-prodigy.dbox', name: 'Claustrophobic Sting - The Prodigy', category: 'tb303' },
  { file: '6-josh-wink-are-you-there.dbox', name: 'Josh Wink - Are You There', category: 'tb303' },
  { file: '7-cut-paste-forget-it-part-1-.dbox', name: 'Cut Paste - Forget It (Part 1)', category: 'tb303' },
  { file: '8-cut-paste-forget-it-part-2-.dbox', name: 'Cut Paste - Forget It (Part 2)', category: 'tb303' },
  { file: '9-public-energy-three-o-three-part-1-.dbox', name: 'Public Energy - Three O Three (Part 1)', category: 'tb303' },
  { file: '10-public-energy-three-o-three-part-2-.dbox', name: 'Public Energy - Three O Three (Part 2)', category: 'tb303' },
];

function convertSongToDbox(songPath: string, outputDir: string): boolean {
  try {
    console.log(`\n🔄 Converting: ${basename(songPath)}`);

    const songData = JSON.parse(readFileSync(songPath, 'utf-8'));

    // Change format from 'devilbox-song' to 'devilbox-dbox'
    if (songData.format === 'devilbox-song') {
      songData.format = 'devilbox-dbox';
    }

    // Write as .dbox format
    const dboxFilename = basename(songPath).replace('.song.json', '.dbox');
    const dboxPath = resolve(outputDir, dboxFilename);

    writeFileSync(dboxPath, JSON.stringify(songData, null, 2));
    console.log(`  ✅ Converted to: ${dboxFilename}`);

    return true;
  } catch (error) {
    console.error(`  ❌ Error converting ${basename(songPath)}: ${error}`);
    return false;
  }
}

function copyDboxFile(sourcePath: string, outputPath: string): boolean {
  try {
    console.log(`\n📋 Copying: ${basename(sourcePath)}`);
    copyFileSync(sourcePath, outputPath);
    console.log(`  ✅ Copied to: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error copying ${basename(sourcePath)}: ${error}`);
    return false;
  }
}

console.log('=== Consolidating Demo Files ===\n');

// Create unified directory structure
const demosRoot = resolve(__dirname, '../public/demos');
const acidDir = resolve(demosRoot, 'acid');
const tb303Dir = resolve(demosRoot, 'tb303');
const generalDir = resolve(demosRoot, 'general');

console.log('📁 Creating directory structure...');
mkdirSync(acidDir, { recursive: true });
mkdirSync(tb303Dir, { recursive: true });
mkdirSync(generalDir, { recursive: true });
console.log('  ✅ Directories created\n');

let convertedCount = 0;
let copiedCount = 0;

// Convert .song.json files to .dbox
console.log('🔄 Converting .song.json demos to .dbox format...');
for (const demo of DEMO_SONGS) {
  const sourcePath = resolve(__dirname, '../public/songs', demo.file);
  const targetDir = demo.category === 'acid' ? acidDir :
                    demo.category === 'general' ? generalDir : demosRoot;

  if (existsSync(sourcePath)) {
    if (convertSongToDbox(sourcePath, targetDir)) {
      convertedCount++;
    }
  } else {
    console.log(`  ⚠️  Not found: ${demo.file}`);
  }
}

// Copy existing .dbox files
console.log('\n📋 Copying existing .dbox files...');
for (const demo of TB303_DEMOS) {
  const sourcePath = resolve(__dirname, '../public/demos/tb303', demo.file);
  const targetPath = resolve(tb303Dir, demo.file);

  if (existsSync(sourcePath)) {
    if (copyDboxFile(sourcePath, targetPath)) {
      copiedCount++;
    }
  } else {
    console.log(`  ⚠️  Not found: ${demo.file}`);
  }
}

// Generate manifest file for easier loading
const manifest = {
  version: '1.0.0',
  categories: {
    acid: DEMO_SONGS
      .filter(d => d.category === 'acid')
      .map(d => ({
        file: d.file.replace('.song.json', '.dbox'),
        name: d.name,
      })),
    tb303: TB303_DEMOS.map(d => ({
      file: d.file,
      name: d.name,
    })),
    general: DEMO_SONGS
      .filter(d => d.category === 'general')
      .map(d => ({
        file: d.file.replace('.song.json', '.dbox'),
        name: d.name,
      })),
  },
};

const manifestPath = resolve(demosRoot, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n📄 Created manifest: ${manifestPath}`);

console.log(`\n=== Summary ===`);
console.log(`✅ Converted ${convertedCount} .song.json files to .dbox`);
console.log(`✅ Copied ${copiedCount} existing .dbox files`);
console.log(`✅ Total demos: ${convertedCount + copiedCount}`);
console.log(`\n📁 New structure:`);
console.log(`  /public/demos/acid/     - ${manifest.categories.acid.length} files`);
console.log(`  /public/demos/tb303/    - ${manifest.categories.tb303.length} files`);
console.log(`  /public/demos/general/  - ${manifest.categories.general.length} files`);
console.log(`\nNext steps:`);
console.log(`  1. Update FT2Toolbar.tsx to use new paths`);
console.log(`  2. Run 'npm run build' to update dist folder`);
console.log(`  3. Test demo loading in browser`);
