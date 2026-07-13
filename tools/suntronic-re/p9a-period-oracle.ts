/**
 * p9a-period-oracle.ts — Gate 2 period-timeline oracle. Reads each voice's Paula
 * period ($20), freq accumulator ($8), volume ($C) and flags ($14) directly from
 * the LOADED voice records after every 882-frame render tick (1 PAL vblank = 1
 * replayer tick). Sidesteps the first-hit-per-chunk capture limit: only ONE PC
 * capture is needed (voice[0] base), then plain memory reads per tick.
 *
 * Loaded layout (disasm of gliders.src, 0x2680c EFFECTS): voice stride = 0x1ba;
 * period store `move.w d3,$20(a0)` @0x26896; A0 = voice record throughout EFFECTS.
 * Voice[0] base = MIN A0 seen at 0x26810 across ticks (voices are contiguous
 * ascending; inactive voice0 could otherwise be skipped by the BMI EFF5 guard).
 *
 * Usage: npx tsx tools/suntronic-re/p9a-period-oracle.ts [module.src] [ticks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const STRIDE = 0x1ba;
const PC_LO = 0x2660e, PC_HI = 0x26610; // tick voice-loop start, D7=3 → A0 = voice[0]
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const ticks = parseInt(process.argv[3] ?? '48', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);

  // Pass 1: find voice[0] base = min A0 at EFFECTS across the run.
  let base0 = 0xffffffff;
  for (let c = 0; c < ticks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const a0 = new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + 8] >>> 0;
    if (a0 < base0) base0 = a0;
  }
  if (base0 === 0xffffffff) { console.log('[p9a] no EFFECTS capture — wrong PC/module'); return; }
  const bases = [0, 1, 2, 3].map((k) => (base0 + k * STRIDE) >>> 0);
  console.log(`[p9a] ${name} voice[0]=${hx(base0)} stride=${hx(STRIDE)} bases=${bases.map(hx).join(',')}`);

  // Pass 2: reload, read period/acc/vol/flags per voice per tick.
  mod._uade_wasm_stop();
  const ptr2 = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr2);
  const hp2 = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp2, name.length * 4 + 1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr2, data.byteLength, hp2) !== 0) throw new Error('reload');
  mod._free(ptr2); mod._free(hp2);
  const rdW = (addr: number, len: number): number[] => {
    mod._uade_wasm_read_memory(addr >>> 0, rd, len);
    const b: number[] = []; for (let i = 0; i < len; i++) b.push(mod.HEAPU8[rd + i]); return b;
  };
  for (let c = 0; c < ticks; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const cols = bases.map((b) => {
      const period = (rdW(b + 0x20, 2)[0] << 8) | rdW(b + 0x20, 2)[1];
      const acc = (rdW(b + 0x08, 2)[0] << 8) | rdW(b + 0x08, 2)[1];
      const vol = rdW(b + 0x0c, 1)[0]; const flg = rdW(b + 0x14, 1)[0];
      return `p=${period.toString().padStart(4)} acc=${acc.toString(16).padStart(4, '0')} v=${vol.toString(16).padStart(2, '0')} f=${flg.toString(16).padStart(2, '0')}`;
    });
    console.log(`t${c.toString().padStart(3)} | ${cols.join(' | ')}`);
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
