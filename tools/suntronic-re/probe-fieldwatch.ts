/** probe-fieldwatch.ts — with the word/long capture hook, watch each voice-struct
 * field's WORD write directly and report fire count + gaps + writing PCs. Decides
 * whether $20 (period), $24 (vibrato phase), $08 (pitch acc) update on ONE clock
 * (~1026 note rate) or two (period/note ~1026 vs vibrato/vblank ~882). NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, CHUNK = 21;
const FIELDS = [0x08, 0x0c, 0x20, 0x24, 0x26]; // acc, vol, period, vibPhase, vibIndex

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
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, CHUNK) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, (pcLo + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, CHUNK) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  console.log(`${name}: base0=${base0.toString(16)}`);
  const NCHUNK = Math.ceil(882 * 24 / CHUNK);
  for (const f of FIELDS) {
    mod._uade_wasm_stop(); load();
    const fires: number[] = []; const pcs = new Map<number, number>(); let pos = 0;
    for (let c = 0; c < NCHUNK; c++) {
      mod._uade_wasm_arm_capture((base0 + f) >>> 0, 2); mod._uade_wasm_arm_capture_pc(0, 0);
      if (mod._uade_wasm_render(L, R, CHUNK) <= 0) break;
      if (mod._uade_wasm_get_capture(cap)) { fires.push(pos); pcs.set(capU32(16), (pcs.get(capU32(16)) ?? 0) + 1); }
      pos += CHUNK;
    }
    const gaps: number[] = []; for (let i = 1; i < Math.min(fires.length, 14); i++) gaps.push(fires[i] - fires[i - 1]);
    const per = fires.length ? (pos / fires.length).toFixed(0) : '-';
    console.log(`  $${f.toString(16).padStart(2, '0')}: fires=${fires.length} period≈${per} PCs=${[...pcs.entries()].map(([p, n]) => `${p.toString(16)}×${n}`).join(',')} gaps=${gaps.join(',')}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch((e) => { console.error(e); process.exit(1); });
