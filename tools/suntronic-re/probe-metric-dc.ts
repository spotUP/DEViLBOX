/**
 * probe-metric-dc.ts — is the SunTronic synth-voice "fidelity gap" a real drift or
 * a metric/DC artifact?
 *
 * voiceFidelity's windowBestLag does a RAW cross-correlation — it does NOT subtract
 * the window mean. Native synth buffers can carry a DC bias (the CALCn feedback
 * integrators drift off zero); real Paula output is DC-free (the Amiga output stage
 * removes it). A pure DC offset on an otherwise byte-correct AC waveform caps raw
 * xcorr well below 1. This re-scores the SHIPPED render with a MEAN-SUBTRACTED
 * (Pearson) best-lag correlation and reports the per-voice DC, to decide whether the
 * residual is genuine phase drift (needs the Paula-DMA port) or a benign DC bias the
 * metric punishes (needs render centering / nothing).
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-metric-dc.ts [song ...]
 */
import { renderSunTronicNative, voiceFidelity } from './native-mix';
import { renderUADEPerVoice, peak } from './audio-oracle';

const SR = 44100;

function mean(a: Float32Array, off: number, n: number): number {
  let s = 0; for (let i = 0; i < n; i++) s += a[off + i]; return s / n;
}

/** mean-subtracted (Pearson) best-lag correlation, windowed median. */
function fidPearson(native: Float32Array, oracle: Float32Array, maxLag = 640): number {
  const win = 4096, hop = 11025;
  const corrs: number[] = [];
  const n = Math.min(native.length, oracle.length);
  for (let off = maxLag; off + win + maxLag < n; off += hop) {
    let eo = 0, en = 0;
    for (let i = 0; i < win; i++) { eo += oracle[off + i] ** 2; en += native[off + i] ** 2; }
    if (Math.sqrt(eo / win) < 0.003 || Math.sqrt(en / win) < 0.003) continue;
    const ma = mean(native, off, win);
    let best = -2;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      const mb = mean(oracle, off + lag, win);
      let sab = 0, sa = 0, sb = 0;
      for (let i = 0; i < win; i++) {
        const av = (native[off + i] ?? 0) - ma;
        const bv = (oracle[off + i + lag] ?? 0) - mb;
        sab += av * bv; sa += av * av; sb += bv * bv;
      }
      const d = Math.sqrt(sa * sb);
      if (d > 0) { const c = sab / d; if (c > best) best = c; }
    }
    corrs.push(best);
  }
  if (!corrs.length) return NaN;
  corrs.sort((x, y) => x - y);
  return corrs[corrs.length >> 1];
}

function dc(a: Float32Array): number {
  let s = 0, e = 0; for (const x of a) { s += x; e += x * x; }
  const m = s / a.length, rms = Math.sqrt(e / a.length);
  return rms > 0 ? m / rms : 0; // DC as fraction of RMS
}

async function main(): Promise<void> {
  const songs = process.argv.slice(2);
  if (!songs.length) songs.push('ballblaser.src', 'analgestic2.src', 'gliders.src');
  for (const name of songs) {
    console.log(`\n=== ${name} — raw vs Pearson fidelity (maxLag 640) + per-voice DC ===`);
    const native = renderSunTronicNative(name, { seconds: 8 });
    const oracle = await renderUADEPerVoice(name, { seconds: 8 });
    for (let v = 0; v < 4; v++) {
      const inf = native.info[v];
      if (inf.dominantOff < 0 || peak(oracle.ch[v]) < 0.01 || peak(native.ch[v]) < 0.01) continue;
      const raw = voiceFidelity(native.ch[v], oracle.ch[v], { maxLag: 640 }).median;
      const pear = fidPearson(native.ch[v], oracle.ch[v]);
      const nDc = dc(native.ch[v]), oDc = dc(oracle.ch[v]);
      const tag = `off${inf.dominantOff} type${inf.synthType}`;
      console.log(`  v${v} [${tag}]: raw=${raw.toFixed(2)} pearson=${pear.toFixed(2)}  DC native=${nDc.toFixed(2)} oracle=${oDc.toFixed(2)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
