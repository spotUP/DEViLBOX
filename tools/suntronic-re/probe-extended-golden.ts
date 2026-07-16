/** probe-extended-golden.ts — MEASUREMENT ONLY. Re-runs the note-timeline oracle for
 * ballblaser with a LONGER window (does NOT overwrite the committed golden) so we can
 * see the TRUE bucket at which UADE advances position 0->1 (the note change native
 * fires ~2 buckets early at t78). Prints v0/v3 period per fire, tick 70..EXT. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const STRIDE = 0x1ba;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000;
const TICKS = 120;
const NAME = 'ballblaser.src';

interface Row { period: number; acc: number }
interface Sample { voices: Row[] }

async function main(): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, NAME)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(NAME.length * 4 + 1); mod.stringToUTF8(NAME, hp, NAME.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
    mod._free(ptr); mod._free(hp);
  };
  const SPT = 882;
  const L = mod._malloc(SPT * 4), R = mod._malloc(SPT * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < Math.max(TICKS, 200); c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1;
  for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  const pcHi = (pcLo + 2) >>> 0;
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < TICKS; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const a0 = capU32(8);
    if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0;
  }
  const bases = [0, 1, 2, 3].map((k) => (base0 + k * STRIDE) >>> 0);
  const rdW = (addr: number, len: number): number[] => {
    mod._uade_wasm_read_memory(addr >>> 0, rd, len);
    const b: number[] = []; for (let i = 0; i < len; i++) b.push(mod.HEAPU8[rd + i]); return b;
  };
  const snap = (): Row[] => bases.map((b) => {
    const p = rdW(b + 0x20, 2), a = rdW(b + 0x08, 2);
    return { period: (p[0] << 8) | p[1], acc: (a[0] << 8) | a[1] };
  });
  mod._uade_wasm_stop(); load();
  const samples: Sample[] = [];
  const CH = 128;
  let guard = 0;
  const guardMax = TICKS * Math.ceil(2048 / CH) + 64;
  while (samples.length < TICKS && guard++ < guardMax) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, CH) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) samples.push({ voices: snap() });
  }
  // eslint-disable-next-line no-console
  console.log(`captured ${samples.length} ticks (pcLo=0x${pcLo.toString(16)} base0=0x${base0.toString(16)})`);
  for (let t = 70; t < samples.length; t++) {
    const v = samples[t].voices;
    // eslint-disable-next-line no-console
    console.log(`gtick${t}: v0 p${v[0].period}/${v[0].acc.toString(16)}  v3 p${v[3].period}/${v[3].acc.toString(16)}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
