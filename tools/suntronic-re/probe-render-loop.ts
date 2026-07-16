/**
 * probe-render-loop.ts — does the STREAMING renderer keep producing audio past
 * the song's first-pass length, or go silent (the browser "2nd loop silent")?
 *
 * Renders N seconds continuously via renderSunTronicMix and prints per-second RMS.
 * If RMS stays > 0 past ~7.7 s, the render core loops fine and the browser silence
 * is a transport/lifecycle stop (engine.stop() called), NOT a render bug.
 *
 * Run: npx tsx tools/suntronic-re/probe-render-loop.ts [name.src] [seconds]
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer, NATIVE_SAMPLE_RATE } from '../../src/engine/suntronic/SunTronicNativeRender';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';

const name = process.argv[2] ?? 'ballblaser.src';
const seconds = Number(process.argv[3] ?? 15);

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
const slotPcm = score.instrumentNames.map((n) => {
  const p = join(INSTR_DIR, n);
  return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
});

// Replicate the BROWSER pump exactly: many short renderInto chunks (CHUNK=2048),
// NOT one whole-song renderSunTronicMix call. This is what SunTronicSongEngine
// drives through the worklet. If a chunk goes silent past the ~7.7s first pass,
// the streaming renderer (not the transport) is the 2nd-loop-silent culprit.
const sr = NATIVE_SAMPLE_RATE;
const CHUNK = 2048;
const total = seconds * sr;
const renderer = new SunTronicNativeRenderer(score, slotPcm);

const secSum = new Float64Array(seconds);
const secPeak = new Float64Array(seconds);
const l = new Float32Array(CHUNK), r = new Float32Array(CHUNK);
let produced = 0;
console.log(`stream ${name}  ${seconds}s @${sr}  chunk=${CHUNK}`);
while (produced < total) {
  renderer.renderInto(l, r);
  for (let i = 0; i < CHUNK; i++) {
    const g = produced + i;
    if (g >= total) break;
    const s = Math.floor(g / sr);
    const p = l[i] * l[i] + r[i] * r[i];
    secSum[s] += p;
    const m = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    if (m > secPeak[s]) secPeak[s] = m;
  }
  produced += CHUNK;
}
for (let s = 0; s < seconds; s++) {
  const rms = Math.sqrt(secSum[s] / (2 * sr));
  console.log(`  ${String(s).padStart(2)}s..${s + 1}s  rms=${rms.toFixed(5)}  peak=${secPeak[s].toFixed(4)}  ${rms < 1e-5 ? 'SILENT' : ''}`);
}
