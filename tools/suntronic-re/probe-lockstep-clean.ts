/** probe-lockstep-clean.ts — TRUE per-tick lockstep, no capture alias. Renders UADE one
 * sample at a time; every time voice0's $15 (outVolume, written once per EFFECTS/tick)
 * fires, that sample is a tick boundary → snapshot ALL 4 voices ($20 period,$08 acc,
 * $0c vol byte,$14 flags). Captures EVERY tick from frame 0 (incl the note-trigger
 * frame the note-PC gate skips). Compares to native tick i. Decides byte-exactness on
 * the proven single 1024 clock. NOT committed. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const SCAN_LO = 0x20000, SCAN_HI = 0x40000, STRIDE = 0x1ba, TICKS = 40;

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
  const L = mod._malloc(4), R = mod._malloc(4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  const capU32 = (i: number): number => new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + i] >>> 0;
  // find base0 (voice0 struct) via note-handler write PC
  mod._uade_wasm_stop(); load();
  const hist = new Map<number, number>();
  for (let c = 0; c < 400; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(SCAN_LO, SCAN_HI);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) hist.set(capU32(16), (hist.get(capU32(16)) ?? 0) + 1);
  }
  let notePc = 0, best = -1; for (const [pc, n] of hist) if (n > best) { best = n; notePc = pc; }
  mod._uade_wasm_stop(); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < 120; c++) {
    mod._uade_wasm_arm_capture(SCAN_LO, SCAN_HI - SCAN_LO); mod._uade_wasm_arm_capture_pc(notePc, (notePc + 2) >>> 0);
    if (mod._uade_wasm_render(L, R, 21) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) { const a0 = capU32(8); if (a0 >= SCAN_LO && a0 < SCAN_HI && a0 < base0) base0 = a0; }
  }
  const rdBytes = (addr: number, len: number): number[] => {
    mod._uade_wasm_read_memory(addr >>> 0, rd, len); const b: number[] = [];
    for (let i = 0; i < len; i++) b.push(mod.HEAPU8[rd + i]); return b;
  };
  const s16 = (w: number): number => (w << 16) >> 16;
  const snapVoice = (vi: number): { period: number; acc: number; vol: number; flags: number; vib: number; vidx: number } => {
    const b = base0 + vi * STRIDE;
    const p = rdBytes(b + 0x20, 2), a = rdBytes(b + 0x08, 2), vo = rdBytes(b + 0x0c, 1), fl = rdBytes(b + 0x14, 1);
    const vb = rdBytes(b + 0x24, 2), vx = rdBytes(b + 0x26, 2);
    return { period: (p[0] << 8) | p[1], acc: (a[0] << 8) | a[1], vol: vo[0], flags: fl[0], vib: (vb[0] << 8) | vb[1], vidx: (vx[0] << 8) | vx[1] };
  };
  // per-tick capture: render 1 sample at a time; on each voice0 $15 write, snapshot all voices.
  mod._uade_wasm_stop(); load();
  const gold: { voices: ReturnType<typeof snapVoice>[] }[] = [];
  for (let s = 0; s < 44100 && gold.length < TICKS; s++) {
    mod._uade_wasm_arm_capture((base0 + 0x15) >>> 0, 1); mod._uade_wasm_arm_capture_pc(0, 0);
    if (mod._uade_wasm_render(L, R, 1) <= 0) break;
    if (mod._uade_wasm_get_capture(cap)) gold.push({ voices: [0, 1, 2, 3].map(snapVoice) });
  }
  // dump UADE voice0 vibPhase per clean tick — decisive on whether $24 advances uniform +8000
  const dv: number[] = gold.map((g) => s16(g.voices[0].vib));
  const dd: number[] = []; for (let i = 1; i < dv.length; i++) dd.push(dv[i] - dv[i - 1]);
  console.log(`\n${name} UADE v0 vibPhase(clean per-tick): ${dv.slice(0, 16).join(',')}`);
  console.log(`   deltas: ${dd.slice(0, 15).join(',')}`);
  console.log(`   vidx  : ${gold.slice(0, 16).map((g) => g.voices[0].vidx).join(',')}`);
  // native lockstep, try alignments 0..2 (native priming ticks discarded)
  for (const warmup of [0, 1]) {
    const score = parseSunTronicV13Score(data);
    const player = new SunTronicPlayer(score, { subsong: 0 });
    for (let w = 0; w < warmup; w++) player.tick();
    let mism = 0; const firstBad: string[] = [];
    for (let i = 0; i < gold.length; i++) {
      const mv = player.tick().voices; const gv = gold[i].voices;
      for (let v = 0; v < 4; v++) {
        const g = gv[v], m = mv[v];
        if (g.period !== m.period || g.acc !== (m.acc & 0xffff) || g.flags !== m.flags) {
          mism++;
          if (firstBad.length < 6) firstBad.push(`t${i} v${v}: G{p${g.period} a${g.acc.toString(16)} f${g.flags.toString(16)}} N{p${m.period} a${(m.acc & 0xffff).toString(16)} f${m.flags.toString(16)}}`);
        }
      }
    }
    console.log(`\n${name} warmup=${warmup} base0=${base0.toString(16)}: ${mism}/${gold.length * 4} cell-mismatches`);
    for (const f of firstBad) console.log('   ' + f);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
(async () => { await run('gliders.src'); await run('ballblaser.src'); })().catch((e) => { console.error(e); process.exit(1); });
