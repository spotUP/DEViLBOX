/**
 * probe-drin-file.ts — locate each module's drin table inside its own file by
 * reading the true drin from loaded RAM (scan for the arp-row signature) then
 * searching the raw file bytes for that content, to find drin's real file offset
 * / anchor for a reloc-safe locator. NOT committed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

async function run(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4);
  for (let i = 0; i < 4; i++) mod._uade_wasm_render(L, R, 882);

  // The period lookup reads drin[d5] with d5 = (arpSel<<4)+phase. Row0 (d5 0..15)
  // is the non-arp row. Read 256 drin bytes from where the code's `lea (pc),a3`
  // points — but we don't know that per module. Instead brute-locate: read a wide
  // RAM window and pull the 32 bytes AFTER the PERIODS ramp end (PERIODS is 320
  // words; drin is elsewhere). Simpler: just report the true drin[0..32) by reading
  // relative to the located PERIODS in RAM at several candidate gaps and matching
  // the file. Here we just dump: PERIODS abs, and search file for any 24-byte run
  // that appears right after we identify drin from the running player is hard —
  // so instead confirm drin[0..16)==0 assumption by reading golden.
  const score = parseSunTronicV13Score(data);
  const periodsOff = (score as any).periodsOff as number;
  // find PERIODS abs in RAM
  const BASE = 0x10000, LEN = 0x60000;
  const scan = mod._malloc(LEN);
  mod._uade_wasm_read_memory(BASE, scan, LEN);
  const SIG = [428, 453, 480, 508];
  let pAbs = -1;
  for (let a = 0; a + 8 <= LEN; a += 2) {
    let ok = true;
    for (let i = 0; i < 4; i++) { const w = (mod.HEAPU8[scan + a + i * 2] << 8) | mod.HEAPU8[scan + a + i * 2 + 1]; if (w !== SIG[i]) { ok = false; break; } }
    if (ok) { pAbs = BASE + a; break; }
  }
  // base = pAbs - (periodsOff+0x40)  (periodsOff points to PERIODS[0]; sig at +0x40)
  const loadBase = pAbs - periodsOff;
  console.log(`${name}: periodsOff=${periodsOff.toString(16)} pAbs=${pAbs.toString(16)} loadBase=${loadBase.toString(16)} fileLen=${data.length.toString(16)}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

(async () => {
  for (const m of process.argv.slice(2).length ? process.argv.slice(2) : ['gliders.src', 'darkness.src']) await run(m);
})().catch((e) => { console.error(e); process.exit(1); });
