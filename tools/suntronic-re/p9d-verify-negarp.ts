/**
 * p9d-verify-negarp.ts — verify the NEGATIVE-arp consecutive-delta pulse body
 * @0x26d4a against real UADE output (kompo03.src fires it with arps {-63..-3}).
 *
 * The capture ABI only lands on the interrupt-ENTRY PC (0x26c8a) — it cannot sample
 * a body PC (verified: arming 0x26d4a/0x26cc0/etc = 0 fires while entry fires 514x).
 * So we capture at entry and reconstruct the body I/O from the disasm semantics:
 *
 *   a0 = r[8] (voice)   a1 = r[9] (instrument record)   a2 = r[10] (play buffer)
 *   d0 = r[0] (arp selector, signed)   d6 = r[6] (byteLen-1)
 *
 * FIRST-TICK fires only (btst #1,$14(a0) clear at entry, before the body's bset):
 * source = wave1 = *(a1+0x1a) — a separate readable buffer. After render() the play
 * buffer at a2 holds THIS tick's finished output. Run deltaKernel(wave1, arp), assert
 * byte-exact. Continuation ticks (latch set) read the in-place feedback buffer we
 * cannot recover post-render, so they are skipped here — first-tick fires alone lock
 * the kernel (the recurrence form is identical; only the source buffer differs).
 *
 * Loaded body (disasm 0x26d4a-0x26d6a):
 *   mag  = ext.w(neg.b(arp))               ; = -(int8 arp), positive for arp<0
 *   acc  = ext.w(source[last]) ; prev = source[last]
 *   for i: d2 = ext.w(source[i]) - prev ; prev = source[i]
 *          acc = asr.w((acc + d2) * mag, 7)          ; word ops, acc carries
 *          out[i] = acc & 0xff
 *
 * Usage: npx tsx tools/suntronic-re/p9d-verify-negarp.ts [module.src] [maxTicks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;
const extw = (x: number): number => (x << 16) >> 16;
const asrW7 = (x: number): number => ((x << 16) >> 16) >> 7;
const hexOf = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0'); return s; };

/** Consecutive-delta kernel, transcribed from 0x26d4a. mag = -(int8 arp). */
function deltaKernel(source: Uint8Array, arp: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  const mag = extw((-s8(arp)) & 0xff); // neg.b then ext.w
  const last = byteLen - 1;
  let acc = extw(s8(source[last]));
  let prev = s8(source[last]);
  for (let i = 0; i < byteLen; i++) {
    const cur = s8(source[i]);
    const d2 = extw(cur - prev);
    prev = cur;
    acc = asrW7((acc + d2) * mag);
    out[i] = acc & 0xff;
  }
  return out;
}

function readLongBE(mod: AnyMod, rd: number, addr: number): number {
  mod._uade_wasm_read_memory(addr, rd, 4);
  const b = mod.HEAPU8;
  return ((b[rd] << 24) | (b[rd + 1] << 16) | (b[rd + 2] << 8) | b[rd + 3]) >>> 0;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'kompo03.src';
  const maxTicks = parseInt(process.argv[3] ?? '2000', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(256);
  let checked = 0, exact = 0; const arps = new Set<number>(); let shown = 0;
  let negFires = 0, latchClear = 0, wave1Ok = 0;
  for (let c = 0; c < maxTicks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(0x26c8a, 0x26c8c);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    const arp = s8(r[0] & 0xff);
    if (arp >= 0 || arp === -1 || arp === -2) continue; // only consecutive-delta selectors
    negFires++;
    const byteLen = (r[6] & 0xffff) + 1;
    if (byteLen < 4 || byteLen > 256) continue;
    const a2 = r[10] >>> 0, a6 = r[14] >>> 0;
    void latchClear;
    // Compute the BODY's source pointer a3 (regs captured pre-entry, so r[11] is
    // stale). Disasm 0x26c8a-0x26ca0: d1=mem[a6+0xa70]; a3=a2-d1; if (d1>=0x80)
    // a3+=(d1-0x80) else a3+=0x100  →  a3 = (d1>=0x80) ? a2-0x80 : a2-d1+0x100.
    const phase = readLongBE(mod, rd, a6 + 0xa70) | 0; // signed long
    const a3 = (phase >= 0x80 ? a2 - 0x80 : a2 - phase + 0x100) >>> 0;
    if (a3 === a2 || a3 < 0x1000) continue;
    wave1Ok++;
    mod._uade_wasm_read_memory(a3, rd, byteLen); const src = mod.HEAPU8.slice(rd, rd + byteLen);
    mod._uade_wasm_read_memory(a2, rd, byteLen); const out = mod.HEAPU8.slice(rd, rd + byteLen);
    const pred = deltaKernel(src, arp, byteLen);
    let ham = 0; for (let i = 0; i < byteLen; i++) if (pred[i] !== out[i]) ham++;
    checked++; if (ham === 0) exact++; arps.add(arp);
    if (ham !== 0 && shown < 8) {
      shown++;
      console.log(`tick${c} arp=${arp} byteLen=${byteLen} ham=${ham}/${byteLen}`);
      console.log(`  src =${hexOf(src)}`);
      console.log(`  out =${hexOf(out)}`);
      console.log(`  pred=${hexOf(pred)}`);
    } else if (ham === 0 && shown < 4) {
      shown++;
      console.log(`tick${c} arp=${arp} byteLen=${byteLen} BYTE-EXACT`);
    }
    if (checked >= 40) break;
  }
  console.log(`[p9d] negFires=${negFires} latchClear=${latchClear} wave1Ok=${wave1Ok}`);
  console.log(`[p9d] ${name}: ${exact}/${checked} first-tick neg-arp consecutive-delta fires byte-exact; arps={${[...arps].sort((a, b) => a - b).join(',')}}`);
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
