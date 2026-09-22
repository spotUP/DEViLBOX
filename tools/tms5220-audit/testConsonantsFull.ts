import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { samToTMS5220 } from '@engine/speech/tms5220PhonemeMap';
import { buildFramesFromROMLibrary } from '@engine/speech/ROMPhonemeExtractor';
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
  const consonants = ['B*', 'D*', 'G*', 'P*', 'T*', 'K*', 'S*', 'F*', 'SH', 'CH', 'Z*', 'V*'];
  for (const c of consonants) {
    const phonemeStr = textToPhonemes(c);
    const tokens = parsePhonemeString(phonemeStr);
    const frames = buildFramesFromROMLibrary(tokens, library, samToTMS5220);
    const packed = packFrameBuffer(frames);
    const result = await renderFrameBuffer(packed, 2);
    console.log(c, 'peak:', result.peak.toFixed(4), 'dBFS:', result.peakDbfs, 'frames:', packed.numFrames);
  }
}
test();