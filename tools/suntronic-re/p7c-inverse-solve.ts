/**
 * p7c-inverse-solve.ts — decide whether the CALC14 *form* is correct, independent
 * of the (unknown) wave1 that was actually playing.
 *
 * For a real static/converged feedback buffer B captured from UADE (a genuine
 * fixed point of the true routine), the CALC14 recurrence with src=B must be able
 * to output B exactly *for some* wave1 stream W and interp coefficient d1. We treat
 * W[i] as a free byte at each sample and greedily pick the W[i] in [-128,127] that
 * makes the forward CALC14 step emit B[i]. If every sample is solvable for some d1,
 * the FORM is right and only the wave1 identity was wrong; if not, the math form is
 * still off and the first unsolvable index localises the bug.
 *
 * Usage: npx tsx tools/suntronic-re/p7c-inverse-solve.ts [module.src]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const w16 = (x: number): number => (x << 16) >> 16;

function readMem(mod: AnyMod, addr: number, len: number): Int8Array {
  const p = mod._malloc(len);
  mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Int8Array(mod.HEAPU8.buffer.slice(p, p + len));
  mod._free(p);
  return bytes;
}
const hexOf = (b: Int8Array): string => {
  let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0'); return s;
};
const maxAdjDelta = (b: Int8Array): number => {
  let m = 0; for (let i = 1; i < b.length; i++) m = Math.max(m, Math.abs(b[i] - b[i - 1])); return m;
};

/** coefficients d2v, d3coeff for a given d1 (identical derivation to calc14). */
function coeffs(d1: number): { d2v: number; d3v: number } {
  const d0div = (d1 & 0xff) + 0x20;
  const d2 = Math.floor(0xfffe0 / d0div) & 0xffff;
  const d3mul = (0x26 * w16(d1)) & 0xffff;
  const d2v = (d2 - d3mul) & 0xffff;
  let d3v = (0x7fff - d2v) & 0xffff;
  d3v = ((d3v * 0xc000) >>> 16) & 0xffff;
  return { d2v, d3v };
}

/**
 * Greedy inverse: given fixed point B (src) and d1, try to choose W[i] bytes so
 * CALC14 emits B exactly. Returns #samples solved before first failure + the
 * recovered W (partial).
 */
function inverseSolve(B: Int8Array, d1: number): { solved: number; W: Int8Array } {
  const byteLen = B.length, last = byteLen - 1;
  const { d2v, d3v } = coeffs(d1);
  const W = new Int8Array(byteLen);
  let d0 = (s8(B[last]) << 7) & 0xffff;
  const diff = s8(((B[last]) - (B[last - 1])) & 0xff);
  let d1w = (diff << 7) & 0xffff;
  for (let i = 0; i < byteLen; i++) {
    const d1w_a = (((w16(d1w) * w16(d3v)) >> 16) << 1) & 0xffff;
    let hit = -1;
    for (let W_i = -128; W_i <= 127; W_i++) {
      const s5 = ((W_i << 7) - w16(d0)) & 0xffff;
      const d5 = (((w16(s5) * w16(d2v)) >> 16) << 1) & 0xffff;
      const d1w_try = (d1w_a + d5) & 0xffff;
      const d0_try = (d0 + d1w_try) & 0xffff;
      const out = ((w16(d0_try) >> 7) << 24) >> 24;
      if (out === B[i]) { hit = W_i; d1w = d1w_try; d0 = d0_try; break; }
    }
    if (hit === -1) return { solved: i, W };
    W[i] = hit;
  }
  return { solved: byteLen, W };
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);
  mod._uade_wasm_enable_paula_log(1);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  const loc = [0, 0, 0, 0], len = [0, 0, 0, 0], lch = [0, 0, 0, 0];
  const seq: { loc: number; hex: string; len: number }[] = []; // ch0 only
  for (let c = 0; c < 400; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512);
    const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v;
      else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
    if (loc[0] && len[0]) seq.push({ loc: loc[0], hex: hexOf(readMem(mod, loc[0], len[0] * 2)), len: len[0] * 2 });
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // Pick static+smooth ch0 buffers (a genuine fixed point: appears at ≥2 consecutive
  // same-loc snapshots unchanged). Then inverse-solve over all d1.
  const statics: Int8Array[] = [];
  for (let i = 1; i < seq.length; i++) {
    if (seq[i].loc === seq[i - 1].loc && seq[i].hex === seq[i - 1].hex) {
      const b = Int8Array.from(seq[i].hex.match(/../g)!.map((x) => (parseInt(x, 16) << 24) >> 24));
      if (maxAdjDelta(b) <= 40 && !statics.some((s) => hexOf(s) === seq[i].hex)) statics.push(b);
    }
  }
  console.log(`[p7c] ${name}: ${seq.length} ch0 ticks, ${statics.length} distinct static+smooth fixed points`);
  const probe = statics.slice(0, 4);
  for (const B of probe) {
    let best = { d1: -1, solved: 0 };
    for (let d1 = 0; d1 <= 127; d1++) {
      const { solved } = inverseSolve(B, d1);
      if (solved > best.solved) best = { d1, solved };
      if (solved === B.length) break;
    }
    const verdict = best.solved === B.length ? 'FORM OK (fully solvable)' : `form breaks @sample ${best.solved}`;
    console.log(`[p7c] B=${hexOf(B).slice(0, 24)}… bestSolved=${best.solved}/${B.length} @d1=${best.d1} → ${verdict}`);
    if (best.solved === B.length) {
      const { W } = inverseSolve(B, best.d1);
      console.log(`        implied W=${hexOf(W).slice(0, 48)}…`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
