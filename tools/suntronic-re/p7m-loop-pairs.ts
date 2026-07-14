/**
 * p7m-loop-pairs.ts — validate CALC13/14 feedback math from PAIRED I/O extracted
 * directly from the byte-access trace, with NO pointer/struct/PC guessing.
 *
 * A SunTronic synth output loop emits, per sample, one wave1 READ (MOVE.B (A3)+,D5)
 * then one output WRITE (MOVE.B D3,(A2)+). So in the acctrace a synth loop appears as
 * an alternating R,W,R,W,… span. We scan for such spans; for each span of length L:
 *   wave1[i] = the L reads,  out[i] = the L writes.
 *   seed     = the 1-2 reads immediately preceding the span (A4[last],A4[last-1]).
 * Then:
 *   (a) verbatim?  out == wave1  → linear/copy synth (CALC1), not feedback.
 *   (b) feedback?  brute d1∈[-128,127]: calc14(seed, wave1, d1) == out  → CALC14 confirmed.
 *
 * Usage: npx tsx tools/suntronic-re/p7m-loop-pairs.ts [module.src] [tick]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const w16 = (x: number): number => (x << 16) >> 16;
const hexOf = (b: Uint8Array): string => {
  let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s;
};

/** Faithful CALC13/14. seed provides d0/d1w start; wave1 = A3 stream. */
function calc14(seed: Uint8Array, wave1: Uint8Array, d1: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen); const last = byteLen - 1;
  const d0div = (d1 & 0xff) + 0x20; if (d0div === 0) return out;
  const d2 = Math.floor(0xfffe0 / d0div) & 0xffff;
  const d3mul = (0x26 * w16(d1)) & 0xffff;
  const d2v = (d2 - d3mul) & 0xffff;
  let d3v = (0x7fff - d2v) & 0xffff; d3v = ((d3v * 0xc000) >>> 16) & 0xffff;
  const sl = seed.length;
  let d0 = (s8(seed[sl - 1] ?? 0) << 7) & 0xffff;
  const diff = s8(((seed[sl - 1] ?? 0) - (seed[sl - 2] ?? 0)) & 0xff);
  let d1w = (diff << 7) & 0xffff; let a3 = 0;
  for (let i = 0; i <= last; i++) {
    d1w = (((w16(d1w) * w16(d3v)) >> 16) << 1) & 0xffff;
    const s5 = ((s8(wave1[a3++] ?? 0) << 7) - w16(d0)) & 0xffff;
    const d5 = (((w16(s5) * w16(d2v)) >> 16) << 1) & 0xffff;
    d1w = (d1w + d5) & 0xffff; d0 = (d0 + d1w) & 0xffff;
    out[i] = (((w16(d0) >> 7) << 24) >> 24) & 0xff;
  }
  return out;
}

interface Entry { addr: number; val: number; wr: number; }

/** Find alternating R,W,R,W spans (each pair = one output-loop sample). Returns spans
 *  with the reads (wave1), writes (out), the write base addr, and index in trace. */
