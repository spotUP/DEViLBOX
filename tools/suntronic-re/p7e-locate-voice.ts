/**
 * p7e-locate-voice.ts — locate the SunTronic voice structs in chip RAM so we can
 * read the EXACT record pointer (→ wave1, type, arp) UADE used per channel, killing
 * the inst↔channel guessing that blocks the feedback validation.
 *
 * MEGAEFFECTS writes the timbre to A2 = voice+0xA6 (a FIXED chip address per voice);
 * the play routine then copies voice+0xA6 into one of 3 rotating Paula buffers and
 * points AUDxLC there. So the content at the rotating Paula loc == the content at the
 * fixed voice+0xA6 for that tick. We scan chip RAM for a channel's current loc content
 * at a DIFFERENT, stable address → that address is voice+0xA6 → voiceBase = addr-0xA6.
 * Then read voiceBase+4 = record ptr, record+0x1a = wave1 ptr, +0x22 = waveWordLen,
 * +0x23 = type, +0x12 = arp table ptr, voiceBase+0x12 = arp index.
 *
 * Usage: npx tsx tools/suntronic-re/p7e-locate-voice.ts [module.src]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const hexOf = (b: Uint8Array | Int8Array): string => {
  let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] & 0xff).toString(16).padStart(2, '0'); return s;
};
function readMem(mod: AnyMod, addr: number, len: number): Uint8Array {
  const p = mod._malloc(len); mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Uint8Array(mod.HEAPU8.buffer.slice(p, p + len)); mod._free(p); return bytes;
}
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

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
  // render ~30 ticks to reach steady state
  for (let c = 0; c < 30; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512); const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v; else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
  }
  console.log(`[p7e] steady locs: ${loc.map((l, i) => `ch${i}=0x${l.toString(16)}(len${len[i] * 2})`).join(' ')}`);

  // MEGAEFFECTS writes A2 = voice+0xA6 directly at the Paula-read address, so
  // voiceBase = loc - 0xA6. Read the record pointer + synth fields directly.
  for (let ch = 0; ch < 4; ch++) {
    if (!loc[ch] || !len[ch]) continue;
    for (const a of [loc[ch]]) {
      const voiceBase = a - 0xa6;
      const vb = readMem(mod, voiceBase, 0x28);
      const recPtr = u32(vb, 4);
      console.log(`[p7e] ch${ch} loc=0x${a.toString(16)} voiceBase=0x${voiceBase.toString(16)} +0..0x28=${hexOf(vb)} recPtr=0x${recPtr.toString(16)}`);
      if (recPtr < 0x400 || recPtr > 0x200000) continue;
      const rec = readMem(mod, recPtr, 0x24);
      const wave1 = u32(rec, 0x1a), wave2 = u32(rec, 0x1e), arpTab = u32(rec, 0x12);
      const wwl = rec[0x22], type = rec[0x23], arpLen = (rec[0x16] << 8) | rec[0x17];
      const arpIdx = (vb[0x12] << 8) | vb[0x13];
      console.log(`        voice@0x${voiceBase.toString(16)} rec@0x${recPtr.toString(16)} type=${type} wwl=${wwl} arpLen=${arpLen} arpIdx=${arpIdx} wave1@0x${wave1.toString(16)} wave2@0x${wave2.toString(16)} arp@0x${arpTab.toString(16)}`);
      if (wave1 >= 0x400 && wave1 < 0x200000 && wwl > 0) {
        const w1 = readMem(mod, wave1, Math.min(wwl * 2, 32));
        console.log(`        wave1[0..]=${hexOf(w1)}`);
      }
      if (arpTab >= 0x400 && arpTab < 0x200000 && arpLen > 0) {
        const at = readMem(mod, arpTab, Math.min(arpLen, 8));
        const cur = readMem(mod, arpTab + (arpIdx % Math.max(1, arpLen)), 1);
        console.log(`        arp[0..]=${Array.from(at).map((x) => (x << 24) >> 24).join(',')} … curD1=${(cur[0] << 24) >> 24}`);
      }
    }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
