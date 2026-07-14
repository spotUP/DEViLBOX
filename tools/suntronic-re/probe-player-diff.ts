/**
 * probe-player-diff.ts — diff SunTronicPlayer's native tick timeline against the
 * p9a UADE oracle (period $20 / acc $08 / vol $0c / flags $14, per voice per
 * tick). Scratch harness for Gate-2 native-port validation. NOT committed.
 *
 * Usage: npx tsx tools/suntronic-re/probe-player-diff.ts [module.src] [ticks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const STRIDE = 0x1ba;
// The replayer relocates per module (gliders handler @0x2660e, ballblaser
// @0x2560a), so the per-tick voice-loop write PC is NOT constant — detect it.
const SCAN_LO = 0x20000, SCAN_HI = 0x40000;

interface Row { period: number; acc: number; vol: number; flags: number }

/** A golden sample = the 4-voice state read at a known cumulative tick index. */
interface Sample { tick: number; voices: Row[] }

interface Golden { samples: Sample[] }

async function golden(name: string, data: Uint8Array, ticks: number): Promise<Golden> {
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
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // pass 0: detect the per-tick voice-loop write PC (relocates per module). The
  // handler writes the voice struct every tick, so the first in-region write PC is
  // the SAME instruction each tick ⇒ its histogram bin dominates. argmax = anchor.
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  const scanTicks = Math.max(ticks, 200);
  for (let c = 0; c < scanTicks; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const pc = capU32(16);
    hist.set(pc, (hist.get(pc) ?? 0) + 1);
  }
  let pcLo = 0, best = -1;
  for (const [pc, n] of hist) if (n > best) { best = n; pcLo = pc; }
  if (best <= 0) throw new Error('no handler write captured in scan window');
  const pcHi = (pcLo + 2) >>> 0;
  // pass 1: base0 = min A0 (voice[0]) at that PC across the run.
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < ticks; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO);
    mod._uade_wasm_arm_capture_pc(pcLo, pcHi);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const a0 = capU32(8);
    if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0;
  }
  if (base0 === 0xffffffff) throw new Error(`no voice write at detected PC ${pcLo.toString(16)}`);
  const bases = [0, 1, 2, 3].map((k) => (base0 + k * STRIDE) >>> 0);
  // pass 2: timeline
  mod._uade_wasm_stop(); load();
  const rdW = (addr: number, len: number): number[] => {
    mod._uade_wasm_read_memory(addr >>> 0, rd, len);
    const b: number[] = []; for (let i = 0; i < len; i++) b.push(mod.HEAPU8[rd + i]); return b;
  };
  const snap = (): Row[] => bases.map((b) => {
    const p = rdW(b + 0x20, 2); const a = rdW(b + 0x08, 2);
    return { period: (p[0] << 8) | p[1], acc: (a[0] << 8) | a[1], vol: rdW(b + 0x0c, 1)[0], flags: rdW(b + 0x14, 1)[0] };
  });
  // Tick clock = voice0's 3-level tempo counter (`$2c→$2d→$2e`, disasm
  // 0x2667a-0x2669e): `$2c++`; at `$30` wrap → `$2d++`; at `$31` wrap → `$2e++`.
  // `$2e` is the row/sequence index and NEVER resets on a note-on, so the derived
  // absolute tick = (($2e*$31)+$2d)*$30+$2c is strictly monotone and reset-proof.
  // (The earlier `$24` vibrato-accumulator clock drifted because `clr.w $24` at
  // every Type-A note-on makes (cur-prev)/speed meaningless across a note-on block;
  // it only held while a single note was sustained.) The WASM render is quantized
  // to 1024-sample blocks so a block may span 2 CIA-B ticks — reading the counter
  // at each block still gives that block's exact tick (an intermediate tick is just
  // skipped; player alignment keys on the same monotone value, so it stays aligned).
  const monoTick = (): number => {
    const c = rdW(base0 + 0x2c, 1)[0], d = rdW(base0 + 0x2d, 1)[0], e = rdW(base0 + 0x2e, 1)[0];
    const sp = rdW(base0 + 0x30, 1)[0] || 1, rp = rdW(base0 + 0x31, 1)[0] || 1;
    return ((e * rp) + d) * sp + c;
  };
  // Torn-read guard: a 1024-sample audio quantum can end MID-handler — after the
  // tempo counter advanced (0x2667a) but before EFFECTS wrote $20/$24 (0x26910) —
  // so a double-tick (+2) quantum reads a counter one tick ahead of the voice
  // state. Store ONLY clean single-advance (+1) quanta; skip +2 gaps. The golden is
  // then sparse but every stored tick is a fully-settled post-handler snapshot.
  mod._uade_wasm_stop(); load();
  const samples: Sample[] = [];
  let prevTick = monoTick();
  let guard = 0;
  while (samples.length < ticks && guard < ticks * 6 + 64) {
    guard++;
    if (mod._uade_wasm_render(L, R, 1024) <= 0) break;
    const t = monoTick();
    if (t === prevTick + 1) samples.push({ tick: t, voices: snap() });
    prevTick = t;
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return { samples };
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const ticks = parseInt(process.argv[3] ?? '32', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));

  const gold = await golden(name, data, ticks);
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0 });

  const hx2 = (n: number): string => n.toString(16).padStart(2, '0');
  const hx4 = (n: number): string => n.toString(16).padStart(4, '0');
  const hx8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
  let mism = 0;
  const SHIFT = parseInt(process.argv[4] ?? '0', 10); // constant pre-roll offset
  // Player's own monotone tempo tick (same 3-level counter formula as the golden),
  // so alignment is on a shared reset-proof value, not a fabricated index.
  const playerTick = (): number => {
    const d = player.debugVoice(0);
    return ((d.position * d.rowsPerPos) + d.tempoNote) * d.speed + d.tempoTick;
  };
  let m: ReturnType<typeof player.tick>['voices'] = player.tick().voices;
  let guard = 0;
  for (let s = 0; s < gold.samples.length; s++) {
    const { tick, voices: g } = gold.samples[s];
    // advance the native player until its monotone tick reaches this sample's tick
    while (playerTick() < tick + SHIFT && guard < gold.samples.length * 8 + 256) { m = player.tick().voices; guard++; }
    const cells: string[] = [];
    let bad = false;
    for (let v = 0; v < 4; v++) {
      const gv = g[v], mv = m[v];
      const ok = gv.period === mv.period && gv.acc === (mv.acc & 0xffff) && gv.flags === mv.flags;
      if (!ok) bad = true;
      cells.push(`${ok ? ' ' : 'X'}g[p${gv.period.toString().padStart(4)} a${hx4(gv.acc)} f${hx2(gv.flags)}] m[p${mv.period.toString().padStart(4)} a${hx4(mv.acc & 0xffff)} f${hx2(mv.flags)}]`);
    }
    if (bad) mism++;
    if (bad || s < 4) console.log(`t${tick.toString().padStart(3)} ${cells.join(' ')}`);
  }
  void hx8;
  console.log(`\n[diff] ${name}: ${gold.samples.length - mism}/${gold.samples.length} samples match (${mism} mismatched)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