function altSpans(trace: Entry[], minLen: number): { start: number; len: number; reads: Uint8Array; writes: Uint8Array; wbase: number }[] {
  const spans: { start: number; len: number; reads: Uint8Array; writes: Uint8Array; wbase: number }[] = [];
  let i = 0;
  while (i + 1 < trace.length) {
    // a sample-pair = read then write, with write addr ascending by 1 across pairs
    if (trace[i].wr === 0 && trace[i + 1].wr === 1) {
      const reads: number[] = [trace[i].val]; const writes: number[] = [trace[i + 1].val];
      const wbase = trace[i + 1].addr; let k = i + 2;
      while (k + 1 < trace.length && trace[k].wr === 0 && trace[k + 1].wr === 1 &&
             trace[k + 1].addr === trace[k - 1].addr + 1) {
        reads.push(trace[k].val); writes.push(trace[k + 1].val); k += 2;
      }
      const len = reads.length;
      if (len >= minLen) spans.push({ start: i, len, reads: Uint8Array.from(reads), writes: Uint8Array.from(writes), wbase });
      i = k;
    } else i++;
  }
  return spans;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const wantTick = parseInt(process.argv[3] ?? '-1', 10); // -1 = sweep all ticks for non-verbatim spans
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);
  mod._uade_wasm_enable_acctrace(1);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), AT = mod._malloc(200000 * 2 * 4);
  const sweep = wantTick < 0;
  const lastTick = sweep ? 300 : wantTick;
  for (let c = 0; c <= lastTick; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const trace: Entry[] = [];
    let got: number;
    do {
      got = mod._uade_wasm_drain_acctrace(AT, 200000);
      const hh = new Uint32Array(mod.HEAPU8.buffer);
      for (let i = 0; i < got; i++) {
        const addr = hh[(AT >> 2) + i * 2]; const w = hh[(AT >> 2) + i * 2 + 1];
        trace.push({ addr, val: w & 0xff, wr: (w >> 16) & 1 });
      }
    } while (got === 200000);
    if (!sweep && c !== wantTick) continue;

    const spans = altSpans(trace, 8);
    if (!sweep) console.log(`[p7m] tick${c} trace=${trace.length} altSpans(len>=8)=${spans.length}`);
    for (const sp of spans) {
      // in sweep mode, only report NON-verbatim spans (the real synth computes)
      if (sweep) {
        const vb = sp.reads.every((v, i) => v === sp.writes[i]);
        if (vb) continue;
      }
      // seed = up to 2 reads immediately before the span start
      const seedArr: number[] = [];
      for (let j = sp.start - 1; j >= 0 && seedArr.length < 4; j--) {
        if (trace[j].wr === 0) seedArr.unshift(trace[j].val); else break;
      }
      // Real seed = A4[last],A4[last-1]. For in-place feedback (A2==A3==A4) that is the
      // OLD buffer's last two bytes = the wave (reads) tail. Also keep the pre-read guess.
      const seedTail = Uint8Array.from([sp.reads[sp.len - 2] ?? 0, sp.reads[sp.len - 1] ?? 0]);
      const seedPre = Uint8Array.from(seedArr.length ? seedArr : [0, 0]);
      const verbatim = sp.reads.every((v, i) => v === sp.writes[i]);
      let hit = -1; let seedUsed = 'tail'; let seed = seedTail;
      if (!verbatim) {
        outer:
        for (const [tag, sd] of [['tail', seedTail], ['pre', seedPre]] as [string, Uint8Array][]) {
          for (let d1 = -128; d1 <= 127; d1++) {
            const pred = calc14(sd, sp.reads, d1, sp.len);
            let ok = true; for (let i = 0; i < sp.len; i++) if (pred[i] !== sp.writes[i]) { ok = false; break; }
            if (ok) { hit = d1; seedUsed = tag; seed = sd; break outer; }
          }
        }
      }
      void seedUsed;
      console.log(`  [tick${c}] span@${sp.start} len=${sp.len} wbase=0x${sp.wbase.toString(16)} verbatim=${verbatim} calc14Hit=${hit !== -1 ? `d1=${hit} seed=${seedUsed}` : 'no'}`);
      console.log(`     seedTail=${hexOf(seedTail)} seedPre=${hexOf(seedPre)}`);
      console.log(`     wave =${hexOf(sp.reads)}`);
      console.log(`     out  =${hexOf(sp.writes)}`);
      if (hit === -1 && !verbatim) {
        // report best hamming (over both seed models) to see how close
        let best = { ham: 9999, d1: 0, tag: '', pred: new Uint8Array(0) };
        for (const [tag, sd] of [['tail', seedTail], ['pre', seedPre]] as [string, Uint8Array][]) {
          for (let d1 = -128; d1 <= 127; d1++) {
            const pred = calc14(sd, sp.reads, d1, sp.len);
            let hm = 0; for (let i = 0; i < sp.len; i++) if (pred[i] !== sp.writes[i]) hm++;
            if (hm < best.ham) best = { ham: hm, d1, tag, pred };
          }
        }
        console.log(`     bestHam=${best.ham}/${sp.len} d1=${best.d1} seed=${best.tag} pred=${hexOf(best.pred)}`);
      }
    }
  }
  mod._free(L); mod._free(R); mod._free(AT);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
