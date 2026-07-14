/** probe-vibcompare.ts — per-tick UADE $24 vibPhase / $08 pitch / $20 period for
 * gliders voice0 vs native player internal state, to localize the vibrato divergence.
 * NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const STRIDE = 0x1ba, SPT = 882, SCAN_LO = 0x20000, SCAN_HI = 0x40000;
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
  const L = mod._malloc(SPT * 4), R = mod._malloc(SPT * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // detect base0 via PC histogram (same as emitter)
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 200; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 80; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, (pcLo + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, SPT) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const b0 = base0 >>> 0;
  const rw = (addr: number, len: number): number[] => { mod._uade_wasm_read_memory(addr >>> 0, rd, len); const o: number[] = []; for (let i = 0; i < len; i++) o.push(mod.HEAPU8[rd + i]); return o; };
  const s16 = (x: number): number => (x & 0x8000) ? x - 0x10000 : x;
  mod._uade_wasm_stop(); load();
  const player = new SunTronicPlayer(parseSunTronicV13Score(data), { subsong: 0 });
  console.log('fire | UADE v0: $24 $20 (step) | NAT v0: vibPhase period');
  const CH = 128; let got = 0, guard = 0, prevVp = 0;
  while (got < 20 && guard++ < 4000) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, (pcLo + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, CH) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const vp = s16((rw(b0 + 0x24, 2)[0] << 8) | rw(b0 + 0x24, 2)[1]);
    const per = (rw(b0 + 0x20, 2)[0] << 8) | rw(b0 + 0x20, 2)[1];
    const step = got === 0 ? 0 : ((vp - prevVp) & 0xffff);
    prevVp = vp;
    const nv = player.tick(); const nd = player.debugVoice(0);
    console.log(`  ${got} | $24=${vp} $20=${per} (+${step > 0x8000 ? step - 0x10000 : step}) | vp=${s16(nd.vibPhase)} p=${nv.voices[0].period}`);
    got++;
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
run('gliders.src').catch((e) => { console.error(e); process.exit(1); });
