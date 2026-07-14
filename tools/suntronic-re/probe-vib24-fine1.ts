/** probe-vib24-fine1.ts — gate on $24 (advanced UNCONDITIONALLY every EFFECTS, unlike $15
 * which $37==1 skips) at FINE=1. Dump vibPhase value + delta per tick. If uniform +8000,
 * the +16000 seen when gating $15 was a gate artifact and native (const +8000/tick) is
 * correct. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000;
async function run(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => { const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load'); mod._free(ptr); mod._free(hp); };
  const L = mod._malloc(4), R = mod._malloc(4), cap = mod._malloc(18 * 4), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) { mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break; if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1); }
  let pc = 0, best = -1; for (const [p, n] of hist) if (n > best) { best = n; pc = p; }
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) { mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break; if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; } }
  const s16 = (w: number): number => (w << 16) >> 16;
  const readW = (addr: number): number => { mod._uade_wasm_read_memory(addr >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  mod._uade_wasm_stop(); load();
  const vals: number[] = []; const pcs = new Map<number, number>();
  for (let s = 0; s < 44100 && vals.length < 20; s++) {
    mod._uade_wasm_arm_capture((base0 + 0x24) >>> 0, 2); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { vals.push(s16(readW(base0 + 0x24))); pcs.set(capU32(16), (pcs.get(capU32(16)) ?? 0) + 1); }
  }
  const d: number[] = []; for (let i = 1; i < vals.length; i++) d.push(vals[i] - vals[i - 1]);
  console.log(`${name} base0=${base0.toString(16)} $24 FINE=1 writes:`);
  console.log('  vals  :', vals.join(','));
  console.log('  deltas:', d.join(','));
  console.log('  PCs   :', [...pcs.entries()].map(([p, n]) => `${p.toString(16)}×${n}`).join(','));
  try { mod._uade_wasm_cleanup(); } catch {}
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch((e) => { console.error(e); process.exit(1); });
