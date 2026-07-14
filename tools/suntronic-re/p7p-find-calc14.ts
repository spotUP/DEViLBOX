/**
 * p7p-find-calc14.ts — locate the CALC14 feedback loop in the LOADED replayer code by
 * opcode signature, so captures can be filtered to the real feedback PC range.
 *
 * CALC14 body signatures (from DP_Suntronic.s):
 *   MULS D3,D1 ; SWAP D1  = C3 C3 48 41
 *   MULS D2,D5 ; SWAP D5  = CB C2 48 45
 * Dump a wide chip-RAM window and scan for both.
 *
 * Usage: npx tsx tools/suntronic-re/p7p-find-calc14.ts [module.src] [lo] [hi]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hx = (n: number): string => '0x' + (n >>> 0).toString(16);

function findSig(buf: Uint8Array, base: number, sig: number[]): number[] {
  const hits: number[] = [];
  for (let i = 0; i + sig.length <= buf.length; i++) {
    let ok = true;
    for (let j = 0; j < sig.length; j++) if (buf[i + j] !== sig[j]) { ok = false; break; }
    if (ok) hits.push(base + i);
  }
  return hits;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'we_music_two.src';
  const lo = parseInt(process.argv[3] ?? '0x10000', 16);
  const hi = parseInt(process.argv[4] ?? '0x40000', 16);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);
  // render a few ticks so player is resident
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4);
  for (let c = 0; c < 4; c++) mod._uade_wasm_render(L, R, 882);
  mod._free(L); mod._free(R);

  const len = hi - lo;
  const out = mod._malloc(len);
  const n = mod._uade_wasm_read_memory(lo, out, len);
  const buf = mod.HEAPU8.slice(out, out + len);
  mod._free(out);
  console.log(`[p7p] ${name} dumped ${hx(lo)}..${hx(hi)} (rc=${n}) nonzero=${buf.some((b: number) => b !== 0)}`);
  const s1 = findSig(buf, lo, [0xc3, 0xc3, 0x48, 0x41]); // MULS D3,D1 ; SWAP D1
  const s2 = findSig(buf, lo, [0xcb, 0xc2, 0x48, 0x45]); // MULS D2,D5 ; SWAP D5
  console.log(`   MULS D3,D1;SWAP D1  @ ${s1.map(hx).join(', ') || '(none)'}`);
  console.log(`   MULS D2,D5;SWAP D5  @ ${s2.map(hx).join(', ') || '(none)'}`);
  // also the DIVU coeff setup: MOVE.L #$000FFFE0,D2 = 24 3C 00 0F FF E0
  const s3 = findSig(buf, lo, [0x24, 0x3c, 0x00, 0x0f, 0xff, 0xe0]);
  console.log(`   MOVE.L #$FFFE0,D2   @ ${s3.map(hx).join(', ') || '(none)'}`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
