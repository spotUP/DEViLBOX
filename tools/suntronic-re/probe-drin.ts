/**
 * probe-drin.ts — read the REAL drin table from loaded WASM memory at the
 * disasm-confirmed address (gliders drin abs = 0x2828b, `lea (6733,pc),a3`
 * @0x2683c) and locate that content in h1, to derive the true PERIODS→drin file
 * gap (the prior 0xc01 was validated only on gliders' all-zero region). NOT committed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const drinAbs = parseInt(process.argv[3] ?? '2828b', 16);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4);
  mod._uade_wasm_render(L, R, 882); // let init settle + relocation happen
  const rd = mod._malloc(64);
  mod._uade_wasm_read_memory(drinAbs >>> 0, rd, 32);
  const drin: number[] = [];
  for (let i = 0; i < 32; i++) { const b = mod.HEAPU8[rd + i]; drin.push(b > 127 ? b - 256 : b); }
  console.log(`${name} drin@${drinAbs.toString(16)} =`, drin.join(' '));

  // Find PERIODS' loaded address by scanning WASM mem for the ramp signature
  // (428,453,480,508 = big-endian words), then the absolute drin gap is a
  // replayer constant: drinFileOff = periodsOff + (drinAbs - periodsAbs).
  const SIG = [428, 453, 480, 508];
  const scan = mod._malloc(0x40000);
  mod._uade_wasm_read_memory(0x20000, scan, 0x40000);
  let periodsAbs = -1;
  for (let a = 0; a + SIG.length * 2 <= 0x40000; a += 2) {
    let ok = true;
    for (let i = 0; i < SIG.length; i++) {
      const w = (mod.HEAPU8[scan + a + i * 2] << 8) | mod.HEAPU8[scan + a + i * 2 + 1];
      if (w !== SIG[i]) { ok = false; break; }
    }
    if (ok) { periodsAbs = 0x20000 + a; break; }
  }
  const score = parseSunTronicV13Score(data);
  const periodsOff = (score as any).periodsOff;
  const absGap = drinAbs - periodsAbs;
  const drinFileOff = periodsOff + absGap;
  console.log(`  periodsAbs=${periodsAbs.toString(16)} periodsOff=${periodsOff.toString(16)} absGap=${absGap.toString(16)} drinFileOff=${drinFileOff.toString(16)}`);
  const h1 = score.h1;
  const h1drin: number[] = [];
  for (let i = 0; i < 32; i++) { const b = h1[drinFileOff + i] & 0xff; h1drin.push(b > 127 ? b - 256 : b); }
  console.log(`  h1[drinFileOff..+32] =`, h1drin.join(' '));
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
