/**
 * p7o-capture-coeffs.ts — capture the LIVE D2/D3 filter coefficients (and D0/D1/D5) at
 * the moment the CALC14 loop writes the first byte of a feedback buffer. Compares the
 * real d2v/d3v to my derived values to localize the Gate-1 math bug.
 *
 * Usage: npx tsx tools/suntronic-re/p7o-capture-coeffs.ts [module.src] [hexAddr] [tick]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);
const w16 = (x: number): number => (x << 16) >> 16;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'we_music_two.src';
  const addr = parseInt(process.argv[3] ?? '0x27018', 16);
  const wantTick = parseInt(process.argv[4] ?? '1', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4);
  for (let c = 0; c <= wantTick; c++) {
    mod._uade_wasm_arm_capture(addr, 2);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (c !== wantTick) continue;
    const hit = mod._uade_wasm_get_capture(cap);
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    console.log(`[p7o] ${name} tick${c} arm=${hx(addr)} hit=${hit} hitAddr=${hx(r[17])} PC=${hx(r[16])}`);
    console.log(`   D0=${hx(r[0])} D1=${hx(r[1])} D2=${hx(r[2])} D3=${hx(r[3])} D4=${hx(r[4])} D5=${hx(r[5])}`);
    console.log(`   A2=${hx(r[10])} A3=${hx(r[11])} A4=${hx(r[12])}`);
    console.log(`   D2.w=${hx(r[2] & 0xffff)} D3.w=${hx(r[3] & 0xffff)} (real d2v/d3v as signed: ${w16(r[2] & 0xffff)} / ${w16(r[3] & 0xffff)})`);
  }
  mod._free(L); mod._free(R); mod._free(cap);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
