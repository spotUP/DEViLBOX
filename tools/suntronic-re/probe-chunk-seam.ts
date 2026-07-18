/**
 * probe-chunk-seam.ts — is SunTronicNativeRenderer.renderInto invariant to the
 * live engine's 2048-sample chunking? Renders the same song two ways:
 *   (A) one giant renderInto (what the offline oracle / renderSunTronicMix does)
 *   (B) many CHUNK=2048 renderInto calls (what SunTronicSongEngine does live)
 * and reports the max abs sample difference per voice, plus the first diverging
 * sample index. If B != A, the live streaming path is the bug and it is now
 * reproducible + testable offline.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-chunk-seam.ts [song]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer, NATIVE_SAMPLE_RATE } from '../../src/engine/suntronic/SunTronicNativeRender';
import { readdirSync } from 'fs';

const CHUNK = 2048;
const name = process.argv[2] ?? 'ready';
const seconds = 65;

// mirror native-mix loadSlotPcm
function loadSlotPcm(names: string[]): (Int8Array | null)[] {
  const dir = join(CORPUS_DIR);
  const files = readdirSync(dir);
  return names.map((nm) => {
    if (!nm) return null;
    const hit = files.find((f) => f.toLowerCase() === nm.toLowerCase());
    if (!hit) return null;
    try { return new Int8Array(readFileSync(join(dir, hit))); } catch { return null; }
  });
}

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
const score = parseSunTronicV13Score(data);
const slotPcm = loadSlotPcm(score.instrumentNames);
const total = Math.floor(seconds * NATIVE_SAMPLE_RATE);

// (A) single call
const rA = new SunTronicNativeRenderer(score, slotPcm);
const chA = [0, 1, 2, 3].map(() => new Float32Array(total));
{
  const L = new Float32Array(total), R = new Float32Array(total);
  rA.renderInto(L, R, { ch: chA as never });
}

// (B) chunked
const rB = new SunTronicNativeRenderer(score, slotPcm);
const chB = [0, 1, 2, 3].map(() => new Float32Array(total));
{
  let off = 0;
  while (off < total) {
    const n = Math.min(CHUNK, total - off);
    const L = new Float32Array(n), R = new Float32Array(n);
    const ch = [0, 1, 2, 3].map(() => new Float32Array(n));
    rB.renderInto(L, R, { ch: ch as never });
    for (let v = 0; v < 4; v++) chB[v].set(ch[v], off);
    off += n;
  }
}

console.log('voice | maxAbsDiff | firstDiffSample | firstDiffTick');
for (let v = 0; v < 4; v++) {
  let maxD = 0, first = -1;
  for (let i = 0; i < total; i++) {
    const d = Math.abs(chA[v][i] - chB[v][i]);
    if (d > maxD) maxD = d;
    if (first < 0 && d > 1e-9) first = i;
  }
  const tick = first >= 0 ? (first / 882.759).toFixed(1) : '-';
  console.log(`  ${v}   | ${maxD.toExponential(3)} | ${String(first).padStart(9)} | ${tick}`);
}
