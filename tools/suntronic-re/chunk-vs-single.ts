import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer } from '../../src/engine/suntronic/SunTronicNativeRender';

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, 'ready')));
const score = parseSunTronicV13Score(data);
const slotPcm = (score.instrumentNames as string[]).map((n) => {
  const p = join(INSTR_DIR, n); return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
});
const SR = 44100, SECS = 8, N = SR * SECS;
// single pass
const rSingle = new SunTronicNativeRenderer(score, slotPcm);
const lS = new Float32Array(N), rS = new Float32Array(N);
rSingle.renderInto(lS, rS);
// chunked at 2048 (browser CHUNK)
const rChunk = new SunTronicNativeRenderer(score, slotPcm);
const lC = new Float32Array(N), rC = new Float32Array(N);
const CH = 2048;
for (let off = 0; off < N; off += CH) {
  const len = Math.min(CH, N - off);
  const l = new Float32Array(len), r = new Float32Array(len);
  rChunk.renderInto(l, r);
  lC.set(l, off); rC.set(r, off);
}
let maxDiff = 0, sumDiff = 0, firstDiff = -1;
for (let i = 0; i < N; i++) {
  const d = Math.abs(lS[i] - lC[i]) + Math.abs(rS[i] - rC[i]);
  if (d > maxDiff) maxDiff = d;
  sumDiff += d;
  if (d > 1e-6 && firstDiff < 0) firstDiff = i;
}
console.log(`samples=${N} maxDiff=${maxDiff.toExponential(3)} meanDiff=${(sumDiff/N).toExponential(3)} firstDiffSample=${firstDiff} (${firstDiff>=0?(firstDiff/SR).toFixed(4)+'s':'none'})`);
