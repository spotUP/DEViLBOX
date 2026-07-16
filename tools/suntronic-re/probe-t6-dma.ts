/**
 * probe-t6-dma.ts — Gate C.0: read the REAL wave bytes UADE feeds Paula for the
 * type-6 lead voice, via the clean-build channel-extended + read_memory ABI.
 *
 * For each render chunk: snapshot channel 0 (voice 0 = the t6 lead) DMA start
 * (lc), len (words), per, vol; read `len*2` bytes from chip RAM at lc. Print a
 * fingerprint + whether those bytes appear verbatim anywhere in hunk1 (would
 * mean the wave IS a static hunk1 region we can slice) or are runtime-generated
 * (voice play buffer / BSS scratch → not disk-sliceable).
 *
 * Clean build only: _uade_wasm_get_channel_extended (8 u32/ch) + read_memory.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule, type UADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseHunks } from '../../src/lib/import/formats/SunTronicV13';

interface ExtMod extends UADEModule {
  _uade_wasm_get_channel_extended(out: number): void;
  _uade_wasm_read_memory(addr: number, out: number, len: number): number;
}

const hex = (b: Uint8Array): string => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');

function findInHunk(pattern: Uint8Array, hay: Uint8Array): number {
  if (pattern.length === 0) return -1;
  outer: for (let i = 0; i + pattern.length <= hay.length; i++) {
    for (let j = 0; j < pattern.length; j++) if (hay[i + j] !== pattern[j]) continue outer;
    return i;
  }
  return -1;
}

async function main(): Promise<void> {
  const name = 'gliders.src';
  const sampleRate = 44100;
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const h1 = parseHunks(data).hunks[1].data;

  const mod = (await loadUADEModule(false)) as ExtMod;
  if (mod._uade_wasm_init(sampleRate) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const fptr = mod._malloc(data.byteLength);
  mod.HEAPU8.set(data, fptr);
  const hlen = name.length * 4 + 1;
  const hptr = mod._malloc(hlen);
  mod.stringToUTF8(name, hptr, hlen);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(fptr, data.byteLength, hptr) !== 0) throw new Error('load failed');
  mod._free(fptr); mod._free(hptr);

  const CHUNK = 512; // small chunks → fine tick granularity
  const L = mod._malloc(CHUNK * 4), R = mod._malloc(CHUNK * 4);
  const ext = mod._malloc(4 * 8 * 4);
  const bufPtr = mod._malloc(4096);
  const seen = new Set<string>();
  let chunks = 0;

  while (chunks < 400) {
    if (mod._uade_wasm_render(L, R, CHUNK) <= 0) break;
    mod._uade_wasm_get_channel_extended(ext);
    const u = new Uint32Array(mod.HEAPU8.buffer, ext, 32);
    for (let ch = 0; ch < 1; ch++) { // voice 0 = t6 lead
      const per = u[ch * 8 + 0], vol = u[ch * 8 + 1], dma = u[ch * 8 + 2];
      const lc = u[ch * 8 + 3], len = u[ch * 8 + 5];
      if (!dma || len === 0 || len > 2048 || vol === 0) continue;
      mod._uade_wasm_read_memory(lc, bufPtr, len * 2);
      const bytes = new Uint8Array(mod.HEAPU8.buffer.slice(bufPtr, bufPtr + len * 2));
      const key = hex(bytes.subarray(0, 32));
      if (seen.has(key)) continue;
      seen.add(key);
      const at = findInHunk(bytes, h1);
      console.log(
        `chunk${chunks} ch${ch} per=${per} vol=${vol} len=${len}w lc=0x${lc.toString(16)} inHunk1=${at >= 0 ? at : 'NO'} first16=${hex(bytes.subarray(0, 16))}`,
      );
      if (seen.size > 12) break;
    }
    chunks++;
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
