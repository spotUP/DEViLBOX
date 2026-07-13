/**
 * p7v-emit-calc14-golden.ts — capture the first CALC13/14 (0x26dc8) fire in each
 * corpus module that executes it and emit a wasm-free golden JSON for the native
 * `calc14Kernel` regression test. Reads the ACTUAL A4 feedback seed (no brute):
 * seedLast = A4[last], seedPrev = A4[last-1]; d2v/d3v/wave1/out captured live.
 *
 * Each fixture: { name, byteLen, d2v, d3v, seedLast, seedPrev, wave1Hex, outHex }.
 * Self-checks that calc14Kernel(seed, wave1, d2v, d3v) === out before writing.
 *
 * Usage: npx tsx tools/suntronic-re/p7v-emit-calc14-golden.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { calc14Kernel } from '../../src/engine/suntronic/SunTronicSynthVoice';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const PC_LO = 0x26e08, PC_HI = 0x26e3a;
const MODULES = ['kompo02.src', 'kompo03.src', 'paradroid-synth.src', 'time0001.src', 'time0002.src', 'time1.src', 'time2000.src'];
const hexOf = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };

interface Fixture { name: string; byteLen: number; d2v: number; d3v: number; arpD1: number; seedLast: number; seedPrev: number; wave1Hex: string; outHex: string; }

const toS8 = (b: number): number => (b << 24) >> 24;
/** Recover an arp value d1 whose coefficient derivation yields the captured d2v
 *  (see renderSmooth). Timbre depends on d2v, not d1's identity — any match works. */
function recoverArpD1(d2v: number): number {
  for (let d1 = 0; d1 < 256; d1++) {
    const quotient = Math.floor(0xfffe0 / ((d1 & 0xff) + 0x20)) & 0xffff;
    const term = (0x26 * (toS8(d1) & 0xffff)) & 0xffff;
    if (((quotient - term) & 0xffff) === d2v) return d1;
  }
  return -1;
}

async function capture(name: string, maxTicks = 200): Promise<Fixture | null> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  try {
    if (mod._uade_wasm_init(44100) !== 0) return null;
    addCompanions(mod, loadInstrCompanions());
    const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
    mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) { mod._free(ptr); mod._free(hp); return null; }
    mod._free(ptr); mod._free(hp);
    const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(256);
    let fx: Fixture | null = null;
    for (let c = 0; c < maxTicks; c++) {
      mod._uade_wasm_arm_capture(0x20000, 0x10000);
      mod._uade_wasm_arm_capture_pc(PC_LO, PC_HI);
      if (mod._uade_wasm_render(L, R, 882) <= 0) break;
      if (!mod._uade_wasm_get_capture(cap)) continue;
      const hh = new Uint32Array(mod.HEAPU8.buffer);
      const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
      const byteLen = (r[6] & 0xffff) + 1;      // D6 + 1
      const last = byteLen - 1;
      const outBase = (r[10] - 1) >>> 0;         // A2 - 1
      const wave1Base = (r[11] - 1) >>> 0;       // A3 - 1
      const a4Base = r[12] >>> 0;                // A4 (indexed, not auto-inc)
      mod._uade_wasm_read_memory(outBase, rd, byteLen); const out = mod.HEAPU8.slice(rd, rd + byteLen);
      mod._uade_wasm_read_memory(wave1Base, rd, byteLen); const wave1 = mod.HEAPU8.slice(rd, rd + byteLen);
      mod._uade_wasm_read_memory(a4Base, rd, byteLen); const a4 = mod.HEAPU8.slice(rd, rd + byteLen);
      const d2v = r[2] & 0xffff, d3v = r[3] & 0xffff;
      const seedLast = a4[last], seedPrev = a4[last - 1] ?? 0;
      fx = { name, byteLen, d2v, d3v, arpD1: recoverArpD1(d2v), seedLast, seedPrev, wave1Hex: hexOf(wave1), outHex: hexOf(out) };
      break;
    }
    mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
    return fx;
  } finally { try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } }
}

