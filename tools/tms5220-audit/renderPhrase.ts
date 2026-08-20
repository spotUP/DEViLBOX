/**
 * renderPhrase.ts — A/B render a typed phrase through the real MAME TMS5220
 * chip, once with the ROM-mined phoneme library and once with the old static
 * table. Writes both WAVs and prints comparable level statistics.
 *
 * Usage:
 *   npx tsx tools/tms5220-audit/renderPhrase.ts "HELLO WORLD" [out.wav]
 *   npx tsx tools/tms5220-audit/renderPhrase.ts "ZEBRA QUICK VEX BOY JUDGE" [out.wav] --static
 *
 * The --static flag renders only the static-table version (no ROM mining).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { renderFrameBuffer, writeWav } from './renderWord';
import { textToPhonemes, parsePhonemeString } from '../../src/engine/speech/Reciter';
import { buildCompletePhonemeLibrary, buildFramesFromROMLibrary } from '../../src/engine/speech/ROMPhonemeExtractor';
import { phonemesToTMS5220Frames, samToTMS5220 } from '../../src/engine/speech/tms5220PhonemeMap';
import { packFrameBuffer } from '../../src/engine/speech/tms5220FrameBuffer';
import { parseVSMDirectory } from '../../src/engine/speech/VSMROMParser';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const ROMS = join(ROOT, 'public/roms/snspell');

function loadWords() {
  const rom = Buffer.concat([
    readFileSync(join(ROMS, 'tmc0351n2l.vsm')),
    readFileSync(join(ROMS, 'tmc0352n2l.vsm')),
  ]);
  return parseVSMDirectory(new Uint8Array(rom));
}

async function renderOne(text: string, mode: 'library' | 'static', outPath: string) {
  const phonemeStr = textToPhonemes(text);
  if (!phonemeStr) throw new Error(`no phoneme mapping for "${text}"`);
  const tokens = parsePhonemeString(phonemeStr);

  let frames;
  let provenanceCount = 0;
  if (mode === 'library') {
    const words = loadWords();
    const { library, provenance } = buildCompletePhonemeLibrary(words);
    provenanceCount = [...provenance.values()].filter(p => p.source !== 'derived').length;
    // Mirror the browser synth exactly: same pipeline, same fallback.
    frames = buildFramesFromROMLibrary(tokens, library, samToTMS5220);
  } else {
    // Mirror the browser synth's no-ROM path exactly.
    frames = phonemesToTMS5220Frames(tokens);
  }

  const packed = packFrameBuffer(frames);
  const result = await renderFrameBuffer(packed, 4);
  const { samples, sampleRate, ...stats } = result;

  writeWav(outPath, samples, sampleRate);
  return {
    mode,
    phonemes: tokens.map(t => t.code).join(' '),
    frameCount: packed.numFrames,
    minedCodes: mode === 'library' ? provenanceCount : null,
    ...stats,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const text = process.argv[2] ?? 'HELLO WORLD';
  const outPath = process.argv[3] ?? join(ROOT, 'tms5220-phrase.wav');
  const mode: 'library' | 'static' = process.argv.includes('--static') ? 'static' : 'library';

  const info = await renderOne(text, mode, outPath);
  console.log(JSON.stringify(info, null, 2));
  console.log('wrote', outPath);

  if (mode === 'library') {
    const staticPath = outPath.replace(/\.wav$/, '-static.wav');
    const staticInfo = await renderOne(text, 'static', staticPath);
    console.log('\n=== static-table comparison ===');
    console.log(JSON.stringify(staticInfo, null, 2));
    console.log('wrote', staticPath);
  }
}