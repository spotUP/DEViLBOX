/**
 * gen-slide-oracle.ts — bake the $0D vol-slide CADENCE lockstep fixture.
 *
 * Bug (2026-07-17): native applied the $0D vol-slide EVERY vblank tick. The real
 * embedded player gates it with a per-voice $32/$33 counter (kompo04.dis 0x6f4 /
 * myplay9.dis 0x6ea): the slide advances only once every ($32+1) ticks. Native
 * ran ~rate× too fast, driving decays to 0 that UADE holds. The $32 rate operand
 * is VERSION-DEPENDENT and INDEPENDENT of arpShift:
 *   - 2-byte 0x9a (`11 59 00 0d 11 59`): rate read from the stream (kompo05).
 *   - 1-byte 0x9a (`11 59 00 0d 11 7c`): rate hardwired to 1 → step every 2 ticks
 *     (sound2 — 5,6,6,7,7,8,...).
 * This captures per-tick UADE AUD{n}VOL and marks WITNESS voices — voices with an
 * ACTIVE slide (nonzero volumeSlide) whose oracle VOL is NON-CONSTANT (the slide
 * moves it, so reverting the gate changes the ramp) AND, after best phase-align,
 * native matches byte-exact over a window. UADE's first render buffer carries no
 * writes (1-tick startup lag) and the still-deferred Paula-DMA scheduler drift
 * (882 vs 882.759 samples/vblank) slips long ramps by a tick after ~a dozen ticks;
 * both are the same phase axis the corpus probe handles with best-shift −2..2, so
 * per witness we bake the best `shift` and the max byte-exact `window`. Reverting
 * to the ungated every-tick slide makes the ramps too steep → the window breaks.
 *
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/gen-slide-oracle.ts
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
const MIN_WINDOW = 8; // require ≥8 byte-exact settled ticks to accept a witness
// sound2.s = 1-byte 0x9a (rate hardwired to 1); kompo05.src = 2-byte 0x9a (rate
// from stream). Both exercise a stepped vol-slide ramp → cover both variants.
const MODULES = ['sound2.s', 'kompo05.src'];
const OUT = join(process.cwd(), 'src/engine/suntronic/__fixtures__/suntronicVolSlideOracle.json');

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
    const hadSlide = [false, false, false, false];
    for (let t = 0; t < TICKS; t++) {
      const tk = p.stepVblankOnce();
      for (let v = 0; v < 4; v++) {
        nat[v].push(paulaAudxVol(tk.voices[v].outVolume & 0xff));
        if ((p.voices[v].volumeSlide & 0xff) !== 0) hadSlide[v] = true;
      }
    }

    const perVoice = ov.map(holdForward);
    // For a native tick t, the aligned oracle tick is t+shift. Find, per voice, the
    // shift (−2..2) and starting tick that give the longest run of byte-exact,
    // settled ticks; accept as witness if the run ≥ MIN_WINDOW and is non-constant.
    const witnesses: { voice: number; shift: number; start: number; window: number }[] = [];
    for (let v = 0; v < 4; v++) {
      if (!hadSlide[v]) continue;
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
    modules.push({
      name,
      bytesB64: Buffer.from(data).toString('base64'),
      ticks: TICKS,
      volSlideRateFromStream: score.volSlideRateFromStream,
      perVoice,
      witnesses,
    });
    console.log(`${name}: rateFromStream=${score.volSlideRateFromStream} witnesses=${witnesses.map((w) => `v${w.voice}(shift${w.shift},start${w.start},win${w.window})`).join(' ') || 'NONE'}`);
    for (const w of witnesses) console.log(`   v${w.voice} oracle[${w.start + w.shift}..]: ${perVoice[w.voice].slice(w.start + w.shift, w.start + w.shift + w.window).join(',')}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generated: 'gen-slide-oracle.ts', regVol: REG_VOL, modules }, null, 1));
  console.log(`wrote ${OUT} (${modules.length} modules)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
