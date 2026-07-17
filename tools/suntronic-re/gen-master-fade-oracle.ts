/**
 * gen-master-fade-oracle.ts — bake the master-volume fade lockstep fixture.
 *
 * Bug (2026-07-17): the native player ignored opcodes 0x92 (master vol) and 0x93
 * (master fade speed+rate), so the global master volume $a71 was never modelled.
 * The embedded player folds it into every voice's AUDxVOL: `$15 = env*$c>>6 *
 * $a71>>6 * $a72>>6` (@0x628). $a71/$a72 init 0x40 (identity), which is why the
 * corpus matched with master unmodelled — but play11 sets $a71=0 (0x92) then fades
 * it up on the counter+signed-add+clamp engine @0x440 (0x93), so v0's AUDxVOL
 * ramps 0→1→2 (measured $a71 via A6+0xa71: 0,1,1,2,2,3,4,...; $a72 stays 0x40).
 * Native previously played v0 flat (64,40,20,10 — the un-scaled envelope).
 *
 * Witness = play11 v0, whose AUDxVOL is a NON-CONSTANT master ramp, compared over a
 * best-phase-aligned window (UADE's 1-tick startup lag + the deferred Paula-DMA
 * buffer-beat are the same phase axis the corpus probe best-shifts). Reverting the
 * master fold makes native play the flat envelope → the ramp window breaks.
 *
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/gen-master-fade-oracle.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';

const REG_VOL = 4;
const TICKS = 40;
const MIN_WINDOW = 12; // require ≥12 byte-exact settled ticks (spans the 0→1→2 ramp)
const MODULES = ['play11'];
const OUT = join(process.cwd(), 'src/engine/suntronic/__fixtures__/suntronicMasterFadeOracle.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

async function oracleVol(mod: AnyMod, name: string, data: Uint8Array): Promise<number[][]> {
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load ' + name);
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  mod._uade_wasm_enable_paula_log(1);
  const per: number[][] = [[], [], [], []];
  for (let c = 0; c < TICKS; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) { for (const p of per) p.push(-1); continue; }
    const n = mod._uade_wasm_get_paula_log(lg, 512);
    const h = new Uint32Array(mod.HEAPU8.buffer); const base = lg >> 2;
    const last: (number | null)[] = [null, null, null, null];
    for (let i = 0; i < n; i++) {
      const p = h[base + i * 3];
      const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff;
      if (ch < 4 && reg === REG_VOL) last[ch] = p & 0xffff;
    }
    for (let v = 0; v < 4; v++) per[v].push(last[v] ?? -1);
  }
  mod._free(L); mod._free(R); mod._free(lg);
  return per;
}
function holdForward(seq: number[]): number[] { const o: number[] = []; let h = -1; for (const x of seq) { if (x >= 0) h = x; o.push(h); } return o; }

async function main(): Promise<void> {
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());

  const modules = [];
  for (const name of MODULES) {
    const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
    const ov = await oracleVol(mod, name, data);
    const score = parseSunTronicV13Score(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new (SunTronicPlayer as any)(score);
    const nat: number[][] = [[], [], [], []];
    for (let t = 0; t < TICKS; t++) { const tk = p.stepVblankOnce(); for (let v = 0; v < 4; v++) nat[v].push(paulaAudxVol(tk.voices[v].outVolume & 0xff)); }

    const perVoice = ov.map(holdForward);
    const witnesses: { voice: number; shift: number; start: number; window: number }[] = [];
    for (let v = 0; v < 4; v++) {
      let best = { shift: 0, start: 0, window: 0 };
      for (let shift = -2; shift <= 2; shift++) {
        let runStart = -1;
        for (let t = 0; t < TICKS; t++) {
          const ot = t + shift;
          const ok = ot >= 0 && ot < TICKS && perVoice[v][ot] >= 0 && nat[v][t] === perVoice[v][ot];
          if (ok) { if (runStart < 0) runStart = t; const w = t - runStart + 1; if (w > best.window) best = { shift, start: runStart, window: w }; }
          else runStart = -1;
        }
      }
      const win = nat[v].slice(best.start, best.start + best.window);
      const isRamp = win.length > 1 && !win.every((x) => x === win[0]);
      if (best.window >= MIN_WINDOW && isRamp) witnesses.push({ voice: v, ...best });
    }
    modules.push({ name, bytesB64: Buffer.from(data).toString('base64'), ticks: TICKS, perVoice, witnesses });
    console.log(`${name}: witnesses=${witnesses.map((w) => `v${w.voice}(shift${w.shift},start${w.start},win${w.window})`).join(' ') || 'NONE'}`);
    for (const w of witnesses) console.log(`   v${w.voice} oracle[${w.start + w.shift}..]: ${perVoice[w.voice].slice(w.start + w.shift, w.start + w.shift + w.window).join(',')}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generated: 'gen-master-fade-oracle.ts', regVol: REG_VOL, modules }, null, 1));
  console.log(`wrote ${OUT} (${modules.length} modules)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
