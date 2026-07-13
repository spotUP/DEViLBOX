/**
 * p7u-verify-calc14.ts — verify the CORRECTED CALC13/14 math against a real firing.
 * Finds first CALC14 fire (PC-filtered capture at 0x26dc8 loop), reads out+wave1 buffers
 * via read_memory, brute-forces d0 param + seed to find a byte-exact match.
 *
 * CORRECTED loop (from loaded disasm 0x26dc8):
 *   divisor = (d0 & 0xff) + 0x20
 *   d2v = (0xfffe0 / divisor) - (0x26 * s16(d0))        [16-bit]
 *   d3v = ((0x7fff - d2v) * byteLen) >> 8                [32-bit product, LSR.L #8]
 *   seed A4[last],A4[last-1]: A4 = wave1 (first pass) or out (in-place)
 *   d0acc = s8(A4[last])<<7 ;  d1w = s8(A4[last]-A4[last-1])<<7
 *   per sample i:
 *     d1w = rol1_32( swap32( muls(d3v, d1w) ) ) & 0xffff
 *     t   = (s8(wave1[i])<<7 - d0acc) & 0xffff
 *     t   = rol1_32( swap32( muls(d2v, t) ) ) & 0xffff
 *     d1w = (d1w + t) & 0xffff ; d0acc = (d0acc + d1w) & 0xffff
 *     out[i] = (d0acc & 0xffff) >>> 7   (logical) & 0xff
 *
 * Usage: npx tsx tools/suntronic-re/p7u-verify-calc14.ts [module.src] [maxTicks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const s16 = (x: number): number => (x << 16) >> 16;
const hexOf = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };
const PC_LO = 0x26e08, PC_HI = 0x26e3a;

function muls(a: number, b: number): number { return (s16(a) * s16(b)) >>> 0; } // 32-bit unsigned repr of signed product
function swapRol(p32: number): number {
  let x = (((p32 << 16) | (p32 >>> 16)) >>> 0);      // SWAP
  x = (((x << 1) | (x >>> 31)) >>> 0);               // ROL.L #1
  return x & 0xffff;                                  // low word
}

/** Run the loop with EXPLICIT d2v/d3v coefficients (captured from the replayer). */
export function calc14coef(seedLast: number, seedPrev: number, wave1: Uint8Array, d2v: number, d3v: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  let d0 = (s8(seedLast) << 7) & 0xffff;
  let d1w = (s8((seedLast - seedPrev) & 0xff) << 7) & 0xffff;
  for (let i = 0; i < byteLen; i++) {
    d1w = swapRol(muls(d3v, d1w));
    let t = ((s8(wave1[i]) << 7) - d0) & 0xffff;
    t = swapRol(muls(d2v, t));
    d1w = (d1w + t) & 0xffff;
    d0 = (d0 + d1w) & 0xffff;
    out[i] = (d0 & 0xffff) >>> 7 & 0xff;
  }
  return out;
}

export function calc14(seedLast: number, seedPrev: number, wave1: Uint8Array, d0param: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  const divisor = (d0param & 0xff) + 0x20; if (divisor === 0) return out;
  const extd0 = s8(d0param) & 0xffff;                                   // EXT.W of pitch byte
  const term = (0x26 * extd0) & 0xffff;                                 // MULU.W, low word
  const d2v = ((Math.floor(0xfffe0 / divisor) & 0xffff) - term) & 0xffff;
  const d3v = (((0x7fff - d2v) & 0xffff) * byteLen >>> 8) & 0xffff;     // MULU.W byteLen, LSR.L #8
  let d0 = (s8(seedLast) << 7) & 0xffff;
  let d1w = (s8((seedLast - seedPrev) & 0xff) << 7) & 0xffff;
  for (let i = 0; i < byteLen; i++) {
    d1w = swapRol(muls(d3v, d1w));
    let t = ((s8(wave1[i]) << 7) - d0) & 0xffff;
    t = swapRol(muls(d2v, t));
    d1w = (d1w + t) & 0xffff;
    d0 = (d0 + d1w) & 0xffff;
    out[i] = (d0 & 0xffff) >>> 7 & 0xff;
  }
  return out;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'kompo02.src';
  const maxTicks = parseInt(process.argv[3] ?? '150', 10);
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
  for (let c = 0; c < maxTicks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    const byteLen = (r[6] & 0xffff) + 1;
    const outBase = (r[10] - 1) >>> 0;    // A2-1
    const wave1Base = (r[11] - 1) >>> 0;   // A3-1
    mod._uade_wasm_read_memory(outBase, rd, byteLen);
    const out = mod.HEAPU8.slice(rd, rd + byteLen);
    mod._uade_wasm_read_memory(wave1Base, rd, byteLen);
    const wave1 = mod.HEAPU8.slice(rd, rd + byteLen);
    const d2vCap = r[2] & 0xffff, d3vCap = r[3] & 0xffff;
    const d3vComp = (((0x7fff - d2vCap) & 0xffff) * byteLen >>> 8) & 0xffff;
    console.log(`[p7u] ${name} tick${c} byteLen=${byteLen} outBase=0x${outBase.toString(16)} wave1Base=0x${wave1Base.toString(16)} inPlace=${((r[12] >>> 0) === outBase)}`);
    console.log(`   capturedD2(d2v)=0x${d2vCap.toString(16)} capturedD3=0x${d3vCap.toString(16)} computedD3v(from d2v,len)=0x${d3vComp.toString(16)}`);
    console.log(`   wave1=${hexOf(wave1)}`);
    console.log(`   out  =${hexOf(out)}`);
    // Use captured d2v + computed d3v; brute the 2-byte seed only.
    for (const d3vTry of [d3vComp, d3vCap]) {
      let b = { ham: 999, sl: 0, sp: 0, pred: new Uint8Array(0) };
      for (let sl = 0; sl < 256 && b.ham > 0; sl++)
        for (let sp = 0; sp < 256; sp++) {
          const pred = calc14coef(sl, sp, wave1, d2vCap, d3vTry, byteLen);
          let ham = 0; for (let i = 0; i < byteLen; i++) if (pred[i] !== out[i]) { ham++; if (ham >= b.ham) break; }
          if (ham < b.ham) { b = { ham, sl, sp, pred }; if (ham === 0) break; }
        }
      console.log(`   [d3v=0x${d3vTry.toString(16)}] ${b.ham === 0 ? 'BYTE-EXACT' : `bestHam=${b.ham}/${byteLen}`} seed=${b.sl.toString(16)},${b.sp.toString(16)} pred=${hexOf(b.pred)}`);
    }
    break;
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
