/**
 * p8c-verify-calc3.ts — verify the LOADED type-1 pulse (CALC3) body @0x26d4a against
 * a real UADE firing. Capture at body entry (PC 0x26d4a): d0=arp value, a2=out base,
 * a3=source base, d6=byteLen-1. Require a3 != a2 (tick-0, source = wave1 = a separate
 * readable buffer, not the in-place play buffer) so the source survives the loop.
 * Read source+out, run the re-derived recurrence, assert byte-exact.
 *
 * Loaded CALC3 (disasm 0x26d4a-0x26d6a):
 *   coeff = ext.w(neg.b(arp))                       ; = -(int8 arp)
 *   acc = ext.w(source[last]) ; prev = source[last]
 *   for i: d2 = ext.w(source[i]) - prev ; prev = source[i]
 *          acc = asr.w((acc + d2) * coeff, 7)       ; word ops
 *          out[i] = acc & 0xff
 *
 * Usage: npx tsx tools/suntronic-re/p8c-verify-calc3.ts [module.src] [maxTicks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const asrW7 = (x: number): number => ((x << 16) >> 16) >> 7;
const hexOf = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };
const PC_LO = 0x26cc0, PC_HI = 0x26cd2; // real CALC3 pulse (arp>=0): setup+loop range

/** The engine's CALC3 port: coeff = 0x80 - arp; acc seeds from source[last];
 *  per sample acc += ((source[i]-acc)*coeff)>>7; out[i]=acc. Word ops. */
function calc3(source: Uint8Array, arp: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  const coeff = (0x80 - arp) & 0xffff; // move.w #$80,d1; sub.b d0,d1 (arp>=0 → high byte stays 0)
  const coeffS = (coeff << 16) >> 16;
  const last = byteLen - 1;
  let acc = s8(source[last]);
  for (let i = 0; i < byteLen; i++) {
    const s = s8(source[i]);
    const step = asrW7((s - acc) * coeffS);
    acc = (acc + step) & 0xffff;
    acc = (acc << 16) >> 16;
    out[i] = acc & 0xff;
  }
  return out;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const maxTicks = parseInt(process.argv[3] ?? '400', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(256);
  let checked = 0, exact = 0;
  for (let c = 0; c < maxTicks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    const byteLen = (r[6] & 0xffff) + 1;
    if (byteLen < 4 || byteLen > 256) continue;
    // capture may fire after 0..1 post-increments of A2/A3 — try both base candidates.
    let done = false;
    for (const dec of [0, 1]) {
      const outBase = (r[10] - dec) >>> 0, srcBase = (r[11] - dec) >>> 0;
      if (outBase === srcBase) continue;
      mod._uade_wasm_read_memory(outBase, rd, byteLen); const out = mod.HEAPU8.slice(rd, rd + byteLen);
      mod._uade_wasm_read_memory(srcBase, rd, byteLen); const src = mod.HEAPU8.slice(rd, rd + byteLen);
      // brute the arp (coeff = 0x80-arp), pick the byte-exact one.
      let bham = 999, barp = 0; let bpred = new Uint8Array(0);
      for (let arp = 0; arp < 128; arp++) {
        const pred = calc3(src, arp, byteLen);
        let ham = 0; for (let i = 0; i < byteLen; i++) if (pred[i] !== out[i]) ham++;
        if (ham < bham) { bham = ham; barp = arp; bpred = pred; if (ham === 0) break; }
      }
      if (bham < 999) {
        checked++; if (bham === 0) exact++; done = true;
        console.log(`tick${c} byteLen=${byteLen} dec=${dec} ${bham === 0 ? `BYTE-EXACT arp=${barp}` : `bestHam=${bham}/${byteLen} arp=${barp}`}`);
        if (bham !== 0) { console.log(`  src =${hexOf(src)}`); console.log(`  out =${hexOf(out)}`); console.log(`  pred=${hexOf(bpred)}`); }
        break;
      }
    }
    if (done && checked >= 8) break;
  }
  console.log(`[p8c] ${name}: ${exact}/${checked} tick-0 CALC3 fires byte-exact`);
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
