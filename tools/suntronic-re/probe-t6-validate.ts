/**
 * probe-t6-validate.ts — Gate C.0: prove the reverse-engineered type-6 kernel
 * byte-exact against the LIVE replayer play buffer.
 *
 * The loaded eagleplayer dispatches MEGAEFFECTS by a jump table @0x26c5c indexed
 * by synthType*2 (a6=0x264dc). The type-6 handler @0x26e6c is a damped
 * harmonic-oscillator that GENERATES the wave each tick (no stored samples):
 * springs toward a constant target (0xf100 seg1 / 0xf00 seg2), fresh y=0xf00,v=0
 * seed, two segments split by a per-voice sweep accumulator. record+0x1a is a
 * signed-16 sweep delta here, NOT a wave pointer.
 *
 * Method: each render chunk, read voice-0's live state ($12 arpIdx, $28 phase,
 * $2a cnt, $16 playBufPtr, $4 record) + record param bytes + arp table from chip
 * RAM, run the JS kernel with those exact inputs, and compare against the bytes
 * at the play-buffer pointer ($16). Reports byte-exact match ratio.
 *
 * a6/voice geometry (fixed this build): voice0 a0 = a6 + 0xaae = 0x26f8a,
 * stride 0x1ba. Fields: $4 record(long), $12 arpIdx(word), $16 playBuf(long),
 * $28 phase(word), $2a cnt(word), $37 flag.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule, type UADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

interface ExtMod extends UADEModule {
  _uade_wasm_get_channel_extended(out: number): void;
  _uade_wasm_read_memory(addr: number, out: number, len: number): number;
}

const A6 = 0x264dc;
const V0 = A6 + 0xaae; // 0x26f8a

const toS16 = (x: number): number => (x << 16) >> 16;

/** Type-6 damped-resonator kernel — exact transcription of handler @0x26e6c. */
function renderType6(
  arp: number, // d0 = arpTable[arpIdx] (signed byte)
  phaseIn: number, // $28(a0) BEFORE this tick's advance (word)
  cntIn: number, // $2a(a0) BEFORE this tick's advance (word, signed)
  rec: { p1a: number; p1c: number; p1e: number; p1f: number; p20: number },
  byteLen: number,
): { buf: Int8Array; phaseOut: number; cntOut: number; seg1: number; seg2: number } {
  const out = new Int8Array(byteLen);
  const d6total = byteLen - 1; // D6 = byteLen-1

  // counter/sweep (26e6c..26e92)
  let cnt = toS16(cntIn);
  if (cnt >= 0) {
    cnt += 1;
    if (cnt >= rec.p1f) cnt = -1; // 0xffff
  }
  let delta: number;
  if (cnt >= 0) delta = toS16(rec.p1a);
  else delta = toS16(rec.p1c);
  let phase = toS16((phaseIn + delta) & 0xffff);
  let sw = Math.abs(phase) & 0xffff;
  sw = (sw * rec.p20) >>> 8; // mulu d1,d2 ; lsr.l #8 ... wait: 26ea4 mulu d1,d2; 26ea6 lsr.l#8
  // 26ea8: d5 = d6+1 ; 26aac mulu d5,d2 ; 26aae swap d2 (>>16)
  let d5 = (d6total + 1) & 0xffff;
  let prod = (sw * d5) >>> 0;
  const d2hi = (prod >>> 16) & 0xffff;
  d5 = ((d6total + 1) >>> 1) & 0xffff; // 26eb0 lsr.w #1 d5
  d5 = (d5 + d2hi) & 0xffff; // 26eb2 add d2,d5
  d5 = (d5 - 1) & 0xffff; // 26eb4 subq #1
  let d6 = (d6total - toS16(d5) - 1) & 0xffff; // 26eb6 sub d5,d6 ; 26eb8 subq #1
  d6 = toS16(d6);
  d5 = toS16(d5);

  // coeffs (26ec0..26ee2)
  const d1f = (arp + 0x20) & 0xffff;
  const spring = (Math.floor(0xfffe0 / d1f) - (0x26 * ((arp << 16) >> 16))) & 0xffff; // d2
  const d2 = toS16(spring);
  const d4b = rec.p1e; // move.b $1e(a1),d4
  const damp = (((0x7fff - toS16(spring)) & 0xffff) * d4b) >>> 8; // d3 = (0x7fff-d2)*p1e >>8
  const d3 = toS16(damp & 0xffff);

  // oscillator (26ee4..26f26): y=0xf00, v=0; seg1 target 0xf100, seg2 target 0xf00
  let y = 0x0f00;
  let v = 0;
  let o = 0;
  const step = (target: number): void => {
    // v = (d3 * v) >> 15  (swap ; rol.l #1 → high word *2, low word taken)
    let p = (d3 * toS16(v)) >>> 0;
    let vw = ((p << 16) | (p >>> 16)) >>> 0;
    vw = ((vw << 1) | (vw >>> 31)) >>> 0;
    v = toS16(vw & 0xffff);
    let f = (d2 * toS16((target - y) & 0xffff)) >>> 0;
    let fw = ((f << 16) | (f >>> 16)) >>> 0;
    fw = ((fw << 1) | (fw >>> 31)) >>> 0;
    v = toS16((v + (fw & 0xffff)) & 0xffff);
    y = toS16((y + v) & 0xffff);
    out[o++] = (((y & 0xffff) >>> 7) << 24) >> 24; // lsr.w #7 ; move.b
  };
  for (let i = 0; i <= d6 && o < byteLen; i++) step(0xf100);
  for (let i = 0; i <= d5 && o < byteLen; i++) step(0x0f00);

  return { buf: out, phaseOut: phase, cntOut: cnt & 0xffff, seg1: d6 + 1, seg2: d5 + 1 };
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

  const L = mod._malloc(4096), R = mod._malloc(4096);
  const buf = mod._malloc(4096);
  const rd = (a: number, n: number): Uint8Array => {
    mod._uade_wasm_read_memory(a, buf, n);
    return new Uint8Array(mod.HEAPU8.buffer.slice(buf, buf + n));
  };
  const rdU32 = (a: number): number => { const b = rd(a, 4); return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0; };
  const rdU16 = (a: number): number => { const b = rd(a, 2); return (b[0] << 8) | b[1]; };

  let tested = 0, exact = 0;
  const CHUNK = 128;
  const seenNotes = new Map<string, { arp: number; phase: number; cnt: number; nz: number; wwl: number; p1a: number; p1c: number; p1f: number; p20: number }>();
  for (let c = 0; c < 8000 && seenNotes.size < 60; c++) {
    if (mod._uade_wasm_render(L, R, CHUNK) <= 0) break;
    const rec = rdU32(V0 + 0x04) >>> 0;
    if (rec < 0x400 || rec > 0x200000) continue;
    const synthType = rd(rec + 0x23, 1)[0];
    if (synthType !== 6) continue;
    const wwl = rd(rec + 0x22, 1)[0];
    const byteLen = wwl * 2;
    if (byteLen <= 0 || byteLen > 2048) continue;
    // $16(a0) holds voice+0x3a; the generator double-buffers, writing to
    // a2 = voice+0x3a + $a70(a6) where $a70(a6) toggles 0/0x80 (MEGAEFFECTS
    // 26c1e-26c26 + tail 26d08). Read whichever half holds the just-written wave.
    const playBufRaw = rdU32(V0 + 0x16) >>> 0;
    if (playBufRaw < 0x400 || playBufRaw > 0x200000) continue;
    const arpTbl = rdU32(rec + 0x12) >>> 0;
    const arpIdx = rdU16(V0 + 0x12);
    const arp = (rd(arpTbl + arpIdx, 1)[0] << 24) >> 24; // signed byte
    const phase = rdU16(V0 + 0x28);
    const cnt = rdU16(V0 + 0x2a);
    const p = {
      p1a: rdU16(rec + 0x1a),
      p1c: rdU16(rec + 0x1c),
      p1e: rd(rec + 0x1e, 1)[0],
      p1f: rd(rec + 0x1f, 1)[0],
      p20: rd(rec + 0x20, 1)[0],
    };
    // Two double-buffer halves; pick whichever best matches the gen.
    const realA = rd(playBufRaw, byteLen);
    const realB = rd((playBufRaw + 0x80) >>> 0, byteLen);
    // Current $28/$2a reflect state AFTER this tick advanced them; reproduce by
    // trying the pre-advance state = derive. But phase/cnt shown ARE post-advance.
    // The buffer at playBuf was generated with THIS tick's advanced phase/cnt, so
    // pass them as the "in" that produces the same delta path: we replay the
    // advance too, so pass the PREVIOUS state. Approximate: try both raw and
    // one-step-back by brute forcing cnt in a small window.
    // Brute-force the pre-advance state window AND both double-buffer halves;
    // score against whichever half matches best over the full byteLen.
    let best = -1, bestBuf: Int8Array | null = null, bestReal: Uint8Array = realA, bestHalf = 'A';
    for (const [half, real] of [['A', realA], ['B', realB]] as const) {
      for (let dc = -2; dc <= 2; dc++) {
        for (let dph = -1; dph <= 1; dph++) {
          const preCnt = (cnt - 1 + dc) & 0xffff;
          const predelta = toS16(preCnt) >= 0 ? toS16(p.p1a) : toS16(p.p1c);
          const prePhase = (phase - predelta + dph) & 0xffff;
          const r = renderType6(arp, prePhase, preCnt, p, byteLen);
          let m = 0; for (let i = 0; i < byteLen; i++) if (((r.buf[i] << 24) >> 24 & 0xff) === real[i]) m++;
          if (m > best) { best = m; bestBuf = r.buf; bestReal = real; bestHalf = half; }
        }
      }
    }
    tested++;
    const ratio = best / byteLen;
    if (ratio === 1) exact++;
    let nzA = 0; for (const x of realA) if (x) nzA++;
    let nzB = 0; for (const x of realB) if (x) nzB++;
    seenNotes.set(`${arp}:${phase}:${cnt}`, { arp, phase, cnt, nz: Math.max(nzA, nzB), wwl, p1a: toS16(p.p1a), p1c: toS16(p.p1c), p1f: p.p1f, p20: p.p20 });
    if (tested === 1) {
      const hx = (a: ArrayLike<number>): string => Array.from({ length: byteLen }, (_, i) => ((a[i] as number) & 0xff).toString(16).padStart(2, '0')).join(' ');
      console.log(`half=${bestHalf} phase=${phase} cnt=${cnt} nzA=${nzA} nzB=${nzB}`);
      console.log('GEN :', hx(bestBuf!));
      console.log('REAL:', hx(bestReal));
      let div = -1; for (let i = 0; i < byteLen; i++) if (((bestBuf![i] << 24) >> 24 & 0xff) !== bestReal[i]) { div = i; break; }
      console.log(`first divergence at byte ${div}`);
    }
    if (tested <= 8) {
      const gen = Array.from(bestBuf!.subarray(0, 12)).map((x) => (x & 0xff).toString(16).padStart(2, '0')).join('');
      const rl = Array.from(bestReal.subarray(0, 12)).map((x) => x.toString(16).padStart(2, '0')).join('');
      console.log(`t${tested} half=${bestHalf} arp=${arp} wwl=${wwl} p1a=${toS16(p.p1a)} p1c=${toS16(p.p1c)} p1e=${p.p1e} p1f=${p.p1f} p20=${p.p20} match=${best}/${byteLen} (${(ratio * 100).toFixed(0)}%) gen=${gen} real=${rl}`);
    }
  }
  console.log(`\nTYPE-6 KERNEL: ${exact}/${tested} buffers byte-exact (128-len split)`);
  console.log('\n=== empirical real-length map (nz = real nonzero byte count) ===');
  for (const v of seenNotes.values()) {
    console.log(`arp=${String(v.arp).padStart(4)} phase=${String(v.phase).padStart(5)} cnt=${v.cnt} nz=${String(v.nz).padStart(3)} wwl=${v.wwl} p1a=${v.p1a} p1c=${v.p1c} p20=${v.p20} p1f=${v.p1f}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
