/**
 * p7g-voice-dump.ts — anchor on voiceBase = loc - 0xA6 (MEGAEFFECTS writes output to
 * A2 = voice+0xA6, which is the Paula-read addr at steady state), then find the record
 * pointer BY VALIDATION rather than by a fixed offset: scan every 4-byte-aligned u32 in
 * the voice struct as a candidate record ptr P; a real record has mem[P+0x22]=waveWordLen
 * (== byteLen/2 for that channel) and mem[P+0x23]=synthType (a small enum). This binds
 * voice↔record↔channel and yields the exact per-channel (waveWordLen, type, wave1off, arpIdx).
 *
 * Usage: npx tsx tools/suntronic-re/p7g-voice-dump.ts [module.src]
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
  console.log(`[p7g] steady locs: ${loc.map((l, i) => `ch${i}=0x${l.toString(16)}(byteLen${len[i] * 2})`).join(' ')}`);

  for (let ch = 0; ch < 4; ch++) {
    if (!loc[ch] || !len[ch]) continue;
    const wantWWL = len[ch]; // waveWordLen == LEN (words)
    const voiceBase = loc[ch] - 0xa6;
    const v = readMem(mod, voiceBase, 0xb0);
    console.log(`[p7g] ch${ch} voiceBase=0x${voiceBase.toString(16)} wantWWL=${wantWWL}`);
    console.log(`      voice[0x00..0x30]=${hexOf(v.slice(0, 0x30))}`);
    // scan every 4-byte-aligned u32 field as a candidate record ptr
    for (let off = 0; off + 4 <= 0xa6; off += 2) {
      const P = u32(v, off);
      if (P < 0x400 || P >= 0x200000) continue;
      const rec = readMem(mod, P, 0x24);
      const wwl = rec[0x22], type = rec[0x23];
      if (wwl === wantWWL && type <= 8) {
        const wave1off = u32(rec, 0x1a), wave2off = u32(rec, 0x1e), arpTab = u32(rec, 0x12);
        const arpIdx = (v[0x12] << 8) | v[0x13];
        console.log(`      MATCH voice+0x${off.toString(16)} → rec@0x${P.toString(16)} type=${type} wwl=${wwl} wave1off=0x${wave1off.toString(16)} wave2off=0x${wave2off.toString(16)} arpTabOff=0x${arpTab.toString(16)} arpIdx=${arpIdx}`);
        console.log(`            rec[0x10..0x24]=${hexOf(rec.slice(0x10, 0x24))}`);
      }
    }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
