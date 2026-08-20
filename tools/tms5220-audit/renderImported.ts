/**
 * renderImported.ts — render every imported QBox recording through the shipped
 * MAME chip bundle and print level stats, proving the recordings decode to
 * real speech (not silence/garbage) after the 6->5-bit pitch conversion.
 *
 * Usage:
 *   npx tsx tools/tms5220-audit/renderImported.ts [outDir]
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { IMPORTED_RECORDINGS } from '../../src/generated/tms5220Recordings';
import { packFrameBuffer } from '../../src/engine/speech/tms5220FrameBuffer';
import { renderFrameBuffer, writeWav } from './renderWord';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const outDir = process.argv[2] ?? join(ROOT, 'tms5220-imported');
  mkdirSync(outDir, { recursive: true });

  for (const rec of IMPORTED_RECORDINGS) {
    const packed = packFrameBuffer(rec.frames);
    const { samples, sampleRate, ...stats } = await renderFrameBuffer(packed, 3);
    writeWav(join(outDir, `${rec.word.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wav`), samples, sampleRate);
    console.log(`${rec.word.padEnd(16)} ${rec.chip.padEnd(10)} peak=${stats.peak} rms=${stats.rms} ends=${stats.speechEndsAtSec}s stillSpeaking=${stats.stillSpeaking}`);
  }
}