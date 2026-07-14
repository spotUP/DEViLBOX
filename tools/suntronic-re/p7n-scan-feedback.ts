/**
 * p7n-scan-feedback.ts — scan the whole SunTronic corpus for a module that runs a
 * FEEDBACK synth compute (CALC13/14). Reuses the pointer-free loop-pair method: a synth
 * compute shows in the acctrace as an alternating READ,WRITE span; a VERBATIM span is a
 * plain copy/linear voice, a NON-verbatim span is real DSP (feedback / resample-with-math).
 * For each non-verbatim span we brute d1 against calc14 and report byte-exact hits.
 *
 * Usage: npx tsx tools/suntronic-re/p7n-scan-feedback.ts [maxTicks] [globSubstr]
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const w16 = (x: number): number => (x << 16) >> 16;
const hexOf = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };

function calc14(seed: Uint8Array, wave1: Uint8Array, d1: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen); const last = byteLen - 1;
  const d0div = (d1 & 0xff) + 0x20; if (d0div === 0) return out;
  const d2 = Math.floor(0xfffe0 / d0div) & 0xffff;
  const d2v = (d2 - ((0x26 * w16(d1)) & 0xffff)) & 0xffff;
  let d3v = (0x7fff - d2v) & 0xffff; d3v = ((d3v * 0xc000) >>> 16) & 0xffff;
  const sl = seed.length;
  let d0 = (s8(seed[sl - 1] ?? 0) << 7) & 0xffff;
  let d1w = (s8(((seed[sl - 1] ?? 0) - (seed[sl - 2] ?? 0)) & 0xff) << 7) & 0xffff; let a3 = 0;
  for (let i = 0; i <= last; i++) {
    d1w = (((w16(d1w) * w16(d3v)) >> 16) << 1) & 0xffff;
    const s5 = ((s8(wave1[a3++] ?? 0) << 7) - w16(d0)) & 0xffff;
    d1w = (d1w + ((((w16(s5) * w16(d2v)) >> 16) << 1) & 0xffff)) & 0xffff; d0 = (d0 + d1w) & 0xffff;
    out[i] = (((w16(d0) >> 7) << 24) >> 24) & 0xff;
  }
  return out;
}

interface Entry { addr: number; val: number; wr: number; }
function altSpans(trace: Entry[], minLen: number): { start: number; len: number; reads: Uint8Array; writes: Uint8Array; wbase: number }[] {
  const spans: { start: number; len: number; reads: Uint8Array; writes: Uint8Array; wbase: number }[] = [];
  let i = 0;
  while (i + 1 < trace.length) {
    if (trace[i].wr === 0 && trace[i + 1].wr === 1) {
      const reads: number[] = [trace[i].val]; const writes: number[] = [trace[i + 1].val];
      const wbase = trace[i + 1].addr; let k = i + 2;
      while (k + 1 < trace.length && trace[k].wr === 0 && trace[k + 1].wr === 1 && trace[k + 1].addr === trace[k - 1].addr + 1) {
        reads.push(trace[k].val); writes.push(trace[k + 1].val); k += 2;
      }
      if (reads.length >= minLen) spans.push({ start: i, len: reads.length, reads: Uint8Array.from(reads), writes: Uint8Array.from(writes), wbase });
      i = k;
    } else i++;
  }
  return spans;
}

async function scanModule(name: string, maxTicks: number): Promise<string[]> {
  const hits: string[] = [];
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  try {
    if (mod._uade_wasm_init(44100) !== 0) return hits;
    addCompanions(mod, loadInstrCompanions());
    const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
    mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
    if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) { mod._free(ptr); mod._free(hp); return hits; }
    mod._free(ptr); mod._free(hp);
    mod._uade_wasm_enable_acctrace(1);
    const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), AT = mod._malloc(200000 * 2 * 4);
    for (let c = 0; c < maxTicks; c++) {
      if (mod._uade_wasm_render(L, R, 882) <= 0) break;
      const trace: Entry[] = []; let got: number;
      do {
        got = mod._uade_wasm_drain_acctrace(AT, 200000);
        const hh = new Uint32Array(mod.HEAPU8.buffer);
        for (let i = 0; i < got; i++) { const addr = hh[(AT >> 2) + i * 2]; const w = hh[(AT >> 2) + i * 2 + 1]; trace.push({ addr, val: w & 0xff, wr: (w >> 16) & 1 }); }
      } while (got === 200000);
      for (const sp of altSpans(trace, 12)) {
        if (sp.reads.every((v, i) => v === sp.writes[i])) continue; // verbatim copy → skip
        const seedArr: number[] = [];
        for (let j = sp.start - 1; j >= 0 && seedArr.length < 4; j--) { if (trace[j].wr === 0) seedArr.unshift(trace[j].val); else break; }
        const seed = Uint8Array.from(seedArr.length ? seedArr : [0, 0]);
        let hit = -1;
        for (let d1 = -128; d1 <= 127; d1++) { const p = calc14(seed, sp.reads, d1, sp.len); let ok = true; for (let i = 0; i < sp.len; i++) if (p[i] !== sp.writes[i]) { ok = false; break; } if (ok) { hit = d1; break; } }
        hits.push(`  tick${c} span len=${sp.len} wbase=0x${sp.wbase.toString(16)} calc14=${hit !== -1 ? `d1=${hit} EXACT` : 'no'} wave=${hexOf(sp.reads.slice(0, 12))} out=${hexOf(sp.writes.slice(0, 12))}`);
        if (hits.length >= 6) { mod._free(L); mod._free(R); mod._free(AT); return hits; }
      }
    }
    mod._free(L); mod._free(R); mod._free(AT);
  } finally { try { mod._uade_wasm_cleanup(); } catch { /* ignore */ } }
  return hits;
}

async function main(): Promise<void> {
  const maxTicks = parseInt(process.argv[2] ?? '120', 10);
  const sub = process.argv[3] ?? '';
  const mods = readdirSync(CORPUS_DIR).filter((f) => !f.startsWith('.') && f.toLowerCase().includes(sub.toLowerCase()) && /\.(src|pc)$|^mule|^Lightforce|^kompo2$/i.test(f));
  console.log(`[p7n] scanning ${mods.length} modules, ${maxTicks} ticks each`);
  let found = 0;
  for (const m of mods) {
    let hits: string[] = [];
    try { hits = await scanModule(m, maxTicks); } catch (e) { console.log(`  ${m}: ERROR ${(e as Error).message}`); continue; }
    if (hits.length) { found++; console.log(`\n### ${m} — ${hits.length} non-verbatim span(s):`); for (const h of hits) console.log(h); }
  }
  console.log(`\n[p7n] done. ${found} module(s) with feedback/DSP synth spans.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
