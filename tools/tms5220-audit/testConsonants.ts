import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { samToTMS5220 } from '@engine/speech/tms5220PhonemeMap';
import { packFrameBuffer } from '@engine/speech/tms5220FrameBuffer';
import { renderFrameBuffer } from './renderWord';

async function test() {
  const consonants = ['B*', 'D*', 'G*', 'P*', 'T*', 'K*', 'S*', 'F*', 'SH', 'CH', 'Z*', 'V*'];
  for (const c of consonants) {
    const phonemeStr = textToPhonemes(c);
    const tokens = parsePhonemeString(phonemeStr);
    const frames = tokens.map(t => samToTMS5220(t.code)).filter(Boolean);
    const packed = packFrameBuffer(frames);
    const result = await renderFrameBuffer(packed, 2);
    console.log(c, 'peak:', result.peak.toFixed(4), 'dBFS:', result.peakDbfs, 'frames:', packed.numFrames);
  }
}
test();