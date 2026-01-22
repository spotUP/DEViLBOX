/**
 * Fix TB-303 demo files to use new XM format
 *
 * Issues to fix:
 * 1. Instrument ID 0 → 1 (XM format: 0=no instrument, 1-128=valid)
 * 2. String notes → numeric (e.g., "D-2" → 39)
 * 3. Old volume format (64) → XM format (0x50)
 * 4. Null effects → numeric (effTyp: 0, eff: 0)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stringNoteToXM } from '../src/lib/xmConversions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface OldCell {
  note: string | null;
  instrument: number;
  volume: number | null;
  effect: string | null;
  effect2?: string | null;
  accent?: boolean;
  slide?: boolean;
}

interface NewCell {
  note: number;
  instrument: number;
  volume: number;
  effTyp: number;
  eff: number;
  effect2?: string | null;
  accent?: boolean;
  slide?: boolean;
}

const demoFiles = [
  '1-fatboy-slim-everybody-needs-a-303.dbox',
  '2-josh-wink-high-state-of-consciousness.dbox',
  '3-christophe-just-i-m-a-disco-dancer-part-1-.dbox',
  '4-christophe-just-i-m-a-disco-dancer-part-2-.dbox',
  '5-claustrophobic-sting-the-prodigy.dbox',
  '6-josh-wink-are-you-there.dbox',
  '7-cut-paste-forget-it-part-1-.dbox',
  '8-cut-paste-forget-it-part-2-.dbox',
  '9-public-energy-three-o-three-part-1-.dbox',
  '10-public-energy-three-o-three-part-2-.dbox',
];

function convertVolumeToXM(oldVolume: number | null): number {
  if (oldVolume === null || oldVolume === 0) return 0;
  // Old format: 0-64, XM format: 0x10-0x50
  if (oldVolume >= 0 && oldVolume <= 64) {
    return 0x10 + oldVolume;
  }
  return oldVolume; // Already in XM format
}

function fixDemoFile(filename: string) {
  const filepath = resolve(__dirname, '../public/demos/tb303', filename);
  console.log(`\n🔧 Fixing: ${filename}`);

  try {
    const content = readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);

    let changed = false;

    // Fix instrument IDs: 0 → 1
    if (data.instruments) {
      for (const inst of data.instruments) {
        if (inst.id === 0) {
          console.log(`  ✓ Fixed instrument ID: 0 → 1`);
          inst.id = 1;
          changed = true;
        }
      }
    }

    // Fix pattern cells
    if (data.patterns) {
      for (const pattern of data.patterns) {
        if (pattern.channels) {
          for (const channel of pattern.channels) {
            if (channel.rows) {
              for (const cell of channel.rows as OldCell[]) {
                // Fix note: string → numeric
                if (typeof cell.note === 'string') {
                  const numericNote = stringNoteToXM(cell.note);
                  (cell as any).note = numericNote;
                  changed = true;
                }

                // Fix instrument: 0 → 1
                if (cell.instrument === 0) {
                  (cell as any).instrument = 1;
                  changed = true;
                }

                // Fix volume: old format → XM format
                if (typeof cell.volume === 'number' && cell.volume > 0 && cell.volume <= 64) {
                  (cell as any).volume = convertVolumeToXM(cell.volume);
                  changed = true;
                }

                // Fix effects: null → numeric
                if (cell.effect === null || cell.effect === undefined) {
                  (cell as any).effTyp = 0;
                  (cell as any).eff = 0;
                  delete (cell as any).effect;
                  changed = true;
                }
              }
            }
          }
        }
      }
    }

    if (changed) {
      writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`  ✅ Fixed and saved`);
      return true;
    } else {
      console.log(`  ℹ️  No changes needed`);
      return false;
    }

  } catch (error) {
    console.error(`  ❌ Error: ${error}`);
    return false;
  }
}

console.log('=== Fixing TB-303 Demo Files ===\n');

let fixedCount = 0;
for (const file of demoFiles) {
  if (fixDemoFile(file)) {
    fixedCount++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`✅ Fixed ${fixedCount} of ${demoFiles.length} files`);
console.log(`\nRun 'npm run build' to update dist folder`);
