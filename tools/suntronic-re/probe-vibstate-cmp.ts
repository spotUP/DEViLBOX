/** probe-vibstate-cmp.ts — capture UADE per note-fire ($08 acc,$20 period,$24 vibPhase,
 * $26 vibIndex for voice 0) and run the native player in lockstep, dumping both so we
 * see exactly which vibrato field diverges and when. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba, TICKS = 18;

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
  const CH = 128;
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // pass0: note-handler write PC
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 200; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pcLo = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  const pcHi = (pcLo + 2) >>> 0;
  // pass1: base0
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 80; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rdW = (addr: number, len: number): number[] => {
    mod._uade_wasm_read_memory(addr >>> 0, rd, len); const b: number[] = [];
    for (let i = 0; i < len; i++) b.push(mod.HEAPU8[rd + i]); return b;
  };
  const snap0 = (): { acc: number; per: number; vib: number; vidx: number } => {
    const a = rdW(base0 + 0x08, 2), p = rdW(base0 + 0x20, 2), v = rdW(base0 + 0x24, 2), i = rdW(base0 + 0x26, 2);
    return { acc: (a[0] << 8) | a[1], per: (p[0] << 8) | p[1], vib: (v[0] << 8) | v[1], vidx: (i[0] << 8) | i[1] };
  };
  // pass2: per-fire snapshots
  mod._uade_wasm_stop(); load();
  const gold: ReturnType<typeof snap0>[] = []; let guard = 0;
  while (gold.length < TICKS && guard++ < 400) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, CH) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) gold.push(snap0());
  }
  // native lockstep
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0 });
  console.log(`\n${name} (base0=${base0.toString(16)}) voice0  [G=UADE N=native], s16 vib`);
  const s16 = (w: number): number => (w << 16) >> 16;
  for (let i = 0; i < gold.length; i++) {
    const t = player.tick(); const d = player.debugVoice(0);
    const g = gold[i]; const n = t.voices[0];
    const mark = g.per !== n.period ? ' <PER' : '';
    console.log(`t${String(i).padStart(2)} G{acc${g.acc.toString(16)} per${g.per} vib${s16(g.vib)} vidx${g.vidx}}  N{acc${(n.acc & 0xffff).toString(16)} per${n.period} vib${s16(d.vibPhase)} vidx${d.vibIndex}}${mark}`);
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); })().catch((e) => { console.error(e); process.exit(1); });
