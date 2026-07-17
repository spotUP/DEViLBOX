/** UADE RAM trace of voice[V] struct via dynamic PC-find (version-independent).
 *  $08 pitch, $0A slide, $0E arpSel, $0F phase, $20 period. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba;
async function main(): Promise<void> {
  const name = process.argv[2] ?? 'multi-arp-long.src';
  const ticks = parseInt(process.argv[3] ?? '52', 10);
  const V = parseInt(process.argv[4] ?? '1', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
    mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(p, data.byteLength, h) !== 0) throw new Error('load');
    mod._free(p); mod._free(h);
  };
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(72), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // Pass 0: most-frequent PC in scan window = tick handler
  load(); const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let wpc = 0, wbest = -1; for (const [p, n] of hist) if (n > wbest) { wbest = n; wpc = p; }
  // Pass 1: min A0 at that PC = voice[0] base
  load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(wpc, (wpc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const b = (base0 + V * STRIDE) >>> 0;
  console.log('wpc', '0x'+wpc.toString(16), 'voice', V, 'base', '0x'+b.toString(16));
  // Pass 2: per-tick read
  load();
  const rdB = (addr: number, len: number): number[] => {
    mod._uade_wasm_read_memory(addr >>> 0, rd, len);
    const o: number[] = []; for (let i = 0; i < len; i++) o.push(mod.HEAPU8[rd + i]); return o;
  };
  const s16 = (w: number): number => (w << 16) >> 16;
  const s8 = (x: number): number => (x << 24) >> 24;
  console.log('tick| pitch$08 | slide$0A | arpSel$0E | phase$0F | period$20');
  for (let c = 0; c < ticks; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const p8 = rdB(b + 0x08, 2); const pa = rdB(b + 0x0a, 2); const pe = rdB(b + 0x0e, 1)[0];
    const pf = rdB(b + 0x0f, 1)[0]; const p20 = rdB(b + 0x20, 2);
    const pitch = (p8[0] << 8) | p8[1]; const slide = s16((pa[0] << 8) | pa[1]); const per = (p20[0] << 8) | p20[1];
    console.log([c, pitch, slide, s8(pe), pf, per].map(String).map(x=>x.padStart(9)).join('|'));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
