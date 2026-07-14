/**
 * p7-feedback-oracle.ts — Probe P7: validate the SunTronic type-else (CALC13/14)
 * LIVE-BUFFER FEEDBACK recurrence against ordered UADE chip-RAM snapshots.
 *
 * P5 dedups buffers to a Set → cannot test a tick→tick recurrence. The feedback
 * types (type-1 CALC3 and type-else CALC14) synthesise from the voice's own play
 * buffer (voice+0xA6 = A2), i.e. the PREVIOUS tick's output, latched by bit1 of
 * voice+0x14 (disasm DP_Suntronic.s @715-755). So the model is:
 *
 *     buffer[t] = CALC14( prevBuffer = buffer[t-1], wave1, D1[t] )      (t >= 1)
 *     buffer[0] = CALC14( prevBuffer = wave1,        wave1, D1[0] )     (unlatched)
 *
 * This probe captures the ORDERED per-tick play buffer for each channel, then for
 * every type-else instrument searches for a consecutive stretch of captured
 * buffers that the fresh CALC14 transcription below reproduces from its own
 * predecessor (sweeping D1 over the instrument's arp table). A long exact stretch
 * confirms both the feedback wiring AND the CALC14 math before it is ported into
 * SunTronicSynthVoice.ts.
 *
 * Usage: npx tsx tools/suntronic-re/p7-feedback-oracle.ts [module.src]
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score, type SunSynthInstrument } from '../../src/lib/import/formats/SunTronicV13';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

const hexOf = (b: Int8Array | Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0');
  return s;
};

function readMem(mod: AnyMod, addr: number, len: number): Int8Array {
  const p = mod._malloc(len);
  mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Int8Array(mod.HEAPU8.buffer.slice(p, p + len));
  mod._free(p);
  return bytes;
}

/**
 * Faithful CALC13/14 transcription (disasm @715-755). `src` = the A4 buffer (the
 * play buffer when latched, else wave1); `wave1` = the A3 stream. Returns the
 * byteLen-sample output. All intermediate arithmetic follows the 68k widths.
 */
