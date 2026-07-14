/**
 * p7i-ordered-oracle.ts — THE Gate-1 feedback validator, now with EXACT ground truth.
 *
 * p7h bound voice↔record↔channel: voiceBase = loc - 0xBA (unique record match, stride
 * 0x1BA, confirmed across all 4 channels). So per tick we can read the REAL:
 *   record ptr = u32(voice+0x04)
 *   arpIdx     = u16(voice+0x12);  arpTab = u32(rec+0x12);  d1 = s8(arpTab[arpIdx])
 *   wave1 (A3) = u32(rec+0x1A);    type = rec+0x23;  wwl = rec+0x22
 *   output     = chip[loc .. loc+wwl*2]   (== voice+0xA6, the A2 write dest)
 *
 * CALC13/14 (type>=4): src (d0/d1w seed) = A4 = latched? outputBuffer : wave1; the loop
 * streams A3=wave1 forward. Steady-state latched → src = PREVIOUS tick's output buffer.
 * So predict[t] = calc14(output[t-1], wave1[t], d1[t], wwl*2). We brute the arp/wave tick
 * alignment (t vs t-1) and report best byte-exact / first-diff per feedback channel.
 *
 * Usage: npx tsx tools/suntronic-re/p7i-ordered-oracle.ts [module.src]
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
  const bytes = new Uint8Array(mod.HEAPU8.buffer.slice(p, p + len)); mod._free(p); return bytes;
}
const u32 = (b: Uint8Array, o: number): number =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const hexOf = (b: Uint8Array): string => {
  let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s;
};
const ham = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n;
};
const firstDiff = (a: Uint8Array, b: Uint8Array): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1;
};

/** Faithful CALC13/14 transcription. src = feedback seed buffer; wave1 = A3 stream. */
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

interface Snap { loc: number; wwl: number; type: number; d1: number; out: Uint8Array; wave1: Uint8Array; arpIdx: number; }

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
  mod._free(ptr); mod._free(hp); mod._uade_wasm_enable_paula_log(1);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  const loc = [0, 0, 0, 0], len = [0, 0, 0, 0], lch = [0, 0, 0, 0];
  const perCh: Snap[][] = [[], [], [], []];
  for (let c = 0; c < 300; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512); const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v; else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
    // snapshot each channel AFTER this tick's synth write
    for (let ch = 0; ch < 4; ch++) {
      if (!loc[ch] || !len[ch]) continue;
      const wwl = len[ch]; const byteLen = wwl * 2;
      const voiceBase = loc[ch] - 0xba;
      const v = readMem(mod, voiceBase, 0x18);
      const recPtr = u32(v, 4);
      if (recPtr < 0x400 || recPtr >= 0x200000) continue;
      const rec = readMem(mod, recPtr, 0x24);
      if (rec[0x22] !== wwl) continue;
      const type = rec[0x23];
      const arpTab = u32(rec, 0x12), wave1Ptr = u32(rec, 0x1a);
      const arpIdx = ((v[0x12] << 8) | v[0x13]) & 0xffff;
      let d1 = 0;
      if (arpTab >= 0x400 && arpTab < 0x200000) d1 = s8(readMem(mod, arpTab + arpIdx, 1)[0]);
      const wave1 = (wave1Ptr >= 0x400 && wave1Ptr < 0x200000) ? readMem(mod, wave1Ptr, byteLen) : new Uint8Array(byteLen);
      const out = readMem(mod, loc[ch], byteLen);
      perCh[ch].push({ loc: loc[ch], wwl, type, d1, out, wave1, arpIdx });
    }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // Validate feedback channels (type >= 4). predict[t] = calc14(out[t-1], wave1[?], d1[?]).
  for (let ch = 0; ch < 4; ch++) {
    const snaps = perCh[ch]; if (snaps.length < 4) continue;
    const type = snaps[snaps.length - 1].type;
    if (type < 4) { console.log(`[p7i] ch${ch}: type=${type} (not feedback) — skip`); continue; }
    const byteLen = snaps[0].wwl * 2;
    // find first index where the buffer settled (loc stable, type>=4)
    let best = { ham: 9999, t: -1, waveShift: 0, arpShift: 0, fd: -1 };
    for (let t = 2; t < snaps.length; t++) {
      if (snaps[t].type < 4 || snaps[t - 1].out.length !== byteLen) continue;
      const src = snaps[t - 1].out;
      for (const waveShift of [0, -1]) {
        for (const arpShift of [0, -1]) {
          const ws = snaps[t + waveShift]; const as = snaps[t + arpShift];
          if (!ws || !as) continue;
          const pred = calc14(src, ws.wave1, as.d1, byteLen);
          const h = ham(pred, snaps[t].out);
          if (h < best.ham) best = { ham: h, t, waveShift, arpShift, fd: firstDiff(pred, snaps[t].out) };
        }
      }
    }
    console.log(`[p7i] ch${ch} type=${type} byteLen=${byteLen} bestHam=${best.ham}/${byteLen} @tick${best.t} waveShift=${best.waveShift} arpShift=${best.arpShift} firstDiff@${best.fd} d1=${best.t >= 0 ? snaps[best.t].d1 : '?'}`);
    if (best.t >= 0 && best.ham > 0) {
      const src = snaps[best.t - 1].out;
      const ws = snaps[best.t + best.waveShift], as = snaps[best.t + best.arpShift];
      const pred = calc14(src, ws.wave1, as.d1, byteLen);
      const s = Math.max(0, best.fd - 2);
      console.log(`     src [${s}..]=${hexOf(src.slice(s, s + 12))}`);
      console.log(`     w1  [${s}..]=${hexOf(ws.wave1.slice(s, s + 12))}`);
      console.log(`     pred[${s}..]=${hexOf(pred.slice(s, s + 12))}`);
      console.log(`     uade[${s}..]=${hexOf(snaps[best.t].out.slice(s, s + 12))}`);
    } else if (best.ham === 0) {
      console.log(`     *** BYTE-EXACT MATCH — CALC14 CONFIRMED ***`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
