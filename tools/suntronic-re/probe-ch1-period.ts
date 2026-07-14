/** probe-ch1-period.ts — render 1 sample at a time (cycle-true, no chunk artifact),
 * detect each note-handler FIRE (arm PC capture on the handler PC) and read all 4 voice
 * $20 periods + $08 acc at the fire. This is the CH=1 "golden" — what real Amiga hardware
 * produces, free of UADE's CH=128 chunk-quantized double-fires. Compare to the native
 * SunTronicPlayer with a UNIFORM clock (ciaTick=1024, exactly 1 sub-tick/fire, row every
 * 6 fires): if it matches, the CH=128 golden's doubles are an emulation artifact and a
 * clean single-clock model is byte-exact + physically correct. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, NFIRE = 80;

async function ch1Golden(name: string): Promise<{ period: number[]; acc: number[] }[]> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = (): void => {
    const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(p, data.byteLength, h) !== 0) throw new Error('load');
    mod._free(p); mod._free(h);
  };
  const Lb = mod._malloc(1024 * 4), Rb = mod._malloc(1024 * 4), L = mod._malloc(4), R = mod._malloc(4), cap = mod._malloc(72), rd = mod._malloc(8);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // locate handler PC (busiest write-PC) + base0
  mod._uade_wasm_stop(); load(); const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(Lb, Rb, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let pc = 0, best = -1; for (const [p, n] of hist) if (n > best) { best = n; pc = p; }
  mod._uade_wasm_stop(); load(); let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(Lb, Rb, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const VS = 0x1ba; // voice stride
  const rW = (a: number): number => { mod._uade_wasm_read_memory(a >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  mod._uade_wasm_stop(); load();
  const out: { period: number[]; acc: number[] }[] = [];
  for (let s = 0; s < NFIRE * 1400 && out.length < NFIRE; s++) {
    mod._uade_wasm_arm_capture_pc(pc, (pc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap) && capU32(17)) {
      const period: number[] = [], acc: number[] = [];
      for (let v = 0; v < 4; v++) { period.push(rW(base0 + v * VS + 0x20)); acc.push(rW(base0 + v * VS + 0x08)); }
      out.push({ period, acc });
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return out;
}

(async () => {
  for (const name of ['gliders.src', 'ballblaser.src']) {
    const g = await ch1Golden(name);
    const score = parseSunTronicV13Score(new Uint8Array(readFileSync(join(CORPUS_DIR, name))));
    // native, uniform clock: ciaTick=1024 → exactly 1 sub-tick/fire (no doubles), row every 6 fires
    const player = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: 1024 });
    let bad = 0, first = -1; const N = Math.min(g.length, NFIRE);
    // try both offsets 0 and -1 (native priming lag)
    for (const off of [0, -1, 1]) {
      bad = 0; first = -1;
      const p2 = new SunTronicPlayer(score, { subsong: 0, ciaTickSamples: 1024 });
      const nat: number[][] = []; for (let i = 0; i < N + 2; i++) nat.push(p2.tick().voices.map((x) => x.period));
      for (let i = 0; i < N; i++) {
        const ni = i + off; if (ni < 0 || ni >= nat.length) continue;
        for (let v = 0; v < 4; v++) if (g[i].period[v] !== nat[ni][v]) { bad++; if (first < 0) first = i; }
      }
      console.log(`${name} uniform(1024) offset ${off}: mismatches=${bad}/${N * 4} first=f${first}`);
    }
    // show first 12 fires of CH1 golden v0 for eyeball
    console.log(`  CH1 v0 period[0..11] = ${g.slice(0, 12).map((x) => x.period[0]).join(',')}`);
    void player;
  }
})().catch((e) => { console.error(e); process.exit(1); });
