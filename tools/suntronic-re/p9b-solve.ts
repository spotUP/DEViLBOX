/**
 * p9b-solve.ts — black-box system-ID of the NEGATIVE-arp type-1 pulse kernel.
 *
 * The capture ABI cannot land on the body PC (0x26c8a entry consumes the single
 * per-chunk capture slot), so we cannot read the body's registers. Instead we read
 * the FINISHED (src = prev play buffer, out = this play buffer, arp) triples from
 * kompo03.src post-render and fit a family of first-order recurrences, requiring one
 * (form, coeff(arp)) to be byte-exact across ALL sampled negative-arp fires.
 *
 * Usage: npx tsx tools/suntronic-re/p9b-solve.ts [module] [maxTicks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const extw = (x: number): number => (x << 16) >> 16;
const asr7 = (x: number): number => extw(x) >> 7;

interface Sample { arp: number; src: Uint8Array; out: Uint8Array; }

// Recurrence forms. Each takes (src, coeff, byteLen) -> out. `state` is word.
type Form = { name: string; fn: (src: Uint8Array, coeff: number, n: number) => Uint8Array };
const FORMS: Form[] = [
  { name: 'lp_after_seedLast', fn: (src, c, n) => { const o = new Uint8Array(n); let st = s8(src[n - 1]); for (let i = 0; i < n; i++) { st = extw(st + asr7((s8(src[i]) - st) * c)); o[i] = st & 0xff; } return o; } },
  { name: 'lp_before_seedLast', fn: (src, c, n) => { const o = new Uint8Array(n); let st = s8(src[n - 1]); for (let i = 0; i < n; i++) { o[i] = st & 0xff; st = extw(st + asr7((s8(src[i]) - st) * c)); } return o; } },
  { name: 'onepole_after', fn: (src, c, n) => { const o = new Uint8Array(n); let st = s8(src[n - 1]); for (let i = 0; i < n; i++) { st = extw(s8(src[i]) + asr7((st - s8(src[i])) * c)); o[i] = st & 0xff; } return o; } },
  { name: 'onepole_before', fn: (src, c, n) => { const o = new Uint8Array(n); let st = s8(src[n - 1]); for (let i = 0; i < n; i++) { o[i] = st & 0xff; st = extw(s8(src[i]) + asr7((st - s8(src[i])) * c)); } return o; } },
  { name: 'delta_after', fn: (src, c, n) => { const o = new Uint8Array(n); let st = s8(src[n - 1]); let prev = s8(src[n - 1]); for (let i = 0; i < n; i++) { const cur = s8(src[i]); const d = extw(cur - prev); prev = cur; st = asr7((st + d) * c); o[i] = st & 0xff; } return o; } },
  { name: 'delta_before', fn: (src, c, n) => { const o = new Uint8Array(n); let st = s8(src[n - 1]); let prev = s8(src[n - 1]); for (let i = 0; i < n; i++) { o[i] = st & 0xff; const cur = s8(src[i]); const d = extw(cur - prev); prev = cur; st = asr7((st + d) * c); } return o; } },
  { name: 'accplus_delta', fn: (src, c, n) => { const o = new Uint8Array(n); let st = s8(src[n - 1]); let prev = s8(src[n - 1]); for (let i = 0; i < n; i++) { const cur = s8(src[i]); const d = extw(cur - prev); prev = cur; st = extw(st + asr7(d * c)); o[i] = st & 0xff; } return o; } },
];

function ham(a: Uint8Array, b: Uint8Array): number { let h = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) h++; return h; }

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'kompo03.src';
  const maxTicks = parseInt(process.argv[3] ?? '600', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(512);
  const samples: Sample[] = [];
  for (let c = 0; c < maxTicks && samples.length < 60; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(0x26c8a, 0x26c8c);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    const arp = s8(r[0] & 0xff); const byteLen = (r[6] & 0xffff) + 1;
    if (byteLen < 2 || byteLen > 256) continue;
    const outBase = r[10] >>> 0, srcBase = r[11] >>> 0;
    if (outBase === srcBase) continue;
    mod._uade_wasm_read_memory(outBase, rd, byteLen); const out = mod.HEAPU8.slice(rd, rd + byteLen);
    mod._uade_wasm_read_memory(srcBase, rd, byteLen); const src = mod.HEAPU8.slice(rd, rd + byteLen);
    samples.push({ arp, src, out });
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  console.log(`[p9b] ${samples.length} samples. Fitting per-sample best coeff for each form.`);

  // For each form + each sample, find the coeff in [-256,256] giving min hamming.
  // Then see if coeff correlates cleanly with arp (coeff = f(arp)).
  for (const form of FORMS) {
    let totalExact = 0; const fit: { arp: number; coeff: number; h: number; n: number }[] = [];
    for (const s of samples) {
      let bh = 999, bc = 0;
      for (let coeff = -256; coeff <= 256; coeff++) {
        const p = form.fn(s.src, coeff, s.src.length);
        const h = ham(p, s.out);
        if (h < bh) { bh = h; bc = coeff; if (h === 0) break; }
      }
      if (bh === 0) totalExact++;
      fit.push({ arp: s.arp, coeff: bc, h: bh, n: s.src.length });
    }
    // report coeff-vs-arp for exact fits
    const exact = fit.filter((f) => f.h === 0);
    const rel = exact.map((f) => `${f.arp}->${f.coeff}`).slice(0, 20).join(' ');
    console.log(`[${form.name}] exact=${totalExact}/${samples.length}  arp->coeff(exact,<=20): ${rel}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
