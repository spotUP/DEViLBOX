/**
 * p7b-smooth-firstdiff.ts — direct first-diff of the CALC14 transcription against
 * a REAL smooth (low adjacent-delta) fixed-point feedback buffer captured from UADE.
 *
 * p7 reports run=0 because nothing matches. Before touching the math we must know:
 *  (a) which buffer lengths actually appear per channel,
 *  (b) each type-else instrument's byteLen (waveWordLen*2) + wave1,
 *  (c) for a smooth captured buffer B of a matching length, the best calc14(B,wave1,d1)
 *      over the arp table — hamming + first-diff byte dump.
 *
 * Usage: npx tsx tools/suntronic-re/p7b-smooth-firstdiff.ts [module.src]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

const hexOf = (b: Int8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0');
  return s;
};
const toBytes = (hex: string): Int8Array =>
  Int8Array.from(hex.match(/../g)!.map((x) => (parseInt(x, 16) << 24) >> 24));
const maxAdjDelta = (b: Int8Array): number => {
  let m = 0;
  for (let i = 1; i < b.length; i++) m = Math.max(m, Math.abs(b[i] - b[i - 1]));
  return m;
};
const ham = (a: Int8Array, b: Int8Array): number => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if ((a[i] & 0xff) !== (b[i] & 0xff)) n++;
  return n;
};

function readMem(mod: AnyMod, addr: number, len: number): Int8Array {
  const p = mod._malloc(len);
  mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Int8Array(mod.HEAPU8.buffer.slice(p, p + len));
  mod._free(p);
  return bytes;
}

// Faithful CALC13/14 transcription (identical to p7's calc14).
function calc14(src: Int8Array, wave1: Int8Array, d1: number, byteLen: number): Int8Array {
  const out = new Int8Array(byteLen);
  const last = byteLen - 1;
  const s8 = (b: number): number => (b << 24) >> 24;
  const w16 = (x: number): number => (x << 16) >> 16;
  const d0div = (d1 & 0xff) + 0x20;
  if (d0div === 0) return out;
  const d2 = Math.floor(0xfffe0 / d0div) & 0xffff;
  const d3mul = (0x26 * w16(d1)) & 0xffff;
  const d2v = (d2 - d3mul) & 0xffff;
  let d3v = (0x7fff - d2v) & 0xffff;
  d3v = ((d3v * 0xc000) >>> 16) & 0xffff;
  let d0 = (s8(src[last] ?? 0) << 7) & 0xffff;
  const diff = s8(((src[last] ?? 0) - (src[last - 1] ?? 0)) & 0xff);
  let d1w = (diff << 7) & 0xffff;
  let a3 = 0;
  for (let i = 0; i <= last; i++) {
    d1w = (((w16(d1w) * w16(d3v)) >> 16) << 1) & 0xffff;
    const s5 = ((s8(wave1[a3++] ?? 0) << 7) - w16(d0)) & 0xffff;
    const d5 = (((w16(s5) * w16(d2v)) >> 16) << 1) & 0xffff;
    d1w = (d1w + d5) & 0xffff;
    d0 = (d0 + d1w) & 0xffff;
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
    .filter(({ inst }) => ![0, 1, 2, 3].includes(inst.synthType) && inst.waveWordLen > 0);
  console.log(`[p7b] ${name}: ${elseInsts.length} type-else insts`);
  for (const { inst, idx } of elseInsts) {
    console.log(
      `   inst#${idx} type=${inst.synthType} byteLen=${inst.waveWordLen * 2} arpLen=${inst.arpLen} arp=[${Array.from(inst.arpTable.slice(0, Math.max(1, inst.arpLen))).join(',')}]`,
    );
  }

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
  const seq: { loc: number; hex: string; len: number }[][] = [[], [], [], []];
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
    for (let ch = 0; ch < 4; ch++) {
      if (loc[ch] === 0 || len[ch] === 0) continue;
      seq[ch].push({ loc: loc[ch], hex: hexOf(readMem(mod, loc[ch], len[ch] * 2)), len: len[ch] * 2 });
    }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // length histogram per channel
  for (let ch = 0; ch < 4; ch++) {
    const hist = new Map<number, number>();
    for (const s of seq[ch]) hist.set(s.len, (hist.get(s.len) ?? 0) + 1);
    console.log(`[p7b] ch${ch} lengths: ${[...hist.entries()].map(([l, c]) => `${l}:${c}`).join(' ')}`);
  }

  // For each type-else inst, find smooth captured buffers of matching byteLen and
  // first-diff calc14 (best over arp). Also test the fixed-point: calc14(B,w1,d1)==B.
  const SMOOTH = 40; // max adjacent |delta| to call a buffer "smooth"
  for (const { inst, idx } of elseInsts) {
    const bl = inst.waveWordLen * 2;
    const arp = Array.from(inst.arpTable.slice(0, Math.max(1, inst.arpLen)));
    let bestGlobal = { ham: 999, ch: -1, tick: -1, d1: 0, firstDiff: -1, B: '', pred: '' };
    let smoothCount = 0;
    for (let ch = 0; ch < 4; ch++) {
      for (let t = 0; t < seq[ch].length; t++) {
        if (seq[ch][t].len !== bl) continue;
        const B = toBytes(seq[ch][t].hex);
        if (maxAdjDelta(B) > SMOOTH) continue;
        smoothCount++;
        for (const d1 of arp) {
          const pred = calc14(B, inst.wave1, d1, bl); // fixed-point test
          const h = ham(pred, B);
          if (h < bestGlobal.ham) {
            let fd = -1;
            for (let i = 0; i < bl; i++) if ((pred[i] & 0xff) !== (B[i] & 0xff)) { fd = i; break; }
            bestGlobal = { ham: h, ch, tick: t, d1, firstDiff: fd, B: hexOf(B), pred: hexOf(pred) };
          }
        }
      }
    }
    console.log(
      `[p7b] inst#${idx} bl=${bl} smoothBufs=${smoothCount} bestFixedPointHam=${bestGlobal.ham}/${bl} @ch${bestGlobal.ch} tick${bestGlobal.tick} d1=${bestGlobal.d1} firstDiff@${bestGlobal.firstDiff}`,
    );
    if (bestGlobal.ham > 0 && bestGlobal.ham < bl && bestGlobal.firstDiff >= 0) {
      const s = Math.max(0, bestGlobal.firstDiff - 2);
      console.log(`         B   [${s}..]=${bestGlobal.B.slice(s * 2, s * 2 + 24)}`);
      console.log(`         pred[${s}..]=${bestGlobal.pred.slice(s * 2, s * 2 + 24)}`);
      console.log(`         w1      =${hexOf(inst.wave1).slice(0, 24)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
