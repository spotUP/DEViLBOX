/**
 * pitch-diff.ts — per-voice dominant pitch over time, native vs UADE oracle.
 * voice-compare.ts shows envelope/RMS match but is blind to pitch; the "flat and
 * plays the same notes" symptom is a period defect on one voice. This tracks the
 * dominant frequency per short window on each of the 4 voices for both renders and
 * prints where native pitch diverges (constant vs varying, or offset low = "flat").
 *   SONG=ready SECS=20 TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/pitch-diff.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, INSTR_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../../src/engine/suntronic/SunTronicNativeRender';
import { renderUADEPerVoice } from './audio-oracle';

// Autocorrelation pitch estimate for one window; returns Hz or 0 if unvoiced.
function pitchHz(x: Float32Array, off: number, win: number, sr: number): number {
  let energy = 0;
  for (let i = 0; i < win; i++) energy += x[off + i] * x[off + i];
  if (energy < 1e-6) return 0;
  const minLag = Math.floor(sr / 2000); // up to 2000 Hz
  const maxLag = Math.floor(sr / 50);   // down to 50 Hz
  let bestLag = 0, best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < win; i++) s += x[off + i] * x[off + i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  if (bestLag === 0 || best < energy * 0.3) return 0;
  return sr / bestLag;
}

function semis(a: number, b: number): number {
  if (a <= 0 || b <= 0) return NaN;
  return 12 * Math.log2(a / b);
}

async function main() {
  const name = process.env.SONG ?? 'ready';
  const seconds = Number(process.env.SECS ?? 20);
  const oracle = await renderUADEPerVoice(name, { seconds });
  const osr = oracle.sampleRate;
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const slotPcm = (score.instrumentNames as string[]).map((n) => {
    const p = join(INSTR_DIR, n); return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
  });
  const m = renderSunTronicMix(score, slotPcm, { seconds });
  const nsr = m.sampleRate ?? 44100;
  const step = 0.25; // seconds per window

  for (let v = 0; v < 4; v++) {
    const o = oracle.ch[v], n = m.ch[v];
    const owin = Math.floor(osr * step), nwin = Math.floor(nsr * step);
    const oPitch: number[] = [], nPitch: number[] = [];
    for (let t = 0; (t + step) * osr < o.length; t++) oPitch.push(pitchHz(o, Math.floor(t * step * osr), owin, osr));
    for (let t = 0; (t + step) * nsr < n.length; t++) nPitch.push(pitchHz(n, Math.floor(t * step * nsr), nwin, nsr));
    // unique voiced pitches (rounded) as a "how many distinct notes" proxy
    const distinct = (arr: number[]) => new Set(arr.filter((p) => p > 0).map((p) => Math.round(p))).size;
    // mean semitone offset native vs oracle over co-voiced windows
    const K = Math.min(oPitch.length, nPitch.length);
    let sumSemi = 0, cnt = 0, maxSemi = 0;
    for (let i = 0; i < K; i++) {
      const s = semis(nPitch[i], oPitch[i]);
      if (!Number.isNaN(s)) { sumSemi += s; cnt++; if (Math.abs(s) > Math.abs(maxSemi)) maxSemi = s; }
    }
    const meanSemi = cnt ? sumSemi / cnt : NaN;
    console.log(
      `voice ${v}: oracle distinctPitch=${distinct(oPitch)} native distinctPitch=${distinct(nPitch)} | ` +
      `meanΔ=${meanSemi.toFixed(2)}st maxΔ=${maxSemi.toFixed(2)}st (n=${cnt})`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
