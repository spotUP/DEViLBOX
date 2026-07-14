/**
 * p7h-find-voice.ts — find the true voiceBase by validation, using the AUTHORITATIVE
 * MEGAEFFECTS ABI from DP_Suntronic.s:
 *   A1 = record ptr = LONG at voice+0x04   (GNN8: MOVE.L A3,4(A0))
 *   record+0x22 = waveWordLen (== Paula LEN in words), record+0x23 = type (0..8)
 *   arp table = LONG at record+0x12, arp index = WORD at voice+0x12, d1 = arp[idx]
 *   A3 = wave1 = LONG record+0x1A, A4 = feedback src = LONG record+0x1E
 *   output A2 = voice+0xA6 ; voices stride 0x130.
 *
 * Sweep candidate voiceBase = loc - delta over delta in a window; accept the delta where
 * u32@(voiceBase+4) points to a record with mem[+0x22]==wantWWL and mem[+0x23]<=8.
 *
 * Usage: npx tsx tools/suntronic-re/p7h-find-voice.ts [module.src]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
function readMem(mod: AnyMod, addr: number, len: number): Uint8Array {
  const p = mod._malloc(len); mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Uint8Array(mod.HEAPU8.buffer.slice(p, p + len)); mod._free(p); return bytes;
}
const u32 = (b: Uint8Array, o: number): number =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const s8 = (x: number): number => (x << 24) >> 24;
const hexOf = (b: Uint8Array): string => {
  let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s;
};

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
  console.log(`[p7h] steady locs: ${loc.map((l, i) => `ch${i}=0x${l.toString(16)}(wwl${len[i]})`).join(' ')}`);

  // Read a wide window around each loc and sweep voiceBase.
  for (let ch = 0; ch < 4; ch++) {
    if (!loc[ch] || !len[ch]) continue;
    const wantWWL = len[ch];
    const WIN = 0x200;                     // read [loc-0x1a0 .. loc+0x60)
    const winBase = loc[ch] - 0x1a0;
    const w = readMem(mod, winBase, WIN);
    const hits: string[] = [];
    for (let delta = 0x60; delta <= 0x1a0; delta += 2) {
      const voiceBase = loc[ch] - delta;
      const vo = voiceBase - winBase;      // offset of voiceBase inside window
      if (vo < 0 || vo + 0x24 > WIN) continue;
      const recPtr = u32(w, vo + 4);
      if (recPtr < 0x400 || recPtr >= 0x200000) continue;
      const rec = readMem(mod, recPtr, 0x24);
      if (rec[0x22] !== wantWWL || rec[0x23] > 8) continue;
      const arpTab = u32(rec, 0x12), wave1 = u32(rec, 0x1a), wave2 = u32(rec, 0x1e);
      const arpIdx = (w[vo + 0x12] << 8) | w[vo + 0x13];
      const latch = w[vo + 0x14];
      const outAtA6 = u32(w, vo + 0xa6);   // may be past window; guard below
      let d1 = 0;
      if (arpTab >= 0x400 && arpTab < 0x200000) {
        const at = readMem(mod, arpTab + (arpIdx & 0xffff), 1); d1 = s8(at[0]);
      }
      hits.push(`  delta=0x${delta.toString(16)} voice@0x${voiceBase.toString(16)} rec@0x${recPtr.toString(16)} type=${rec[0x23]} wwl=${rec[0x22]} arpIdx=${arpIdx} latch=0x${latch.toString(16)} d1=${d1} wave1@0x${wave1.toString(16)} wave2@0x${wave2.toString(16)} arpTab@0x${arpTab.toString(16)}`);
    }
    console.log(`[p7h] ch${ch} loc=0x${loc[ch].toString(16)} wantWWL=${wantWWL} → ${hits.length} candidate voiceBase(s)`);
    for (const h of hits.slice(0, 6)) console.log(h);
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
