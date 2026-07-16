/**
 * probe-weak-triage.ts — Gate E, corpus-wide breakage triage.
 *
 * The corpus fidelity probe showed 103/125 songs < 0.70 with many near-zero /
 * negative / SILENT voices. That is inconsistent with "sub-audible phase drift"
 * (which best-lag xcorr recovers). This probe discriminates, per weak song +
 * voice, between:
 *   - CONTENT WRONG: native produces audio but it does not match the oracle even
 *     at WIDE maxLag (24000). Wrong timbre / wrong notes / wrong instrument.
 *   - DRIFT>640:     narrow-lag low but wide-lag high -> real phase, recoverable.
 *   - SILENT:        native peak ~0 while oracle has energy -> unresolved wave.
 *   - IDLE-BOTH:     both near-silent -> benign (metric noise, not breakage).
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-weak-triage.ts
 */
import { renderSunTronicNative } from './native-mix';
import { renderUADEPerVoice, peak } from './audio-oracle';

const SONGS = ['ok-2.src', 'suntronic-30.src', 'techno.src', 'suntronic-9.src', 'tank-special.src', 'strange.src'];
const SECONDS = 6;
const SR = 44100;
const WIN = 4096;

function rms(a: Float32Array): number { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); }

/** median windowed best-lag at a given maxLag */
function fid(a: Float32Array, b: Float32Array, maxLag: number): number {
  const hop = SR / 2;
  const corrs: number[] = [];
  const n = Math.min(a.length, b.length);
  for (let off = maxLag; off + WIN + maxLag < n; off += hop) {
    let ea = 0, eb = 0;
    for (let i = 0; i < WIN; i++) { ea += a[off + i] * a[off + i]; eb += b[off + i] * b[off + i]; }
    if (Math.sqrt(ea / WIN) < 0.003 || Math.sqrt(eb / WIN) < 0.003) continue;
    let best = -2;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      let sab = 0, sa = 0, sb = 0;
      for (let i = 0; i < WIN; i++) { const av = a[off + i] ?? 0; const bv = b[off + i + lag] ?? 0; sab += av * bv; sa += av * av; sb += bv * bv; }
      const d = Math.sqrt(sa * sb); if (d > 0) { const c = sab / d; if (c > best) best = c; }
    }
    corrs.push(best);
  }
  if (!corrs.length) return NaN;
  corrs.sort((x, y) => x - y);
  return corrs[corrs.length >> 1];
}

async function main(): Promise<void> {
  for (const name of SONGS) {
    console.log(`\n=== ${name} ===`);
    let native, oracle;
    try {
      native = renderSunTronicNative(name, { seconds: SECONDS });
      oracle = await renderUADEPerVoice(name, { seconds: SECONDS });
    } catch (e) { console.log(`  ERROR: ${(e as Error).message}`); continue; }
    for (let v = 0; v < 4; v++) {
      const nv = native.ch[v], ov = oracle.ch[v];
      const np = peak(nv), op = peak(ov);
      const inf = native.info[v];
      const tag = inf.dominantOff <= -2 ? `SAMPLED` : inf.dominantOff < 0 ? 'idle' : `synth${inf.synthType}`;
      if (op < 0.01 && np < 0.01) { console.log(`  v${v} [${tag}]: IDLE-BOTH (nPk=${np.toFixed(3)} oPk=${op.toFixed(3)})`); continue; }
      if (np < 0.01) { console.log(`  v${v} [${tag}]: NATIVE-SILENT (oPk=${op.toFixed(3)}) <-- wave unresolved`); continue; }
      if (op < 0.01) { console.log(`  v${v} [${tag}]: ORACLE-SILENT (nPk=${np.toFixed(3)}) <-- native spurious`); continue; }
      const f640 = fid(nv, ov, 640);
      const fWide = fid(nv, ov, 24000);
      const verdict = Number.isNaN(fWide) ? '??' : fWide >= 0.85 ? `DRIFT>640 (recoverable)` : fWide >= 0.5 ? `PARTIAL content` : `CONTENT WRONG`;
      console.log(`  v${v} [${tag}]: f640=${(f640 || NaN).toFixed(2)} fWide=${(fWide || NaN).toFixed(2)} nPk=${np.toFixed(2)} oPk=${op.toFixed(2)} -> ${verdict}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
