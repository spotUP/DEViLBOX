/**
 * probe-mastervol.ts — is masterVolA/B a live 1:1 gap, or identity in the corpus?
 *
 * The native player computes AUDxVOL as a single stage: outVolume = env*voiceVol>>6
 * (SunTronicPlayer.ts:448). The LOADED replayer (disasm 0x267f6) does two extra
 * global-scale multiplies: *masterVolA($a8d)>>6, *masterVolB($a8e)>>6. If both
 * master words sit at 0x40 (identity for >>6) the single stage is byte-exact and
 * the "stub" is inert; if a global fade drives them off 0x40, native volume drifts.
 *
 * This renders the UADE oracle, captures per-tick AUD{n}VOL (paula log reg 8), and
 * diffs it against native v.outVolume per voice — the decisive measurement before
 * deciding whether to port.
 *
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-mastervol.ts [module...]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const REG_VOL = 4; // PAULA_REG_VOL (paula_log.h) — AUDxVOL 0..64
const TICKS = 200;
const DEFAULT_MODULES = ['ready', 'darkness.src', 'suntronic-k2.src', 'ballblaser.src', 'gliders.src'];

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

async function main(): Promise<void> {
  const modules = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODULES;
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());

  for (const name of modules) {
    const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
    const ov = await oracleVol(mod, name, data);
    const score = parseSunTronicV13Score(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new (SunTronicPlayer as any)(score);
    const nat: number[][] = [[], [], [], []];
    for (let t = 0; t < TICKS; t++) { const tk = p.stepVblankOnce(); for (let v = 0; v < 4; v++) nat[v].push(tk.voices[v].outVolume); }

    for (let v = 0; v < 4; v++) {
      // hold-forward oracle (Paula holds last VOL write)
      let held = -1; const oh = ov[v].map((x) => (x >= 0 ? (held = x) : held));
      let n = 0, exact = 0, maxAbs = 0, sumOracle = 0, sumNative = 0;
      for (let t = 0; t < TICKS; t++) {
        if (oh[t] < 0) continue; n++;
        const d = Math.abs(nat[v][t] - oh[t]);
        if (d === 0) exact++; if (d > maxAbs) maxAbs = d;
        sumOracle += oh[t]; sumNative += nat[v][t];
      }
      if (n === 0) continue;
      const ratio = sumNative > 0 ? (sumOracle / sumNative) : 0;
      console.log(`${name.padEnd(18)} v${v}: exact ${exact}/${n} maxΔ=${maxAbs} meanOracle=${(sumOracle/n).toFixed(1)} meanNative=${(sumNative/n).toFixed(1)} ratio=${ratio.toFixed(3)}`);
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
