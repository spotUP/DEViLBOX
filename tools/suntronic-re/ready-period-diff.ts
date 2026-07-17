/**
 * ready-period-diff.ts — pitch-level "notes off" locator for a full SunTronic V1.3
 * song. Renders UADE per-882-frame Paula period ($20) per voice (the p9a oracle)
 * and the native SunTronicPlayer.tick() period stream, aligns them warmup=1
 * (native[i] == uade[i-1], proven by sunTronicNoteTimeline.golden), and prints
 * every tick where a voice's period differs. A period difference == a wrong NOTE
 * (wrong pitch), which the RMS-envelope / xcorr metrics are blind to.
 *
 * Usage: SONG=ready TICKS=1400 npx tsx tools/suntronic-re/ready-period-diff.ts
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
const PC_LO = 0x2660e, PC_HI = 0x26610;

async function uadePeriods(name: string, ticks: number): Promise<number[][]> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const load = () => {
    const p = mod._malloc(data.byteLength); mod.HEAPU8.set(data, p);
    const h = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, h, name.length * 4 + 1);
    mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    mod._uade_wasm_load(p, data.byteLength, h); mod._free(p); mod._free(h);
  };
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(64);
  // Pass 1: voice[0] base.
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1); load();
  let base0 = 0xffffffff;
  for (let c = 0; c < ticks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const a0 = new Uint32Array(mod.HEAPU8.buffer)[(cap >> 2) + 8] >>> 0;
    if (a0 < base0) base0 = a0;
  }
  if (base0 === 0xffffffff) throw new Error('no EFFECTS capture — wrong PC/module');
  const bases = [0, 1, 2, 3].map((k) => (base0 + k * STRIDE) >>> 0);
  // Pass 2: period per tick.
  mod._uade_wasm_stop(); load();
  const rdW = (addr: number): number => { mod._uade_wasm_read_memory(addr >>> 0, rd, 2); return (mod.HEAPU8[rd] << 8) | mod.HEAPU8[rd + 1]; };
  const rows: number[][] = [];
  for (let c = 0; c < ticks; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    rows.push(bases.map((b) => rdW(b + 0x20)));
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  return rows;
}

function nativePeriods(name: string, ticks: number): number[][] {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const player = new SunTronicPlayer(score, { subsong: 0 });
  const rows: number[][] = [];
  for (let i = 0; i < ticks; i++) rows.push(player.tick().voices.map((v) => v.period));
  return rows;
}

async function main(): Promise<void> {
  const name = process.env.SONG ?? 'ready';
  const ticks = parseInt(process.env.TICKS ?? '1400', 10);
  const uade = await uadePeriods(name, ticks);
  const nat = nativePeriods(name, ticks);
  const n = Math.min(uade.length, nat.length);
  console.log(`[period-diff] ${name}: comparing ${n} ticks (uade=${uade.length} native=${nat.length}), warmup=1`);
  let mism = 0, total = 0;
  const perVoice = [0, 0, 0, 0];
  const firstMism: (number | null)[] = [null, null, null, null];
  const shown: string[] = [];
  for (let i = 1; i < n; i++) {
    const u = uade[i - 1], m = nat[i];
    for (let v = 0; v < 4; v++) {
      total++;
      if (u[v] !== m[v]) {
        mism++; perVoice[v]++;
        if (firstMism[v] === null) firstMism[v] = i;
        if (shown.length < 60) shown.push(`t${i} v${v}: uade p${u[v]} native p${m[v]} (d${m[v] - u[v]})`);
      }
    }
  }
  console.log(`mismatches=${mism}/${total}  perVoice=[${perVoice.join(',')}]  firstMismatchTick=[${firstMism.join(',')}]`);
  for (const s of shown) console.log('  ' + s);
}
main().catch((e) => { console.error(e); process.exit(1); });
