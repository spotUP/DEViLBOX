/**
 * p7d-tick0-match.ts — deterministic identity check with NO channel guessing.
 *
 * On a note-start the feedback latch (bit1 voice+0x14) is clear, so the FIRST synth
 * tick runs CALC13 unlatched: A4 = A3 = wave1. Thus the first buffer of a note is
 *     buf0 = calc14(wave1, wave1, arp[0])           (arp index reset to 0)
 * computable from each parsed instrument's OWN wave1 — no need to know which channel
 * it plays on. If buf0 (or its first few feedback iterates) appears exactly in the
 * captured chip-RAM buffers, the CALC14 math + wave1 parse are confirmed for that
 * instrument; the best hamming localises any remaining bug.
 *
 * Usage: npx tsx tools/suntronic-re/p7d-tick0-match.ts [module.src]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const w16 = (x: number): number => (x << 16) >> 16;
const hexOf = (b: Int8Array): string => {
  let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0'); return s;
};
const ham = (a: Int8Array, b: Int8Array): number => {
  let n = 0; for (let i = 0; i < a.length; i++) if ((a[i] & 0xff) !== (b[i] & 0xff)) n++; return n;
};
function readMem(mod: AnyMod, addr: number, len: number): Int8Array {
  const p = mod._malloc(len); mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Int8Array(mod.HEAPU8.buffer.slice(p, p + len)); mod._free(p); return bytes;
}
function calc14(src: Int8Array, wave1: Int8Array, d1: number, byteLen: number): Int8Array {
  const out = new Int8Array(byteLen); const last = byteLen - 1;
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
    out[i] = ((w16(d0) >> 7) << 24) >> 24;
  }
  return out;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const elseInsts = score.synthInstruments
    .map((inst, idx) => ({ inst, idx }))
    .filter(({ inst }) => ![0, 1, 2, 3].includes(inst.synthType) && inst.waveWordLen > 0
      && Array.from(inst.wave1).some((b) => b !== 0));
  console.log(`[p7d] ${name}: ${elseInsts.length} type-else insts with non-zero wave1`);

  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp); mod._uade_wasm_enable_paula_log(1);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  const loc = [0, 0, 0, 0], len = [0, 0, 0, 0], lch = [0, 0, 0, 0];
  const caps = new Map<string, Int8Array>();
  for (let c = 0; c < 400; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512); const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v; else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
    for (let ch = 0; ch < 4; ch++) {
      if (!loc[ch] || !len[ch]) continue;
      const b = readMem(mod, loc[ch], len[ch] * 2); caps.set(hexOf(b), b);
    }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  console.log(`[p7d] captured ${caps.size} distinct buffers`);

  for (const { inst, idx } of elseInsts) {
    const bl = inst.waveWordLen * 2;
    const arp = Array.from(inst.arpTable.slice(0, Math.max(1, inst.arpLen)));
    // unlatched tick0 = calc14(wave1, wave1, arp[0]); then feed forward a few ticks.
    let buf = calc14(inst.wave1, inst.wave1, arp[0], bl);
    let bestOverall = 999, bestTick = -1, bestHex = '', predHex = '';
    for (let t = 0; t < Math.min(6, arp.length); t++) {
      // exact-match search
      if (caps.has(hexOf(buf))) { bestOverall = 0; bestTick = t; bestHex = hexOf(buf); predHex = hexOf(buf); break; }
      // best hamming among same-length captures
      for (const [hx, b] of caps) {
        if (b.length !== bl) continue;
        const h = ham(buf, b);
        if (h < bestOverall) { bestOverall = h; bestTick = t; bestHex = hx; predHex = hexOf(buf); }
      }
      // feed forward: latched, src = prev buf, wave1 stream, arp advances
      buf = calc14(buf, inst.wave1, arp[(t + 1) % arp.length], bl);
    }
    console.log(`[p7d] inst#${idx} bl=${bl} bestHam=${bestOverall}/${bl} @tick${bestTick}`);
    if (bestOverall > 0 && bestOverall < bl) {
      console.log(`        pred=${predHex.slice(0, 32)}`);
      console.log(`        uade=${bestHex.slice(0, 32)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
