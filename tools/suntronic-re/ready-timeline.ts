/**
 * ready-timeline.ts — per-window best-lag correlation over time for one voice,
 * to see if the mismatch is constant (kernel/instrument wrong from t0) or
 * accumulates (drift). Prints one row per ~0.25s window with local best-lag corr
 * at a generous 4000-sample search (so intra-window phase is removed).
 */
import { renderSunTronicNative } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';

function windowBestLag(a: Float32Array, b: Float32Array, off: number, win: number, maxLag: number) {
  let best = -2, bestLag = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sab = 0, sa = 0, sb = 0;
    for (let i = 0; i < win; i++) { const av = a[off + i] ?? 0; const bv = b[off + i + lag] ?? 0; sab += av * bv; sa += av * av; sb += bv * bv; }
    const d = Math.sqrt(sa * sb);
    if (d > 0) { const c = sab / d; if (c > best) { best = c; bestLag = lag; } }
  }
  return { best, bestLag };
}

async function main(): Promise<void> {
  const name = process.env.SONG ?? 'ready';
  const seconds = Number(process.env.SECONDS ?? 12);
  const v = Number(process.env.VOICE ?? 2);
  const native = renderSunTronicNative(name, { seconds });
  const oracle = await renderUADEPerVoice(name, { seconds });
  const nv = native.ch[v], ov = oracle.ch[v];
  const win = 2048, hop = 11025, maxLag = 4000;
  const n = Math.min(nv.length, ov.length);
  console.log(`\n=== ${name} voice ${v} timeline (win=${win} maxLag=${maxLag}) ===`);
  for (let off = maxLag; off + win + maxLag < n; off += hop) {
    let eo = 0, en = 0;
    for (let i = 0; i < win; i++) { eo += ov[off + i] ** 2; en += nv[off + i] ** 2; }
    const ro = Math.sqrt(eo / win), rn = Math.sqrt(en / win);
    if (ro < 0.003 && rn < 0.003) { console.log(`  t=${(off / 44100).toFixed(2)}s  SILENT`); continue; }
    const { best, bestLag } = windowBestLag(nv, ov, off, win, maxLag);
    console.log(`  t=${(off / 44100).toFixed(2)}s  corr=${best.toFixed(3)} lag=${bestLag}  nRMS=${rn.toFixed(3)} oRMS=${ro.toFixed(3)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
