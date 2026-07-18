/**
 * p9e-solve-calc14.ts — solve the NEGATIVE-arp type-1 pulse kernel by fitting the
 * already-verified calc14 2nd-order integrator to real UADE output.
 *
 * The neg-arp type-1 output (kompo03) is a velocity+position integrator — the same
 * family as calc14Kernel. Capture at entry 0x26c8a (source = stale a3 = the feedback
 * double-buffer, empirically the previous tick's play buffer; out = a2 post-render).
 * For each fire, brute d2v (d3v=0, fbDepth=0 for chip ptrs) to find the byte-exact
 * calc14 coefficient, then report d2v vs arp to expose the derivation.
 *
 * Usage: npx tsx tools/suntronic-re/p9e-solve-calc14.ts [module] [maxTicks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { calc14Kernel } from '../../src/engine/suntronic/SunTronicSynthVoice';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s8 = (b: number): number => (b << 24) >> 24;

function ham(a: Int8Array | Uint8Array, b: Uint8Array): number {
  let h = 0; for (let i = 0; i < b.length; i++) if ((a[i] & 0xff) !== b[i]) h++; return h;
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
  const fits: { arp: number; d2v: number; n: number }[] = [];
  let checked = 0, exactCount = 0;
  for (let c = 0; c < maxTicks && checked < 60; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(0x26c8a, 0x26c8c);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    const arp = s8(r[0] & 0xff);
    if (arp >= 0 || arp === -1 || arp === -2) continue;
    const byteLen = (r[6] & 0xffff) + 1;
    if (byteLen < 4 || byteLen > 256) continue;
    const a2 = r[10] >>> 0, a3 = r[11] >>> 0; // stale a3 = feedback source (empirical)
    if (a3 === a2 || a3 < 0x1000) continue;
    mod._uade_wasm_read_memory(a3, rd, byteLen); const src = mod.HEAPU8.slice(rd, rd + byteLen);
    mod._uade_wasm_read_memory(a2, rd, byteLen); const out = mod.HEAPU8.slice(rd, rd + byteLen);
    const seedLast = s8(src[byteLen - 1]);
    const seedPrev = s8(src[byteLen - 2]);
    // brute d2v across full word range; d3v=0.
    let bh = 999, bd2 = 0;
    for (let d2v = 0; d2v <= 0xffff; d2v++) {
      const pred = calc14Kernel(seedLast, seedPrev, src as unknown as Int8Array, d2v, 0, byteLen);
      const h = ham(pred, out);
      if (h < bh) { bh = h; bd2 = d2v; if (h === 0) break; }
    }
    checked++;
    if (bh === 0) { exactCount++; fits.push({ arp, d2v: bd2, n: byteLen }); }
    else if (fits.length < 8) console.log(`arp=${arp} NO exact d2v (bestHam=${bh}/${byteLen} @d2v=0x${bd2.toString(16)})`);
  }
  console.log(`[p9e] ${exactCount}/${checked} fires have a byte-exact calc14 d2v`);
  // dedup arp->d2v
  const m = new Map<number, Set<number>>();
  for (const f of fits) { if (!m.has(f.arp)) m.set(f.arp, new Set()); m.get(f.arp)!.add(f.d2v); }
  for (const a of [...m.keys()].sort((x, y) => x - y)) {
    const ds = [...m.get(a)!];
    // predicted renderSmooth derivation for comparison:
    const divisor = (a & 0xff) + 0x20;
    const quotient = Math.floor(0xfffe0 / divisor) & 0xffff;
    const term = (0x26 * (a & 0xffff)) & 0xffff;
    const predSmooth = (quotient - term) & 0xffff;
    console.log(`arp=${a}: d2v={${ds.map((d) => '0x' + d.toString(16)).join(',')}}  renderSmooth(d1=arp)=0x${predSmooth.toString(16)}`);
  }
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
