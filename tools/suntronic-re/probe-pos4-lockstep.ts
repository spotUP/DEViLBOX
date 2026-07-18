/**
 * probe-pos4-lockstep.ts — RIGOROUS per-tick native-vs-UADE lockstep on BOTH
 * lanes (PER reg3, VOL reg4 — latched at PER writes, native = paulaAudxVol),
 * across the full song incl. the 2nd loop. Prints a per-tick match flag and a
 * rolling mismatch count so a "effects missing" cluster (VOL or PER going flat
 * vs UADE) shows up as a mismatch SPIKE at a specific tick range.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-pos4-lockstep.ts [song] [ticks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const REG_PER = 3, REG_VOL = 4;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'ready';
  const ticks = parseInt(process.argv[3] ?? '3000', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));

  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(1); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  mod._uade_wasm_enable_paula_log(1);
  // Per tick: last PER write per voice, and VOL latched at each PER write.
  const uPer: (number | null)[][] = [[], [], [], []];
  const uVol: (number | null)[][] = [[], [], [], []];
  const curV = [-1, -1, -1, -1];
  for (let c = 0; c < ticks; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512);
    const h = new Uint32Array(mod.HEAPU8.buffer); const base = lg >> 2;
    const lastP: (number | null)[] = [null, null, null, null];
    const lastV: (number | null)[] = [null, null, null, null];
    for (let i = 0; i < n; i++) {
      const packed = h[base + i * 3];
      const ch = (packed >>> 24) & 0xff, reg = (packed >>> 16) & 0xff, val = packed & 0xffff;
      if (ch > 3) continue;
      if (reg === REG_VOL) curV[ch] = val;
      else if (reg === REG_PER) { lastP[ch] = val; lastV[ch] = curV[ch]; }
    }
    for (let v = 0; v < 4; v++) { uPer[v].push(lastP[v]); uVol[v].push(lastV[v]); }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);
  // native full-length per-voice PER + VOL
  const nP: number[][] = [[], [], [], []], nV: number[][] = [[], [], [], []];
  for (let c = 0; c < ticks; c++) {
    const snap = player.stepVblankOnce();
    for (let v = 0; v < 4; v++) {
      nP[v].push(snap.voices[v].period);
      nV[v].push(paulaAudxVol(snap.voices[v].outVolume & 0xff));
    }
  }
  // Fill UADE holds forward (last-written PER/VOL persists between writes).
  const uPh: number[][] = [[], [], [], []], uVh: number[][] = [[], [], [], []];
  for (let v = 0; v < 4; v++) {
    let hp = -1, hv = -1;
    for (let c = 0; c < ticks; c++) {
      if (uPer[v][c] != null) hp = uPer[v][c]!;
      if (uVol[v][c] != null) hv = uVol[v][c]!;
      uPh[v].push(hp); uVh[v].push(hv);
    }
  }
  // Per 80-tick bin: best tick-shift s in [-SH,SH] maximizing VOL matches;
  // report residual PER-bad (|Δ|>8) and VOL-bad AFTER that alignment. Aligned
  // residual factors out accumulated phase drift → a surviving spike = real
  // decode divergence, not timing wobble.
  const SH = 16, BIN = 80;
  const bins = Math.ceil(ticks / BIN);
  console.log('bin | startTick | shift | PERbad/320 | VOLbad/320   (aligned residual)');
  for (let b = 0; b < bins; b++) {
    const a0 = b * BIN, a1 = Math.min(ticks, a0 + BIN);
    // pick global shift for the bin that maximizes total VOL matches across voices
    let bestS = 0, bestM = -1;
    for (let s = -SH; s <= SH; s++) {
      let m = 0;
      for (let v = 0; v < 4; v++) for (let c = a0; c < a1; c++) {
        const ui = c + s; if (ui < 0 || ui >= ticks) continue;
        if (uVh[v][ui] >= 0 && nV[v][c] === uVh[v][ui]) m++;
      }
      if (m > bestM) { bestM = m; bestS = s; }
    }
    let pb = 0, vb = 0;
    for (let v = 0; v < 4; v++) for (let c = a0; c < a1; c++) {
      const ui = c + bestS; if (ui < 0 || ui >= ticks) continue;
      if (uPh[v][ui] >= 0 && Math.abs(nP[v][c] - uPh[v][ui]) > 8) pb++;
      if (uVh[v][ui] >= 0 && nV[v][c] !== uVh[v][ui]) vb++;
    }
    const flag = (pb > 60 || vb > 40) ? '  <== RESIDUAL SPIKE' : '';
    console.log(`${String(b).padStart(3)} | ${String(a0).padStart(8)} | ${String(bestS).padStart(5)} | ${String(pb).padStart(6)}     | ${String(vb).padStart(6)}${flag}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
