import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { parseVSMDirectory } from '../../src/engine/speech/VSMROMParser';
import { segmentLetterFrames } from '../../src/engine/speech/ROMPhonemeExtractor';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const rom = Buffer.concat([
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm')),
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0352n2l.vsm')),
]);
const words = parseVSMDirectory(new Uint8Array(rom));

// Check all letters
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i);
  const word = words[i];
  if (!word || word.name.toUpperCase() !== letter) continue;

  const segments = segmentLetterFrames(letter, word.frames);
  for (const [code, frames] of segments) {
    console.log(`\n${letter} -> ${code} (${frames.length} frames):`);
    for (let j = 0; j < Math.min(3, frames.length); j++) {
      const f = frames[j];
      console.log(`  [${j}] K=[${f.k.join(',')}] E=${f.energy} P=${f.pitch} U=${f.unvoiced}`);
    }
    if (frames.length > 3) console.log(`  ... +${frames.length - 3} more`);
    // Also show last few
    if (frames.length > 6) {
      for (let j = frames.length - 3; j < frames.length; j++) {
        const f = frames[j];
        console.log(`  [${j}] K=[${f.k.join(',')}] E=${f.energy} P=${f.pitch} U=${f.unvoiced}`);
      }
    }
  }
}