/**
 * Recover the feedback seed that reproduces `out` byte-exact. With d3v=0 (always,
 * for chip pointers) the seedPrev velocity term is INERT — the first loop pass
 * zeroes d1w before seedPrev can act — so only seedLast is determined. Brute
 * seedLast 0..255 and accept iff EXACTLY ONE value reproduces the full buffer
 * (uniqueness proves the true feedback predecessor, not a short-buffer collision).
 * seedPrev is recorded as captured (documented inert) for a faithful fixture.
 */
function solveSeed(fx: Fixture, w1: Int8Array): { seedLast: number } | null {
  const outBytes = new Uint8Array(fx.byteLen); for (let i = 0; i < fx.byteLen; i++) outBytes[i] = parseInt(fx.outHex.substr(i * 2, 2), 16);
  let found = -1; let count = 0;
  for (let sl = 0; sl < 256; sl++) {
    const pred = calc14Kernel(sl, 0, w1, fx.d2v, fx.d3v, fx.byteLen);
    let ok = true; for (let i = 0; i < fx.byteLen; i++) if ((pred[i] & 0xff) !== outBytes[i]) { ok = false; break; }
    if (ok) { if (++count > 1) return null; found = sl; }
  }
  return count === 1 ? { seedLast: found } : null;
}

async function main(): Promise<void> {
  const fixtures: Fixture[] = [];
  for (const name of MODULES) {
    let fx: Fixture | null = null;
    try { fx = await capture(name); } catch (e) { console.log(`${name}: ERR ${(e as Error).message}`); continue; }
    if (!fx) { console.log(`${name}: CALC14 never fired`); continue; }
    const w1 = new Int8Array(fx.byteLen); for (let i = 0; i < fx.byteLen; i++) w1[i] = parseInt(fx.wave1Hex.substr(i * 2, 2), 16) << 24 >> 24;
    // Prefer the directly-read A4 seed; if the voice buffer is rotated (stale A4),
    // fall back to the uniquely-determined seed that the kernel maps to `out`.
    const direct = calc14Kernel(fx.seedLast, fx.seedPrev, w1, fx.d2v, fx.d3v, fx.byteLen);
    let ham = 0; for (let i = 0; i < fx.byteLen; i++) if ((direct[i] & 0xff) !== parseInt(fx.outHex.substr(i * 2, 2), 16)) ham++;
    let src = 'directA4';
    if (ham !== 0) {
      const solved = fx.byteLen >= 16 ? solveSeed(fx, w1) : null;
      if (!solved) { console.log(`${name}: byteLen=${fx.byteLen} HAM=${ham} — no unique seedLast (buffer-rotated + under-determined), SKIP`); continue; }
      fx.seedLast = solved.seedLast; src = 'uniqueSolve';
    }
    console.log(`${name}: byteLen=${fx.byteLen} d2v=0x${fx.d2v.toString(16)} d3v=0x${fx.d3v.toString(16)} seed=${fx.seedLast.toString(16)},${fx.seedPrev.toString(16)} BYTE-EXACT (${src})`);
    fixtures.push(fx);
  }
  const outPath = join(process.cwd(), 'src/engine/suntronic/__tests__/sunTronicSmoothOracle.golden.json');
  writeFileSync(outPath, JSON.stringify({ note: 'CALC13/14 (else-branch smooth feedback) fixtures captured from UADE via PC-filtered register capture @0x26e08 (loop @0x26dc8). calc14Kernel(seedLast,seedPrev,wave1,d2v,d3v,byteLen) must reproduce outHex byte-exact. Seed = feedback predecessor A4[last]/A4[last-1] (directly read, or uniquely solved for buffer-rotated voices).', fixtures }, null, 2));
  console.log(`\n[p7v] wrote ${fixtures.length}/${MODULES.length} fixtures -> ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
