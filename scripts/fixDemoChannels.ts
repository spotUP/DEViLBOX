#!/usr/bin/env ts-node
/**
 * Fix inconsistent channel counts in demo songs
 * All patterns in a song should have the same number of channels
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TrackerCell {
  note: number;
  instrument: number;
  volume: number;
  effTyp: number;
  eff: number;
  effTyp2: number;
  eff2: number;
  flag1?: number;
  flag2?: number;
  probability?: number;
}

interface ChannelData {
  id: string;
  name: string;
  rows: TrackerCell[];
  muted: boolean;
  solo: boolean;
  collapsed: boolean;
  volume: number;
  pan: number;
  instrumentId: number | null;
  color: string | null;
}

interface Pattern {
  id: string;
  name: string;
  length: number;
  channels: ChannelData[];
}

interface DBoxFile {
  format: string;
  version: string;
  patterns: Pattern[];
  [key: string]: any;
}

const EMPTY_CELL: TrackerCell = {
  note: 0,
  instrument: 0,
  volume: 0,
  effTyp: 0,
  eff: 0,
  effTyp2: 0,
  eff2: 0,
};

function fixChannelCounts(filepath: string): boolean {
  console.log(`\nProcessing: ${filepath}`);
  
  const data: DBoxFile = JSON.parse(readFileSync(filepath, 'utf-8'));
  
  if (!data.patterns || data.patterns.length === 0) {
    console.log('  No patterns found');
    return false;
  }
  
  // Find max channel count across all patterns
  const channelCounts = data.patterns.map(p => p.channels.length);
  const maxChannels = Math.max(...channelCounts);
  const minChannels = Math.min(...channelCounts);
  
  if (maxChannels === minChannels) {
    console.log(`  ✓ Already consistent: ${maxChannels} channels`);
    return false;
  }
  
  console.log(`  Inconsistent: ${minChannels}-${maxChannels} channels, standardizing to ${maxChannels}`);
  
  let modified = false;
  
  // Standardize all patterns to maxChannels
  data.patterns.forEach((pattern, patIdx) => {
    const currentChannels = pattern.channels.length;
    
    if (currentChannels < maxChannels) {
      console.log(`    Pattern ${patIdx} (${pattern.name}): ${currentChannels} → ${maxChannels} channels`);
      
      // Add empty channels to reach maxChannels
      for (let i = currentChannels; i < maxChannels; i++) {
        pattern.channels.push({
          id: `channel-${i}-${Date.now()}-${Math.random()}`,
          name: `Channel ${i + 1}`,
          rows: Array.from({ length: pattern.length }, () => ({ ...EMPTY_CELL })),
          muted: false,
          solo: false,
          collapsed: false,
          volume: 80,
          pan: 0,
          instrumentId: null,
          color: null,
        });
      }
      
      modified = true;
    }
  });
  
  if (modified) {
    writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log('  ✓ Fixed and saved');
  }
  
  return modified;
}

const FILES_TO_FIX = [
  '303-feature-test.dbox',
  'comprehensive-feature-test.dbox',
  'josh-wink-higher-state.dbox',
  'mr-oizo-flat-beat.dbox',
];

const songsDir = resolve(__dirname, '../public/data/songs');
let totalFixed = 0;

console.log('Fixing inconsistent channel counts in demo songs...');
console.log('='.repeat(60));

FILES_TO_FIX.forEach(filename => {
  const filepath = resolve(songsDir, filename);
  try {
    if (fixChannelCounts(filepath)) {
      totalFixed++;
    }
  } catch (err) {
    console.error(`  ✗ Error: ${err}`);
  }
});

console.log('='.repeat(60));
console.log(`\nFixed ${totalFixed} file(s)`);
