/**
 * emit-note-timeline-golden.ts — capture the p9a UADE note-timeline oracle for the
 * byte-exact SunTronic modules and write it as a committed, wasm-free golden JSON
 * consumed by sunTronicNoteTimeline.golden.test.ts.
 *
 * One golden sample = one fire of the NOTE handler (0x2660e), detected by arming PC
 * capture and fine-rendering (128-sample chunks); the m68k interrupt runs to
 * completion before its chunk's audio, so the voice records read at chunk end are
 * settled. This is tempo-independent (unlike a fixed 882-sample window, which aliases
 * the real interrupt cadence and duplicates/skips ticks).
 *
 * ── CAVEAT (2026-07-14d): this samples the WRONG clock for a byte-exact golden. ──
 * SunTronic has two independent clocks (see SunTronicPlayer.ts header): the note
 * handler here fires at the module-tempo CIA rate (~43 Hz), but EFFECTS/vibrato/period
 * runs on the 50 Hz vblank. Paula's $20 period is written per vblank, so a byte-exact
 * per-tick oracle must sample per VBLANK-EFFECTS fire, not per note fire. This emitter
 * is retained as the current best (proves the 882 aliasing) but its output is not yet
 * a valid byte-exact golden — the golden test is intentionally NOT wired into test:ci.
 * NEXT: detect the vblank/EFFECTS PC (relocates per module; 0x2660e/0x267f6 are
 * gliders-specific RAM addrs) or the exact CIA period, sample there, and split the
 * native player into vblank-EFFECTS + CIA-note clocks. Read per voice: $20/$08/$0c/$14.
 *
 * Regenerate:  npx tsx tools/suntronic-re/emit-note-timeline-golden.ts
 * (Requires UADE-WASM; the committed JSON is consumed with no wasm at test time.)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const STRIDE = 0x1ba;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000;

// Modules whose native port is byte-exact today (non-arp: drin row-0 = 0). Modules
// that drive nonzero drin (arp/vibrato) are not yet ported — see SunTronicPlayer.
const MODULES = ['gliders.src', 'ballblaser.src'];
const TICKS = 80;

interface Row { period: number; acc: number; vol: number; flags: number }
interface Sample { tick: number; voices: Row[] }

async function capture(name: string): Promise<Sample[]> {
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
  const SPT = 882; // samples per tick = 44100 / 50 Hz PAL vblank
  const L = mod._malloc(SPT * 4), R = mod._malloc(SPT * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // pass0: detect the per-tick voice-loop write PC (relocates per module) by histogram argmax.
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
  if (best <= 0) throw new Error('no handler write captured');
  const pcHi = (pcLo + 2) >>> 0;
  // pass1: base0 = min A0 (voice[0]) at that PC.
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
  if (base0 === 0xffffffff) throw new Error('no voice write at detected PC');
  const bases = [0, 1, 2, 3].map((k) => (base0 + k * STRIDE) >>> 0);
  const rdW = (addr: number, len: number): number[] => {
    mod._uade_wasm_read_memory(addr >>> 0, rd, len);
    const b: number[] = []; for (let i = 0; i < len; i++) b.push(mod.HEAPU8[rd + i]); return b;
  };
  const snap = (): Row[] => bases.map((b) => {
    const p = rdW(b + 0x20, 2), a = rdW(b + 0x08, 2);
    return { period: (p[0] << 8) | p[1], acc: (a[0] << 8) | a[1], vol: rdW(b + 0x0c, 1)[0], flags: rdW(b + 0x14, 1)[0] };
  });
  // pass2: advance exactly one handler fire (PC 0x2660e) per golden sample — the true
  // tick boundary regardless of module tempo — reading settled voice state at the end
  // of the chunk that contained the fire. Loop index IS the tick (1:1 with native).
  mod._uade_wasm_stop(); load();
  const samples: Sample[] = [];
  const CH = 128; // << the ~1026-sample tick gap → at most one fire per chunk
  let guard = 0;
  const guardMax = TICKS * Math.ceil(2048 / CH) + 64;
  while (samples.length < TICKS && guard++ < guardMax) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, CH) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) samples.push({ tick: samples.length, voices: snap() });
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return samples;
}

async function main(): Promise<void> {
  const modules: Record<string, Sample[]> = {};
  for (const m of MODULES) {
    modules[m] = await capture(m);
    console.log(`${m}: ${modules[m].length} clean ticks captured`);
  }
  const HERE = dirname(fileURLToPath(import.meta.url));
  const out = resolve(HERE, '../../src/engine/suntronic/__tests__/sunTronicNoteTimeline.golden.json');
  const doc = {
    generatedBy: 'tools/suntronic-re/emit-note-timeline-golden.ts',
    note: 'UADE note-timeline oracle ($20 period / $08 acc / $0c vol / $14 flags per voice), one sample per real tick-handler fire (PC 0x2660e), tempo-independent. Consumed wasm-free by sunTronicNoteTimeline.golden.test.ts.',
    modules,
  };
  writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(`wrote ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
