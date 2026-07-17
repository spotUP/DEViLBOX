/**
 * gen-vol-oracle.ts — bake the Paula AUDxVOL clamp lockstep fixture.
 *
 * The native player computes $15 = env*voiceVol>>6 (can reach 0x40=64); real Paula
 * caps AUDxVOL at 63 (audio.c:808 `v & 64 ? 63 : v & 63`). Native previously used
 * min(64,v) → loud voices one LSB hot. This captures per-tick UADE AUD{n}VOL and
 * marks WITNESS voices — voices whose oracle VOL is STATIC (no envelope motion, so
 * the still-deferred Paula-DMA scheduler drift cannot contaminate them) AND hits 63
 * at least once (so the 64→63 clamp is exercised). The regression asserts native,
 * after `paulaAudxVol`, equals the oracle byte-exact on those voices; reverting to
 * min(64,v) makes the 63 ticks read 64 → fail.
 *
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/gen-vol-oracle.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';
import { paulaAudxVol } from '../../src/engine/suntronic/SunTronicNativeRender';

const REG_VOL = 4;
const TICKS = 200;
// suntronic-k2 = Version-A (all 4 voices static loud); darkness = Main (static
// loud voices v0/v2/v3). Both hit 63 → exercise the clamp on both driver versions.
const MODULES = ['suntronic-k2.src', 'darkness.src'];
const OUT = join(process.cwd(), 'src/engine/suntronic/__fixtures__/suntronicVolOracle.json');

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
    const witnesses: number[] = [];
    for (let v = 0; v < 4; v++) {
      const oh = perVoice[v];
      const settled = oh.filter((x) => x >= 0);
      const isStatic = settled.length > 0 && settled.every((x) => x === settled[0]);
      const hits63 = settled.some((x) => x === 63);
      const exact = oh.every((x, t) => x < 0 || nat[v][t] === x);
      if (isStatic && hits63 && exact) witnesses.push(v);
    }
    modules.push({ name, bytesB64: Buffer.from(data).toString('base64'), ticks: TICKS, perVoice, witnesses });
    console.log(`${name}: witnesses=${witnesses.join(',') || 'NONE'}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generated: 'gen-vol-oracle.ts', regVol: REG_VOL, modules }, null, 1));
  console.log(`wrote ${OUT} (${modules.length} modules)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
