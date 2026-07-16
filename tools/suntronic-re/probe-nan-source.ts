/**
 * probe-nan-source.ts — locate the FIRST NaN/Inf sample in a song's native
 * render and dump the voice state that produced it (the "2nd-loop-silent" root
 * cause: a NaN poisons the worklet ring buffer forever).
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-nan-source.ts [name.src] [seconds]
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer, NATIVE_SAMPLE_RATE } from '../../src/engine/suntronic/SunTronicNativeRender';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';

const name = process.argv[2] ?? 'zoids.src';
const seconds = Number(process.argv[3] ?? 20);
const sr = NATIVE_SAMPLE_RATE;
const CHUNK = 2048;
const total = seconds * sr;

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
const slotPcm = score.instrumentNames.map((n) => {
  const p = join(INSTR_DIR, n);
  return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
});
const renderer = new SunTronicNativeRenderer(score, slotPcm);
const l = new Float32Array(CHUNK), r = new Float32Array(CHUNK);
let produced = 0;
let firstBad = -1;
outer:
while (produced < total) {
  renderer.renderInto(l, r);
  for (let i = 0; i < CHUNK; i++) {
    const g = produced + i;
    if (g >= total) break outer;
    if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) {
      firstBad = g;
      console.log(`FIRST non-finite output @sample ${g} (t=${(g / sr).toFixed(3)}s)  L=${l[i]} R=${r[i]}`);
      console.log(`bucket=${Math.floor(g / 1024)}`);
      break outer;
    }
  }
  produced += CHUNK;
}
if (firstBad < 0) console.log(`no non-finite output in ${seconds}s for ${name}`);