function calc14(src: Int8Array, wave1: Int8Array, d1: number, byteLen: number): Int8Array {
  const out = new Int8Array(byteLen);
  const last = byteLen - 1; // D4
  const s8 = (b: number): number => (b << 24) >> 24;
  const w16 = (x: number): number => (x << 16) >> 16; // sign-extend low 16

  const d0div = (d1 & 0xff) + 0x20;
  if (d0div === 0) return out;
  const d2 = (Math.floor(0xfffe0 / d0div) & 0xffff);          // DIVU quotient (16-bit)
  const d3mul = (0x26 * w16(d1)) & 0xffff;                     // MULU #$0026 low word
  let d2v = (d2 - d3mul) & 0xffff;                             // SUB.W
  let d3v = (0x7fff - d2v) & 0xffff;                           // SUB.W from 0x7FFF
  d3v = ((d3v * 0xc000) >>> 16) & 0xffff;                      // MULU #-$4000; SWAP → high word

  let d0 = (s8(src[last] ?? 0) << 7) & 0xffff;                 // A4[D4] << 7
  const diff = s8(((src[last] ?? 0) - (src[last - 1] ?? 0)) & 0xff); // SUB.B then EXT.W
  let d1w = (diff << 7) & 0xffff;                              // << 7
  let a3 = 0;
  for (let i = 0; i <= last; i++) {
    // D1 = ((D1 * D3) >> 16) << 1
    d1w = ((((w16(d1w) * w16(d3v)) >> 16) << 1)) & 0xffff;
    const s5 = ((s8(wave1[a3++] ?? 0) << 7) - w16(d0)) & 0xffff; // wave1[i]<<7 - D0
    const d5 = ((((w16(s5) * w16(d2v)) >> 16) << 1)) & 0xffff;   // ((D5*D2)>>16)<<1
    d1w = (d1w + d5) & 0xffff;                                   // ADD.W
    d0 = (d0 + d1w) & 0xffff;                                    // ADD.W
    out[i] = ((w16(d0) >> 7) << 24) >> 24;                       // D0 >> 7 → byte
  }
  void d2v;
  return out;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const elseInsts = score.synthInstruments.filter(
    (i) => i.synthType !== 0 && i.synthType !== 1 && i.synthType !== 2 && i.synthType !== 3 && i.waveWordLen > 0,
  );
  console.log(`[p7] ${name}: ${elseInsts.length} type-else (feedback) instruments`);

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
  // Ordered per-channel capture: sequence of {loc,hex} snapshots, one per tick.
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
      const bytes = readMem(mod, loc[ch], len[ch] * 2);
      seq[ch].push({ loc: loc[ch], hex: hexOf(bytes), len: len[ch] * 2 });
    }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // For each channel, find the longest run where consecutive same-loc,same-len
  // buffers are reproduced by calc14(prev, wave1, D1) for SOME type-else inst and
  // SOME D1 in its arp table. Report the best run.
  let best = { ch: -1, inst: -1, d1: 0, run: 0, total: 0 };
  for (let ch = 0; ch < 4; ch++) {
    const s = seq[ch];
    for (const inst of elseInsts) {
      const bl = inst.waveWordLen * 2;
      const arp = Array.from(inst.arpTable.slice(0, Math.max(1, inst.arpLen)));
      // Triple-buffered: consecutive ticks land at DIFFERENT rotating locs, so do
      // NOT require same loc — only same buffer length (skip sample-instrument runs).
      for (let i = 1; i < s.length; i++) {
        if (s[i].len !== bl || s[i - 1].len !== bl) continue;
        const prev = Int8Array.from(s[i - 1].hex.match(/../g)!.map((x) => (parseInt(x, 16) << 24) >> 24));
        // sweep D1 over arp values; a match means the recurrence holds for this step
        for (const d1 of arp) {
          const pred = hexOf(calc14(prev, inst.wave1, d1, bl));
          if (pred === s[i].hex) {
            // extend the run forward greedily with the arp advancing
            let run = 1;
            let ai = arp.indexOf(d1);
            for (let j = i + 1; j < s.length; j++) {
              if (s[j].len !== bl) break;
              ai = (ai + 1) % arp.length;
              const pv = Int8Array.from(s[j - 1].hex.match(/../g)!.map((x) => (parseInt(x, 16) << 24) >> 24));
              if (hexOf(calc14(pv, inst.wave1, arp[ai], bl)) !== s[j].hex) break;
              run++;
            }
            if (run > best.run) best = { ch, inst: score.synthInstruments.indexOf(inst), d1, run, total: s.length };
          }
        }
      }
    }
  }
  console.log(`[p7] best feedback run: ch=${best.ch} inst#${best.inst} d1=${best.d1} run=${best.run} (of ${best.total} ticks on that ch)`);
  if (best.run >= 3) console.log('[p7] FEEDBACK RECURRENCE CONFIRMED — port calc14(prev=playBuffer, wave1, D1) into renderSmooth.');
  else console.log('[p7] no long run — model or CALC14 math still off; inspect first-diff.');

  // Also report, per channel, the buffer-length histogram + whether consecutive
  // buffers at the same loc actually CHANGE (feedback signature) or are static.
  for (let ch = 0; ch < 4; ch++) {
    const s = seq[ch]; if (!s.length) continue;
    let changing = 0, sameLoc = 0;
    for (let i = 1; i < s.length; i++) if (s[i].loc === s[i - 1].loc) { sameLoc++; if (s[i].hex !== s[i - 1].hex) changing++; }
    console.log(`[p7]   ch${ch}: ${s.length} ticks, ${sameLoc} same-loc steps, ${changing} of them CHANGE buffer`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
