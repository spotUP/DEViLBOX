/**
 * p7j-acctrace-oracle.ts — Gate-1 feedback validator using the CPU byte-access trace.
 *
 * The new UADE-WASM acctrace records every chip-RAM byte read/write in order. The
 * CALC14 loop streams wave1 via `MOVE.B (A3)+,D5` → a run of `byteLen` consecutive
 * ascending byte READS whose values ARE wave1. We capture each tick's trace, enumerate
 * every ascending stride-1 read run of length >= byteLen, and for ch0 test
 *     predict = calc14(prevOutput, run, d1)   over d1 = 0..127 (and signed)
 * against this tick's real output (loc content). A byte-exact hit pins (wave1, d1) with
 * ZERO struct-layout guessing → CALC14 math + feedback model confirmed → Gate 1 closes.
 *
 * Usage: npx tsx tools/suntronic-re/p7j-acctrace-oracle.ts [module.src] [ch]
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
function readMem(mod: AnyMod, addr: number, len: number): Uint8Array {
  const p = mod._malloc(len); mod._uade_wasm_read_memory(addr, p, len);
  const b = new Uint8Array(mod.HEAPU8.buffer.slice(p, p + len)); mod._free(p); return b;
}
const hexOf = (b: Uint8Array): string => {
  let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s;
};
const ham = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n;
};

function calc14(src: Uint8Array, wave1: Uint8Array, d1: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen); const last = byteLen - 1;
  const d0div = (d1 & 0xff) + 0x20; if (d0div === 0) return out;
  const d2 = Math.floor(0xfffe0 / d0div) & 0xffff;
  const d3mul = (0x26 * w16(d1)) & 0xffff;
  const d2v = (d2 - d3mul) & 0xffff;
  let d3v = (0x7fff - d2v) & 0xffff; d3v = ((d3v * 0xc000) >>> 16) & 0xffff;
  let d0 = (s8(src[last] ?? 0) << 7) & 0xffff;
  const diff = s8(((src[last] ?? 0) - (src[last - 1] ?? 0)) & 0xff);
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

/**
 * Extract ascending stride-1 runs of length >= minLen from the READ-ONLY subsequence.
 * CALC14 alternates read(A3)+ / write(A2)+, so wave1 reads are non-contiguous in the raw
 * trace; filtering to reads first re-joins the A3 stream (a write between two ascending
 * reads no longer breaks the run). Boundaries between distinct loops show as addr jumps.
 */
function readRuns(trace: { addr: number; val: number; wr: number }[], minLen: number): { base: number; vals: Uint8Array }[] {
  const reads = trace.filter((e) => !e.wr);
  const runs: { base: number; vals: Uint8Array }[] = [];
  let i = 0;
  while (i < reads.length) {
    let j = i + 1;
    while (j < reads.length && reads[j].addr === reads[j - 1].addr + 1) j++;
    const runLen = j - i;
    if (runLen >= minLen) {
      const vals = new Uint8Array(runLen);
      for (let k = 0; k < runLen; k++) vals[k] = reads[i + k].val;
      runs.push({ base: reads[i].addr, vals });
    }
    i = j;
  }
  return runs;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const targetCh = parseInt(process.argv[3] ?? '0', 10);
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
  mod._uade_wasm_enable_acctrace(1);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  const AT = mod._malloc(200000 * 2 * 4);
  const loc = [0, 0, 0, 0], len = [0, 0, 0, 0], lch = [0, 0, 0, 0];
  let prevOut: Uint8Array | null = null;
  let found = false;
  for (let c = 0; c < 300 && !found; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512); const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v; else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
    // drain this tick's access trace
    const trace: { addr: number; val: number; wr: number }[] = [];
    let got: number;
    do {
      got = mod._uade_wasm_drain_acctrace(AT, 200000);
      const hh = new Uint32Array(mod.HEAPU8.buffer);
      for (let i = 0; i < got; i++) {
        const addr = hh[(AT >> 2) + i * 2]; const w = hh[(AT >> 2) + i * 2 + 1];
        trace.push({ addr, val: w & 0xff, wr: (w >> 16) & 1 });
      }
    } while (got === 200000);

    if (!loc[targetCh] || !len[targetCh]) continue;
    const byteLen = len[targetCh] * 2;
    const out = readMem(mod, loc[targetCh], byteLen);
    if (prevOut && prevOut.length === byteLen) {
      const runs = readRuns(trace, byteLen);
      for (const run of runs) {
        const w1 = run.vals.slice(0, byteLen);
        for (let d1 = -128; d1 <= 127; d1++) {
          const pred = calc14(prevOut, w1, d1, byteLen);
          if (ham(pred, out) === 0) {
            console.log(`[p7j] *** BYTE-EXACT *** tick${c} ch${targetCh} byteLen=${byteLen} d1=${d1} wave1@0x${run.base.toString(16)}`);
            console.log(`     wave1=${hexOf(w1.slice(0, 24))}`);
            console.log(`     out  =${hexOf(out.slice(0, 24))}`);
            found = true; break;
          }
        }
        if (found) break;
      }
      if (!found && c === 80) {
        // diagnostics: best hamming this tick
        let best = { ham: 9999, d1: 0, base: 0, pred: new Uint8Array(0) };
        for (const run of runs) {
          const w1 = run.vals.slice(0, byteLen);
          for (let d1 = -128; d1 <= 127; d1++) {
            const pred = calc14(prevOut, w1, d1, byteLen); const hm = ham(pred, out);
            if (hm < best.ham) best = { ham: hm, d1, base: run.base, pred };
          }
        }
        console.log(`[p7j] tick${c} ch${targetCh} runs=${runs.length} bestHam=${best.ham}/${byteLen} d1=${best.d1} wave1@0x${best.base.toString(16)}`);
        console.log(`     prevOut=${hexOf(prevOut.slice(0, 24))}`);
        console.log(`     pred   =${hexOf(best.pred.slice(0, 24))}`);
        console.log(`     out    =${hexOf(out.slice(0, 24))}`);
      }
    }
    prevOut = out;
  }
  if (!found) console.log('[p7j] no byte-exact match found');
  mod._free(L); mod._free(R); mod._free(lg); mod._free(AT);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
