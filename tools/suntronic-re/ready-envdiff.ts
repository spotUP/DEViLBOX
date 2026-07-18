/**
 * ready-envdiff.ts — per-voice amplitude-envelope diff, native vs UADE oracle.
 * Finds the voice/instrument whose note tails DON'T decay under the current
 * retrigger reset (native RMS stays flat where the oracle decays away).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../../src/engine/suntronic/SunTronicNativeRender';
import { renderUADEPerVoice } from './audio-oracle';

function envelope(x: Float32Array, sr: number, winMs: number, hopMs: number): number[] {
  const win = Math.max(1, Math.floor((sr * winMs) / 1000));
  const hop = Math.max(1, Math.floor((sr * hopMs) / 1000));
  const out: number[] = [];
  for (let i = 0; i + win <= x.length; i += hop) {
    let s = 0;
    for (let k = 0; k < win; k++) s += x[i + k] * x[i + k];
    out.push(Math.sqrt(s / win));
  }
  return out;
}
// resample an envelope series to a common length (nearest)
function toLen(e: number[], n: number): number[] {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = e[Math.min(e.length - 1, Math.floor((i * e.length) / n))];
  return out;
}
async function main() {
  const name = process.env.SONG ?? 'ready';
  const seconds = Number(process.env.SECS ?? 14);
  const oracle = await renderUADEPerVoice(name, { seconds });
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const slotPcm = score.instrumentNames.map((n: string) => {
    const p = join(INSTR_DIR, n); return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
  });
  const m = renderSunTronicMix(score, slotPcm, { seconds });
  const osr = oracle.sampleRate, nsr = m.sampleRate ?? 44100;
  const COLS = 56; // ~0.25s per col over 14s
  for (let v = 0; v < 4; v++) {
    const oe = toLen(envelope(oracle.ch[v], osr, 20, 20), COLS);
    const ne = toLen(envelope(m.ch[v], nsr, 20, 20), COLS);
    const omax = Math.max(1e-9, ...oe), nmax = Math.max(1e-9, ...ne);
    console.log(`\n== voice ${v} ==  oraclePeak=${omax.toFixed(3)} nativePeak=${nmax.toFixed(3)}`);
    const bar = (val: number, mx: number) => {
      const h = Math.round((val / mx) * 8);
      return ' .:-=+*#@'[Math.max(0, Math.min(8, h))];
    };
    console.log('  O ' + oe.map((x) => bar(x, omax)).join(''));
    console.log('  N ' + ne.map((x) => bar(x, nmax)).join(''));
    // flag columns where native is high but oracle has decayed (>0.5 native, <0.2 oracle)
    const flat: number[] = [];
    for (let c = 0; c < COLS; c++) if (ne[c] / nmax > 0.5 && oe[c] / omax < 0.2) flat.push(c);
    if (flat.length) console.log(`  !! native-sustains-where-oracle-decayed cols: ${flat.join(',')} (col≈${(seconds / COLS).toFixed(2)}s each)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
