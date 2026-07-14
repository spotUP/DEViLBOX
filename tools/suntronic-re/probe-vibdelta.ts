/** probe-vibdelta.ts — watch voice0 $24 (vibPhase) WORD writes in fine chunks; read the
 * value at each fire and print the per-write delta. Decides if vibrato really advances
 * +16000 (two adds) on some ticks (true two-rate) or always +freqEnvSpeed (golden under-
 * sampled). Also counts $24 writes vs $08 (acc) writes over the same span. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, CHUNK = 32;

async function run(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
    mod._free(ptr); mod._free(hp);
  };
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 200; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 80; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, (pcLo + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const s16 = (w: number): number => (w << 16) >> 16;
  const readW = (addr: number): number => { mod._uade_wasm_read_memory(addr >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  // watch $24 write at very fine resolution; record position + value at each fire + writing PC.
  const FINE = 4;
  mod._uade_wasm_stop(); load();
  const fires: { pos: number; val: number; pc: number }[] = []; let pos = 0; const NCHUNK = Math.ceil(882 * 22 / FINE);
  for (let c = 0; c < NCHUNK; c++) {
    mod._uade_wasm_arm_capture((base0 + 0x24) >>> 0, 2); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, FINE) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) fires.push({ pos, val: s16(readW(base0 + 0x24)), pc: capU32(16) });
    pos += FINE;
  }
  const gaps: number[] = []; for (let i = 1; i < fires.length; i++) gaps.push(fires[i].pos - fires[i - 1].pos);
  const pcSet = new Map<number, number>(); for (const f of fires) pcSet.set(f.pc, (pcSet.get(f.pc) ?? 0) + 1);
  console.log(`${name} base0=${base0.toString(16)}: $24 writes=${fires.length} over ${pos} samp (period≈${(pos / fires.length).toFixed(0)})`);
  console.log('  gaps :', gaps.slice(0, 30).join(','));
  console.log('  vals :', fires.slice(0, 26).map((f) => f.val).join(','));
  console.log('  PCs  :', [...pcSet.entries()].map(([p, n]) => `${p.toString(16)}×${n}`).join(' '));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); })().catch((e) => { console.error(e); process.exit(1); });
