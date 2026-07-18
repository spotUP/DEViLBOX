/** Decisive, un-confoundable: does native AUDIO lead UADE AUDIO by ~1 buffer?
 *  Render both offline, take the amplitude envelope (RMS per 64-sample window) of
 *  each summed mono mix, cross-correlate envelopes over a lag range. Envelope (not
 *  raw wave) sidesteps pitch-phase — it measures coarse note/onset timing. Positive
 *  bestLag = native leads UADE by that many samples (native[i] ~ uade[i+lag]).
 *  If bestLag ~ +1024 => genuine one-buffer lead, delay render path. If ~0 => the
 *  paula-log +1 was a harness artifact; fix only the lockstep metric, not audio. */
import { renderSunTronicNative } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';

function sumMono(chs: Float32Array[]): Float32Array {
  const n = Math.max(...chs.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of chs) for (let i = 0; i < c.length; i++) out[i] += c[i];
  return out;
}
function envelope(x: Float32Array, win: number): Float32Array {
  const m = Math.floor(x.length / win); const e = new Float32Array(m);
  for (let k = 0; k < m; k++) { let s = 0; for (let i = 0; i < win; i++) { const v = x[k * win + i]; s += v * v; } e[k] = Math.sqrt(s / win); }
  // zero-mean for correlation
  let mean = 0; for (const v of e) mean += v; mean /= e.length || 1;
  for (let k = 0; k < e.length; k++) e[k] -= mean;
  return e;
}
function bestLag(a: Float32Array, b: Float32Array, maxLagWin: number): { lag: number; r: number } {
  // returns lag in ENVELOPE windows where a[i] ~ b[i+lag]
  let best = 0, bestR = -Infinity;
  const norm = (x: Float32Array, lo: number, hi: number) => { let s = 0; for (let i = lo; i < hi; i++) s += x[i] * x[i]; return Math.sqrt(s) || 1; };
  for (let lag = -maxLagWin; lag <= maxLagWin; lag++) {
    let s = 0; let cnt = 0; const lo = Math.max(0, -lag), hi = Math.min(a.length, b.length - lag);
    for (let i = lo; i < hi; i++) { s += a[i] * b[i + lag]; cnt++; }
    if (cnt < 10) continue;
    const r = s / (norm(a, lo, hi) * norm(b, lo + lag, hi + lag));
    if (r > bestR) { bestR = r; best = lag; }
  }
  return { lag: best, r: bestR };
}
async function main(): Promise<void> {
  const seconds = Number(process.argv[2] || 6);
  const WIN = 64; // envelope window (samples)
  const MAXLAG = Math.ceil(4096 / WIN); // ±4096 samples
  for (const song of process.argv.slice(3)) {
    const native = renderSunTronicNative(song, { seconds });
    const oracle = await renderUADEPerVoice(song, { seconds });
    const en = envelope(sumMono(native.ch), WIN);
    const eu = envelope(sumMono(oracle.ch), WIN);
    const { lag, r } = bestLag(en, eu, MAXLAG);
    console.log(`${song.padEnd(18)} bestLag=${(lag * WIN).toString().padStart(6)} samples  r=${r.toFixed(3)}  (+=native leads UADE)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
