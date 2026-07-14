/** probe-vib-lockstep.ts — read UADE voice0 $24(vibPhase)/$26(vibIndex)/$20(period) per
 * 1024-audio-tick and print alongside the native player's, to locate exactly where the
 * vibrato phase diverges (period differs by ±2-3 with identical pitch acc → it's $24).
 * NOT committed. */
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, TICK = 1024, N = 30;

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
  const L = mod._malloc(TICK * 4), R = mod._malloc(TICK * 4), cap = mod._malloc(72), rd = mod._malloc(8);
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
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  mod._uade_wasm_stop(); load();
  const uade: { p: number; vib: number; vi: number }[] = [];
  for (let t = 0; t < N; t++) { mod._uade_wasm_render(L, R, TICK); uade.push({ p: rW(base0 + 0x20), vib: rW(base0 + 0x24), vi: rW(base0 + 0x26) }); }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0 });
  console.log(`\n${name} — UADE(golden -1 offset) vs native  [tick: p/vib/vi]`);
  for (let t = 0; t < N; t++) {
    const nv = player.tick().voices[0]; const dv = player.debugVoice(0);
    const g = uade[t + 1]; if (!g) break; // native tick t == UADE tick t+1
    const mark = (g.p !== nv.period) ? ' <<' : '';
    console.log(`  t${String(t).padStart(2)} U{p${g.p} vib${(g.vib & 0xffff).toString(16)} vi${g.vi}}  N{p${nv.period} vib${dv.vibPhase.toString(16)} vi${dv.vibIndex}}${mark}`);
  }
}
(async () => { await run('gliders.src'); })().catch(e => { console.error(e); process.exit(1); });
