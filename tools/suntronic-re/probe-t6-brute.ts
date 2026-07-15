/**
 * probe-t6-brute.ts — decouple the type-6 kernel validation from post-tick
 * register reads. Each render chunk: read $a70(a6) to know which double-buffer
 * half the generator JUST wrote, then brute-force the generation phase (0..65535)
 * + cnt sign that reproduces that half byte-exact with the kernel. Reports, per
 * captured buffer, the best phase, whether it is byte-exact, and the resulting
 * seg1/seg2 split — so we learn the true note-on phase and confirm the formula.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule, type UADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

interface ExtMod extends UADEModule {
  _uade_wasm_read_memory(addr: number, out: number, len: number): number;
}

const A6 = 0x264dc;
const V0 = A6 + 0xaae;
const toS16 = (x: number): number => (x << 16) >> 16;

function renderType6(arp: number, phaseIn: number, cntIsNeg: boolean, rec: { p1a: number; p1c: number; p1e: number; p20: number }, byteLen: number): { buf: Int8Array; seg1: number; seg2: number } {
  const out = new Int8Array(byteLen);
  const d6total = byteLen - 1;
  const delta = cntIsNeg ? toS16(rec.p1c) : toS16(rec.p1a);
  const phase = toS16((phaseIn + delta) & 0xffff);
  let sw = Math.abs(phase) & 0xffff;
  sw = ((sw * rec.p20) >>> 0) >>> 8;
  let d5 = (d6total + 1) & 0xffff;
  const prod = (sw * d5) >>> 0;
  const d2hi = (prod >>> 16) & 0xffff;
  d5 = ((d6total + 1) >>> 1) & 0xffff;
  d5 = (d5 + d2hi) & 0xffff;
  d5 = (d5 - 1) & 0xffff;
  let d6 = (d6total - d5 - 1) & 0xffff;
  d6 = toS16(d6); d5 = toS16(d5);
  const d1f = (arp + 0x20) & 0xffff;
  const spring = (Math.floor(0xfffe0 / d1f) - (0x26 * ((arp << 16) >> 16))) & 0xffff;
  const d2 = toS16(spring);
  const damp = (((0x7fff - toS16(spring)) & 0xffff) * rec.p1e) >>> 8;
  const d3 = toS16(damp & 0xffff);
  let y = 0x0f00, v = 0, o = 0;
  const step = (target: number): void => {
    let p = (d3 * toS16(v)) >>> 0; let vw = (((p << 16) | (p >>> 16)) >>> 0); vw = ((vw << 1) | (vw >>> 31)) >>> 0; v = toS16(vw & 0xffff);
    let f = (d2 * toS16((target - y) & 0xffff)) >>> 0; let fw = (((f << 16) | (f >>> 16)) >>> 0); fw = ((fw << 1) | (fw >>> 31)) >>> 0;
    v = toS16((v + (fw & 0xffff)) & 0xffff); y = toS16((y + v) & 0xffff);
    out[o++] = (((y & 0xffff) >>> 7) << 24) >> 24;
  };
  for (let i = 0; i <= d6 && o < byteLen; i++) step(0xf100);
  for (let i = 0; i <= d5 && o < byteLen; i++) step(0x0f00);
  return { buf: out, seg1: d6 + 1, seg2: d5 + 1 };
}

async function main(): Promise<void> {
  const name = 'gliders.src';
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod = (await loadUADEModule(false)) as ExtMod;
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const fptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, fptr);
  const hptr = mod._malloc(40); mod.stringToUTF8(name, hptr, 40);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(fptr, data.byteLength, hptr) !== 0) throw new Error('load');
  mod._free(fptr); mod._free(hptr);
  const L = mod._malloc(4096), R = mod._malloc(4096), buf = mod._malloc(4096);
  const rd = (a: number, n: number): Uint8Array => { mod._uade_wasm_read_memory(a, buf, n); return new Uint8Array(mod.HEAPU8.buffer.slice(buf, buf + n)); };
  const rdU32 = (a: number): number => { const b = rd(a, 4); return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0; };
  const rdU16 = (a: number): number => { const b = rd(a, 2); return (b[0] << 8) | b[1]; };

  let tested = 0, exact = 0, captured = 0;
  for (let c = 0; c < 8000 && captured < 24; c++) {
    if (mod._uade_wasm_render(L, R, 128) <= 0) break;
    const rec = rdU32(V0 + 0x04) >>> 0;
    if (rec < 0x400 || rec > 0x200000) continue;
    if (rd(rec + 0x23, 1)[0] !== 6) continue;
    const wwl = rd(rec + 0x22, 1)[0]; const byteLen = wwl * 2;
    if (byteLen <= 0 || byteLen > 2048) continue;
    const vbase = rdU32(V0 + 0x16) >>> 0; // voice+0x3a
    if (vbase < 0x400 || vbase > 0x200000) continue;
    const a70 = rdU32(A6 + 0xa70) >>> 0; // 0 or 0x80 — the just-written half offset
    const written = rd((vbase + a70) >>> 0, byteLen);
    let nz = 0; for (const x of written) if (x) nz++;
    if (nz === 0) continue; // silent/release tick
    const arpTbl = rdU32(rec + 0x12) >>> 0;
    const arp = (rd(arpTbl + rdU16(V0 + 0x12), 1)[0] << 24) >> 24;
    const p = { p1a: rdU16(rec + 0x1a), p1c: rdU16(rec + 0x1c), p1e: rd(rec + 0x1e, 1)[0], p20: rd(rec + 0x20, 1)[0] };
    // brute-force generation phase + cnt sign + arp neighbor (arp latch may be off by one)
    let best = -1, bestPh = 0, bestNeg = false, bestSeg1 = 0, bestSeg2 = 0, bestArp = arp;
    for (let da = -3; da <= 3; da++) {
      const ar = (arp + da << 24) >> 24;
      for (let neg = 0; neg < 2; neg++) {
        for (let ph = 0; ph < 65536; ph++) {
          const r = renderType6(ar, ph, neg === 1, p, byteLen);
          let m = 0; for (let i = 0; i < byteLen; i++) if (((r.buf[i] << 24) >> 24 & 0xff) === written[i]) m++;
          if (m > best) { best = m; bestPh = ph; bestNeg = neg === 1; bestSeg1 = r.seg1; bestSeg2 = r.seg2; bestArp = ar; if (m === byteLen) break; }
        }
        if (best === byteLen) break;
      }
      if (best === byteLen) break;
    }
    tested++; captured++;
    if (best === byteLen) exact++;
    console.log(`t${tested} arp=${arp}->${bestArp} wwl=${wwl} a70=0x${a70.toString(16)} nz=${nz} best=${best}/${byteLen} phase=${bestPh} neg=${bestNeg} seg1=${bestSeg1} seg2=${bestSeg2}${best === byteLen ? ' EXACT' : ''}`);
  }
  console.log(`\nTYPE-6 BRUTE: ${exact}/${tested} buffers byte-exact`);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
