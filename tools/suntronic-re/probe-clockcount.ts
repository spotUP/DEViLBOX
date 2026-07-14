/** probe-clockcount.ts — DECISIVE two-clock test. Count EFFECTS calls (voice0 $15
 * outVolume byte-write @0x26834, once per EFFECTS/vblank) vs note-handler fires over a
 * fixed sample span at FINE=1 (each write isolated → capture-latch misses nothing).
 * If EFFECTS count > note count, EFFECTS/vibrato runs on a FASTER clock (882 vblank)
 * than the note fetch (~1024 CIA) → the +16000 vib jumps are a real extra advance,
 * not an alias. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, SPAN = 22050; // 0.5s @44100

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
  const L = mod._malloc(4), R = mod._malloc(4), cap = mod._malloc(18 * 4);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // find base0 via note-handler write PC (busiest writer in SCAN range)
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let notePc = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; notePc = pc; }
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(notePc, (notePc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  // FINE=1 pass A: count $15 writes (EFFECTS/vblank) + their PCs + gaps
  const countField = (off: number, span: number): { fires: number[]; pcs: Map<number, number> } => {
    mod._uade_wasm_stop(); load();
    const fires: number[] = []; const pcs = new Map<number, number>();
    for (let s = 0; s < span; s++) {
      mod._uade_wasm_arm_capture((base0 + off) >>> 0, 1); mod._uade_wasm_arm_capture_pc(0, 0);
      if (mod._uade_wasm_render(L, R, 1) <= 0) break;
      if (mod._uade_wasm_get_capture(cap)) { fires.push(s); pcs.set(capU32(16), (pcs.get(capU32(16)) ?? 0) + 1); }
    }
    return { fires, pcs };
  };
  const eff = countField(0x15, SPAN);   // outVolume: written once per EFFECTS
  const vib = countField(0x24, SPAN);   // vibPhase:  += const once per EFFECTS
  const g15: number[] = []; for (let i = 1; i < Math.min(eff.fires.length, 16); i++) g15.push(eff.fires[i] - eff.fires[i - 1]);
  const g24: number[] = []; for (let i = 1; i < Math.min(vib.fires.length, 16); i++) g24.push(vib.fires[i] - vib.fires[i - 1]);
  const pcStr = (m: Map<number, number>): string => [...m.entries()].map(([p, n]) => `${p.toString(16)}×${n}`).join(',');
  console.log(`\n${name} base0=${base0.toString(16)} notePc=${notePc.toString(16)} span=${SPAN}samp`);
  console.log(`  $15 EFFECTS: fires=${eff.fires.length} rate=${(eff.fires.length / SPAN * 44100).toFixed(1)}Hz period≈${(SPAN / eff.fires.length).toFixed(0)} PCs=${pcStr(eff.pcs)}`);
  console.log(`    gaps=${g15.join(',')}`);
  console.log(`  $24 vibPha: fires=${vib.fires.length} rate=${(vib.fires.length / SPAN * 44100).toFixed(1)}Hz period≈${(SPAN / vib.fires.length).toFixed(0)} PCs=${pcStr(vib.pcs)}`);
  console.log(`    gaps=${g24.join(',')}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch((e) => { console.error(e); process.exit(1); });
