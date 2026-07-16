/**
 * probe-drift-slope.ts — Gate E, reassessment after Phase 2a NO-LIFT.
 *
 * The φ sweep proved the residual is NOT vblank sub-phase alignment, and the
 * ceiling probe proved the WAVEFORM is byte-correct (wide maxLag recovers
 * 0.80–0.93). So the residual is pure phase ACCUMULATION. This probe measures
 * the lag trajectory (best-lag per sliding window vs time) for the hardest
 * synth voices to discriminate the mechanism:
 *
 *   - lag(t) ≈ k·t  (straight line, constant slope)  -> CONSTANT CLOCK-RATIO
 *     error. One wrong scale constant (Paula clock, or oracle sample rate).
 *     Cheap fix: correct the resampler `inc` constant. No scheduler port.
 *   - lag(t) erratic / step-wise / non-monotone        -> PER-PERIOD PHASE
 *     CARRY. The fractional Paula counter phase must survive period changes;
 *     needs the cycle-accurate Paula-DMA model (multi-session port).
 *
 * Uses a WIDE maxLag so the true lag is visible (not clipped at 640).
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-drift-slope.ts
 */
import { renderSunTronicNative } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';

const SONGS = ['ballblaser.src', 'analgestic2.src'];
const SECONDS = 8;
const SR = 44100;
const WIN = 4096;
const HOP = SR / 4; // 4 windows/sec
const MAXLAG = 8000;
const VOICES = [0, 3];

function rms(a: Float32Array, off: number, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[off + i] * a[off + i];
  return Math.sqrt(s / n);
}

/** best lag (samples) of native window vs oracle, argmax of normalized xcorr */
function bestLag(a: Float32Array, b: Float32Array, off: number): { lag: number; corr: number } {
  let best = -2, bestLag = 0;
  for (let lag = -MAXLAG; lag <= MAXLAG; lag++) {
    let sab = 0, sa = 0, sb = 0;
    for (let i = 0; i < WIN; i++) {
      const av = a[off + i] ?? 0;
      const bv = b[off + i + lag] ?? 0;
      sab += av * bv; sa += av * av; sb += bv * bv;
    }
    const d = Math.sqrt(sa * sb);
    if (d > 0) { const c = sab / d; if (c > best) { best = c; bestLag = lag; } }
  }
  return { lag: bestLag, corr: best };
}

async function main(): Promise<void> {
  for (const name of SONGS) {
    const native = renderSunTronicNative(name, { seconds: SECONDS });
    const oracle = await renderUADEPerVoice(name, { seconds: SECONDS });
    console.log(`\n=== ${name} — lag(t) trajectory (maxLag ${MAXLAG}, win ${WIN}) ===`);
    for (const v of VOICES) {
      const nv = native.ch[v], ov = oracle.ch[v];
      if (!nv || !ov) { console.log(`  v${v}: absent`); continue; }
      const pts: { t: number; lag: number; corr: number }[] = [];
      for (let off = MAXLAG; off + WIN + MAXLAG < Math.min(nv.length, ov.length); off += HOP) {
        if (rms(nv, off, WIN) < 0.003 || rms(ov, off, WIN) < 0.003) continue;
        const { lag, corr } = bestLag(nv, ov, off);
        pts.push({ t: off / SR, lag, corr });
      }
      if (pts.length < 2) { console.log(`  v${v}: too few active windows`); continue; }
      // linear regression lag = a + b*t (b = drift slope in samples/sec)
      const n = pts.length;
      const st = pts.reduce((s, p) => s + p.t, 0);
      const sl = pts.reduce((s, p) => s + p.lag, 0);
      const stt = pts.reduce((s, p) => s + p.t * p.t, 0);
      const stl = pts.reduce((s, p) => s + p.t * p.lag, 0);
      const slope = (n * stl - st * sl) / (n * stt - st * st);
      const intercept = (sl - slope * st) / n;
      // R^2 of the linear fit -> how "constant slope" it is
      const meanL = sl / n;
      let ssRes = 0, ssTot = 0;
      for (const p of pts) {
        const pred = intercept + slope * p.t;
        ssRes += (p.lag - pred) ** 2;
        ssTot += (p.lag - meanL) ** 2;
      }
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
      const meanCorr = pts.reduce((s, p) => s + p.corr, 0) / n;
      const traj = pts.map((p) => `${p.t.toFixed(1)}s:${p.lag >= 0 ? '+' : ''}${p.lag}`).join(' ');
      console.log(`  v${v}: slope=${slope.toFixed(1)} samp/s  R²=${r2.toFixed(3)}  meanCorr=${meanCorr.toFixed(2)}`);
      console.log(`       lag: ${traj}`);
      const verdict = r2 > 0.9
        ? `LINEAR -> constant clock-ratio (slope ${slope.toFixed(1)} samp/s = ${(slope / SR * 1e6).toFixed(1)} ppm). Cheap constant fix.`
        : `NON-LINEAR (R²=${r2.toFixed(2)}) -> per-period phase carry; needs cycle-accurate Paula-DMA.`;
      console.log(`       ${verdict}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
