import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { parseVSMDirectory } from '@engine/speech/VSMROMParser';
import { packFrameBuffer } from '@engine/speech/tms5220FrameBuffer';
import { renderFrameBuffer } from './renderWord';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const rom = Buffer.concat([
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm')),
  readFileSync(join(ROOT, 'public/roms/snspell/tmc0352n2l.vsm')),
]);
const words = parseVSMDirectory(new Uint8Array(rom));

async function test() {
  for (let i = 0; i < words.length; i++) {
    if (words[i].name === 'HELLO') {
      console.log('HELLO at index', i, 'startBit', words[i].startBit, 'frames', words[i].frames.length);
      const word = words[i];
      const frames = word.frames.map(f => ({
        energy: f.energy,
        pitch: f.pitch,
        k: f.k,
        unvoiced: f.unvoiced,
        durationMs: 25,
      }));
      const packed = packFrameBuffer(frames);
      console.log('ROM frames:', packed.numFrames);
      const result1 = await renderFrameBuffer(packed, 2);
      console.log('Byte-exact (applyKnobOffsets=false): peak', result1.peak.toFixed(4), 'dBFS', result1.peakDbfs);
      break;
    }
  }
}
test();