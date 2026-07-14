/** probe-pc-oracle.ts — THE exact music-tick oracle. The music timer runs at 50Hz
 * vblank (882 samples), NOT the 1024-sample audio-block rate the $15/$24 writes flush
 * at. So sample-stepped oracles mis-align. Instead gate on the tempo-handler ENTRY PC
 * 0x26606 (fires exactly once per music-tick). Snapshot all 4 voices at each hit; the
 * snapshot at hit N reflects the COMPLETED state of tick N-1 (entry is before this
 * tick's updates), so compare native tick i to gold[i+1]. Zero sample-quantization,
 * zero phase sweep. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba, TICKS = 40, TICK_PC = 0x2660e;
const PAULA_PER = [0xdff0a6, 0xdff0b6, 0xdff0c6, 0xdff0d6];
type Snap = { period: number; paula: number; vol: number; flags: number };
async function run(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(p, data.byteLength, h) !== 0) throw new Error('load');
    mod._free(p); mod._free(h);
  };
  const L = mod._malloc(4), R = mod._malloc(4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let wpc = 0, wbest = -1; for (const [p, n] of hist) if (n > wbest) { wbest = n; wpc = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(wpc, (wpc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rB = (a: number, n: number): number[] => { mod._uade_wasm_read_memory(a >>> 0, rd, n); const b: number[] = []; for (let i = 0; i < n; i++) b.push(mod.HEAPU8[rd + i]); return b; };
  const rW = (a: number): number => { const b = rB(a, 2); return (b[0] << 8) | b[1]; };
  const snapV = (vi: number): Snap => { const b = base0 + vi * STRIDE; return { period: rW(b + 0x20), paula: rW(PAULA_PER[vi]), vol: rB(b + 0x0c, 1)[0], flags: rB(b + 0x14, 1)[0] }; };
  mod._uade_wasm_stop(); load();
  const gold: Snap[][] = [];
  for (let s = 0; s < 120000 && gold.length < TICKS + 2; s++) {
    mod._uade_wasm_arm_capture_pc(TICK_PC, (TICK_PC + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) gold.push([0, 1, 2, 3].map(snapV));
  }
  const score = parseSunTronicV13Score(data); const player = new SunTronicPlayer(score, { subsong: 0 });
  // align: try gold-shift 0..2 (entry is pre-update, so native tick i ~ gold[i+1])
  let bestShift = 1, bestMis = 1e9, bestFirst = '';
  for (const shift of [0, 1, 2]) {
    const p2 = new SunTronicPlayer(parseSunTronicV13Score(data), { subsong: 0 });
    let mis = 0, first = '';
    for (let i = 0; i < TICKS; i++) {
      const mv = p2.tick().voices; const gv = gold[i + shift]; if (!gv) break;
      for (let v = 0; v < 4; v++) {
        const g = gv[v], m = mv[v];
        if (g.paula !== m.period) { mis++; if (!first) first = `t${i} v${v} G{paula${g.paula} $20:${g.period}} N{p${m.period}}`; }
      }
    }
    if (mis < bestMis) { bestMis = mis; bestShift = shift; bestFirst = first; }
  }
  console.log(`\n${name} base0=${base0.toString(16)} PC-ORACLE(0x26606): shift=${bestShift} → ${bestMis}/${TICKS * 4} mismatches`);
  console.log(`  first mismatch: ${bestFirst || '(none — byte-exact!)'}`);
  // detailed period dump at best shift
  const p3 = new SunTronicPlayer(parseSunTronicV13Score(data), { subsong: 0 });
  for (let i = 0; i < Math.min(TICKS, 16); i++) {
    const mv = p3.tick().voices; const gv = gold[i + bestShift]; if (!gv) break;
    console.log(`  t${String(i).padStart(2)} ` + [0, 1, 2, 3].map(v => {
      const g = gv[v], m = mv[v]; const bad = (g.paula !== m.period);
      return `v${v}${bad ? '!' : ' '}${g.paula}/${m.period}`;
    }).join(' '));
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  void player;
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch(e => { console.error(e); process.exit(1); });
