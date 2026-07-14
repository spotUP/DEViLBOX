/**
 * p7f-backscan.ts — link the live SunTronic voice struct to its instrument record
 * so we can read the EXACT (wave1, d1, feedback seed) UADE used per tick, killing
 * the inst↔channel guessing that blocks Gate-1 feedback validation.
 *
 * Chain (all pointer hops, no content matching):
 *   1. capture per-channel steady loc via Paula log.
 *   2. for each parsed type-else inst, its wave1 addr = record+0x1a value; but we do
 *      not know the record base. So scan ALL chip RAM (module region + full range) for
 *      a u32 == wave1addr → candidate record @ (foundAddr - 0x1a).
 *   3. scan for a u32 == recordBase → candidate voice @ (foundAddr - 4) (voice+4 = rec ptr).
 *   4. verify voice+0xA6 == some channel's current loc → that binds voice↔channel.
 *   5. read voice+0x12 = arp index → d1 = arpTable[arpIdx % arpLen]; voice+0x14 bit1 = latch.
 *
 * Usage: npx tsx tools/suntronic-re/p7f-backscan.ts [module.src]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
function readMem(mod: AnyMod, addr: number, len: number): Uint8Array {
  const p = mod._malloc(len); mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Uint8Array(mod.HEAPU8.buffer.slice(p, p + len)); mod._free(p); return bytes;
}
const u32 = (b: Uint8Array, o: number): number =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** scan [lo,hi) chip RAM for every offset whose big-endian u32 == target. */
function scanU32(buf: Uint8Array, base: number, target: number): number[] {
  const hits: number[] = [];
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0 === target) {
      hits.push(base + i);
    }
  }
  return hits;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  const insts = score.synthInstruments
    .map((inst, idx) => ({ inst, idx }))
    .filter(({ inst }) => inst.waveWordLen > 0 && Array.from(inst.wave1).some((b) => b !== 0));

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
  for (let c = 0; c < 60; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512); const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v; else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
  }
  console.log(`[p7f] steady locs: ${loc.map((l, i) => `ch${i}=0x${l.toString(16)}(len${len[i] * 2})`).join(' ')}`);

  // module bounds + full-chip snapshot (0..2MB, but read in chunks to stay in wasm heap).
  const mb = mod._malloc(8); mod._uade_wasm_get_module_bounds(mb);
  const mbb = new Uint8Array(mod.HEAPU8.buffer.slice(mb, mb + 8)); mod._free(mb);
  const modBase = u32(mbb, 0), modSize = u32(mbb, 4);
  console.log(`[p7f] module region: base=0x${modBase.toString(16)} size=0x${modSize.toString(16)}`);

  // Grab a big chip snapshot 0x400..0x200000 for scanning.
  const SCAN_LO = 0x400, SCAN_HI = 0x200000;
  const snap = readMem(mod, SCAN_LO, SCAN_HI - SCAN_LO);

  // wave1 addr for a parsed inst = the value stored at record+0x1a. We don't know the
  // record base in chip RAM, but wave1 CONTENT was located earlier at fixed addrs. Here
  // we instead scan for records directly: a record has u32@+0x1a == wave1 CONTENT addr.
  // We don't have that addr from the parser (parser gives file-relative). So: locate the
  // wave1 content in chip first (unique byte run), then backscan pointers to it.
  for (const { inst, idx } of insts) {
    const w1 = inst.wave1; const wlen = Math.min(w1.length, 16);
    if (wlen < 8) continue;
    // find wave1 content addr in chip (first exact match of first `wlen` bytes)
    let waveAddr = -1;
    outer: for (let i = 0; i + wlen <= snap.length; i++) {
      for (let k = 0; k < wlen; k++) if (snap[i + k] !== (w1[k] & 0xff)) continue outer;
      waveAddr = SCAN_LO + i; break;
    }
    if (waveAddr < 0) { console.log(`[p7f] inst#${idx}: wave1 content NOT found in chip`); continue; }

    // backscan: u32 == waveAddr → record @ (hit - 0x1a)
    const recPtrHits = scanU32(snap, SCAN_LO, waveAddr).map((a) => a - 0x1a);
    // for each candidate record base, backscan u32 == recBase → voice @ (hit - 4)
    const lines: string[] = [];
    for (const recBase of recPtrHits) {
      if (recBase < SCAN_LO || recBase >= SCAN_HI) continue;
      const voiceHits = scanU32(snap, SCAN_LO, recBase).map((a) => a - 4);
      for (const vb of voiceHits) {
        if (vb < SCAN_LO || vb + 0xac >= SCAN_HI) continue;
        const vplay = u32(snap, vb + 0xa6 - SCAN_LO);
        const chMatch = loc.findIndex((l) => l === vplay);
        const arpIdx = (snap[vb + 0x12 - SCAN_LO] << 8) | snap[vb + 0x13 - SCAN_LO];
        const latch = snap[vb + 0x14 - SCAN_LO];
        lines.push(`      voice@0x${vb.toString(16)} rec@0x${recBase.toString(16)} +0xA6=0x${vplay.toString(16)}${chMatch >= 0 ? ` == ch${chMatch} LOC` : ''} arpIdx=${arpIdx} latch=0x${latch.toString(16)}`);
        if (chMatch >= 0) {
          const arp = Array.from(inst.arpTable.slice(0, Math.max(1, inst.arpLen)));
          const d1 = arp[arpIdx % Math.max(1, arp.length)];
          lines[lines.length - 1] += `  → d1=${d1} (arpLen=${inst.arpLen})`;
        }
      }
    }
    console.log(`[p7f] inst#${idx} type=${inst.synthType} wave1@0x${waveAddr.toString(16)} recCandidates=${recPtrHits.length} voiceCandidates=${lines.length}`);
    for (const ln of lines.slice(0, 8)) console.log(ln);
  }

  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
