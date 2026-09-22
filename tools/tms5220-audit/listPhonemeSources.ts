import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { parseVSMDirectory } from '../../src/engine/speech/VSMROMParser';
import { buildCompletePhonemeLibrary } from '../../src/engine/speech/ROMPhonemeExtractor';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const rom = Buffer.concat([
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm')),
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0352n2l.vsm')),
]);
const words = parseVSMDirectory(new Uint8Array(rom));
const result = buildCompletePhonemeLibrary(words);
const { library, provenance } = result;

console.log('Total phonemes:', library.size);
console.log('Mined (letter/word/phrase):');
for (const [code, prov] of provenance) {
  if (prov.source !== 'derived') {
    console.log(' ', code, prov.source, prov.words.join(', '));
  }
}
console.log('\nDerived:');
for (const [code, prov] of provenance) {
  if (prov.source === 'derived') {
    console.log(' ', code, prov.words.join(', '));
  }
}