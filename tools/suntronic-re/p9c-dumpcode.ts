/**
 * p9c-dumpcode.ts — dump the loaded 68k code bytes of the type-1 pulse handler
 * region so it can be disassembled (capstone). The capture ABI cannot land on the
 * body PC, so we read the code directly and disassemble offline.
 *
 * Writes raw bytes of [start,end) to scratch as hex + a little-loader note.
 * Usage: npx tsx tools/suntronic-re/p9c-dumpcode.ts [module] [startHex] [endHex]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'kompo03.src';
  const start = parseInt(process.argv[3] ?? '0x26c40', 16);
  const end = parseInt(process.argv[4] ?? '0x26da0', 16);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  // render a bit so code is definitely present
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4);
  for (let i = 0; i < 20; i++) mod._uade_wasm_render(L, R, 882);
  mod._free(L); mod._free(R);
  const n = end - start;
  const rd = mod._malloc(n);
  mod._uade_wasm_read_memory(start, rd, n);
  const bytes = mod.HEAPU8.slice(rd, rd + n);
  mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  const outPath = '/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/cf232eb4-711a-4619-9b4b-5f6dd22d3425/scratchpad/pulsecode.hex';
  writeFileSync(outPath, `${start.toString(16)}\n${hex}\n`);
  console.log(`[p9c] dumped 0x${start.toString(16)}..0x${end.toString(16)} (${n} bytes) -> ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
