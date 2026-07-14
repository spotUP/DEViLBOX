/** probe-firecount.ts — is the handler exactly 1 fire per 882-sample window, or does
 * 882 (vs real PAL 880.77) alias to 0/2 fires? Renders in fine chunks, counts handler-PC
 * fires per cumulative 882 window. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, SPT = 882, CHUNK = 21;
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
  const L = mod._malloc(CHUNK * 4), R = mod._malloc(CHUNK * 4), cap = mod._malloc(18 * 4);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // detect handler PC
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, CHUNK) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  // fine fire timeline
  mod._uade_wasm_stop(); load();
  const fires: number[] = []; let pos = 0;
  const NCHUNK = Math.ceil(SPT * 24 / CHUNK);
  for (let c = 0; c < NCHUNK; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, (pcLo + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, CHUNK) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) fires.push(pos + Math.floor(CHUNK / 2));
    pos += CHUNK;
  }
  console.log(`${name}: handlerPC=${pcLo.toString(16)} totalFires=${fires.length} over ${pos} samples → tickPeriod≈${(pos / fires.length).toFixed(2)} samples`);
  // fires per 882 window
  const perWin: number[] = [];
  for (let w = 0; w < 22; w++) { const lo = w * SPT, hi = (w + 1) * SPT; perWin.push(fires.filter((f) => f >= lo && f < hi).length); }
  console.log('  fires per 882-window:', perWin.join(','));
  // inter-fire gaps
  const gaps: number[] = []; for (let i = 1; i < Math.min(fires.length, 24); i++) gaps.push(fires[i] - fires[i - 1]);
  console.log('  inter-fire gaps:', gaps.join(','));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
run('gliders.src').catch((e) => { console.error(e); process.exit(1); });
