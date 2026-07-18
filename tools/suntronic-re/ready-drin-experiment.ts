/**
 * ready-drin-experiment.ts — decisive test: does feeding UADE's real drin table
 * into the native player fix voices 2/3 on `ready`? Reads drin from UADE RAM
 * (gap-located from gliders' PERIODS), renders native both ways, reports fidelity.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, INSTR_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../../src/engine/suntronic/SunTronicNativeRender';
import { voiceFidelity } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';
import { existsSync } from 'fs';

type AnyMod = any;
const SIG = [428, 453, 480, 508];
function findPeriods(mod: AnyMod): number {
  const scan = mod._malloc(0x80000);
  mod._uade_wasm_read_memory(0x20000, scan, 0x80000);
  for (let a = 0; a + SIG.length * 2 <= 0x80000; a += 2) {
    let ok = true;
    for (let i = 0; i < SIG.length; i++) { const w = (mod.HEAPU8[scan + a + i * 2] << 8) | mod.HEAPU8[scan + a + i * 2 + 1]; if (w !== SIG[i]) { ok = false; break; } }
    if (ok) return 0x20000 + a;
  }
  return -1;
}
async function loadSong(name: string): Promise<AnyMod> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load ' + name);
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4);
  for (let i = 0; i < 40; i++) mod._uade_wasm_render(L, R, 882);
  return mod;
}
function readDrin(mod: AnyMod, abs: number): Int8Array {
  const rd = mod._malloc(256); mod._uade_wasm_read_memory(abs >>> 0, rd, 256);
  const o = new Int8Array(256);
  for (let i = 0; i < 256; i++) { const b = mod.HEAPU8[rd + i]; o[i] = b > 127 ? b - 256 : b; }
  return o;
}
async function main() {
  const name = process.env.SONG ?? 'ready';
  const seconds = 12;
  // gap from gliders
  const g = await loadSong('gliders.src'); const pg = findPeriods(g); const gap = 0x2828b - pg;
  try { g._uade_wasm_cleanup(); } catch {}
  const r = await loadSong(name); const pr = findPeriods(r); const drinAbs = pr + gap;
  const drin = readDrin(r, drinAbs);
  console.log(`${name} drinAbs=0x${drinAbs.toString(16)}  row0=[${Array.from(drin.subarray(0, 16)).join(',')}]`);
  try { r._uade_wasm_cleanup(); } catch {}

  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const slotPcm = score.instrumentNames.map((n: string) => {
    const p = join(INSTR_DIR, n); return existsSync(p) ? new Int8Array(readFileSync(p)) : null;
  });
  const oracle = await renderUADEPerVoice(name, { seconds });
  const before = renderSunTronicMix(score, slotPcm, { seconds });
  const after = renderSunTronicMix(score, slotPcm, { seconds, drin });
  console.log(`\nvoice | fid(zero-drin) | fid(real-drin)`);
  for (let v = 0; v < 4; v++) {
    const fb = voiceFidelity(before.ch[v], oracle.ch[v]).median;
    const fa = voiceFidelity(after.ch[v], oracle.ch[v]).median;
    console.log(`  ${v}   |   ${fb.toFixed(3)}        |   ${fa.toFixed(3)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
