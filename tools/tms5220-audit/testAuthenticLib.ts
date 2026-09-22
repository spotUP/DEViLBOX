import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { buildFramesFromROMLibrary } from '@engine/speech/ROMPhonemeExtractor';
import { samToTMS5220 } from '@engine/speech/tms5220PhonemeMap';
import { packFrameBuffer } from '@engine/speech/tms5220FrameBuffer';
import { renderFrameBuffer } from './renderWord';
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

async function test() {
  // Test with authentic library (what use_rom_words=false now uses)
  const phonemeStr = textToPhonemes('WELCOME TO DEVILBOX');
  const tokens = parsePhonemeString(phonemeStr);
  const frames = buildFramesFromROMLibrary(tokens, library, samToTMS5220);
  const packed = packFrameBuffer(frames);
  console.log('Authentic library mode: frames=', packed.numFrames);

  const result = await renderFrameBuffer(packed, 4);
  console.log('peak:', result.peak.toFixed(4), 'dBFS:', result.peakDbfs, 'speechEnds:', result.speechEndsAtSec);
}
test();