import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { parseVSMDirectory } from '@engine/speech/VSMROMParser';
import { buildCompletePhonemeLibrary } from '@engine/speech/ROMPhonemeExtractor';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const rom = Buffer.concat([
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm')),
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0352n2l.vsm')),
]);
const words = parseVSMDirectory(new Uint8Array(rom));
const { library } = buildCompletePhonemeLibrary(words);

const consonants = ['B*', 'D*', 'G*', 'P*', 'T*', 'K*', 'S*', 'F*', 'SH', 'CH', 'Z*', 'V*'];
for (const c of consonants) {
  const frames = library.get(c);
  if (frames) {
    console.log(c, 'frames:', frames.length, 'K1-2:', frames[0]?.k[0], frames[0]?.k[1], 'energy:', frames[0]?.energy, 'pitch:', frames[0]?.pitch);
  } else {
    console.log(c, 'NOT IN LIBRARY');
  }
}