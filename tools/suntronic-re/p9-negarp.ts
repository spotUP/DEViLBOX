/**
 * p9-negarp.ts — golden the NEGATIVE-arp type-1 pulse variants against a real UADE
 * firing, using kompo03.src (fires the pulse body 343x with arps {-63..-2}).
 *
 * Two bodies (per p8c disasm header):
 *   0x26d4a  consecutive-delta  (arp < 0, arp != -2)
 *   0x26ce6  arp == -2 escape   (kernel unknown — inferred here)
 *
 * Capture ABI (18 u32 regs): r0=d0(arp) r6=d6(byteLen-1) r10=a2(out) r11=a3(source).
 * We arm each body PC separately, read src+out from emulated RAM, and brute a small
 * family of candidate recurrences for byte-exactness. tick-0 fires have src != out
 * (kompo03: all 343), so the forward delta read survives.
 *
 * Usage: npx tsx tools/suntronic-re/p9-negarp.ts [module] [maxTicks] [pcHex]
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

/** Candidate A: consecutive-delta (0x26d4a). coeff = -(s8 arp). */
function deltaKernel(src: Uint8Array, arp: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  const coeff = extw(-s8(arp));
  const last = byteLen - 1;
  let acc = extw(s8(src[last]));
  let prev = s8(src[last]);
  for (let i = 0; i < byteLen; i++) {
    const cur = s8(src[i]);
    const d2 = extw(cur - prev);
    prev = cur;
    acc = asrW7((acc + d2) * coeff);
    out[i] = acc & 0xff;
  }
  return out;
}

/** Candidate B: same but coeff = s8(arp) (no negate) — sanity alt. */
function deltaKernelB(src: Uint8Array, arp: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  const coeff = extw(s8(arp));
  const last = byteLen - 1;
  let acc = extw(s8(src[last]));
  let prev = s8(src[last]);
  for (let i = 0; i < byteLen; i++) {
    const cur = s8(src[i]);
    const d2 = extw(cur - prev);
    prev = cur;
    acc = asrW7((acc + d2) * coeff);
    out[i] = acc & 0xff;
  }
  return out;
}

/** Candidate C: the SHIPPED standard smoothing (coeff = 0x80 - arp). What the
 *  engine currently runs for negative arps. If this matches, there is NO bug. */
function stdKernel(src: Uint8Array, arp: number, byteLen: number): Uint8Array {
  const out = new Uint8Array(byteLen);
  const coeff = extw((0x80 - arp) & 0xffff);
  const last = byteLen - 1;
  let acc = s8(src[last]);
  for (let i = 0; i < byteLen; i++) {
    const s = s8(src[i]);
    const step = asrW7((s - acc) * coeff);
    acc = extw(acc + step);
    out[i] = acc & 0xff;
  }
  return out;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'kompo03.src';
  const maxTicks = parseInt(process.argv[3] ?? '400', 10);
  const pc = parseInt(process.argv[4] ?? '0x26c8a', 16);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), cap = mod._malloc(18 * 4), rd = mod._malloc(512);
  let fires = 0, exA = 0, exB = 0, exC = 0; const arps = new Set<number>(); let shown = 0;
  // per-arp: which candidate is byte-exact
  const winByArp = new Map<number, Set<string>>();
  console.log(`[p9] ${name} PC=0x${pc.toString(16)} (entry; out read post-render)`);
  for (let c = 0; c < maxTicks; c++) {
    mod._uade_wasm_arm_capture(0x20000, 0x10000);
    mod._uade_wasm_arm_capture_pc(pc, pc + 2);
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    if (!mod._uade_wasm_get_capture(cap)) continue;
    const hh = new Uint32Array(mod.HEAPU8.buffer);
    const r: number[] = []; for (let i = 0; i < 18; i++) r.push(hh[(cap >> 2) + i]);
    const arp = s8(r[0] & 0xff);
    const byteLen = (r[6] & 0xffff) + 1;
    if (byteLen < 2 || byteLen > 256) continue;
    // at entry, out is not yet written by THIS body — but the render() call already
    // completed, so reading outBase now yields this tick's finished output.
    const outBase = r[10] >>> 0, srcBase = r[11] >>> 0;
    if (outBase === srcBase) continue; // need separate src buffer
    mod._uade_wasm_read_memory(outBase, rd, byteLen); const out = mod.HEAPU8.slice(rd, rd + byteLen);
    mod._uade_wasm_read_memory(srcBase, rd, byteLen); const src = mod.HEAPU8.slice(rd, rd + byteLen);
    const pa = deltaKernel(src, arp, byteLen);
    const pb = deltaKernelB(src, arp, byteLen);
    const pc2 = stdKernel(src, arp, byteLen);
    let ha = 0, hb = 0, hc = 0;
    for (let i = 0; i < byteLen; i++) { if (pa[i] !== out[i]) ha++; if (pb[i] !== out[i]) hb++; if (pc2[i] !== out[i]) hc++; }
    fires++; arps.add(arp);
    if (ha === 0) exA++;
    if (hb === 0) exB++;
    if (hc === 0) exC++;
    if (!winByArp.has(arp)) winByArp.set(arp, new Set());
    const w = winByArp.get(arp)!;
    if (ha === 0) w.add('A'); if (hb === 0) w.add('B'); if (hc === 0) w.add('C');
    if (ha !== 0 && hb !== 0 && hc !== 0 && shown < 8) {
      shown++;
      console.log(`tick${c} arp=${arp} byteLen=${byteLen} hamA=${ha} hamB=${hb} hamC=${hc}`);
      console.log(`  src =${hexOf(src)}`);
      console.log(`  out =${hexOf(out)}`);
      console.log(`  predA=${hexOf(pa)}`);
      console.log(`  predC=${hexOf(pc2)}`);
    }
    if (fires >= 80) break;
  }
  console.log(`[p9] fires=${fires} A(delta -arp)=${exA} B(delta +arp)=${exB} C(std 0x80-arp)=${exC}`);
  const rows: string[] = [];
  for (const a of [...winByArp.keys()].sort((x, y) => x - y)) rows.push(`arp=${a}:{${[...winByArp.get(a)!].sort().join('')||'none'}}`);
  console.log('[p9] per-arp winners: ' + rows.join(' '));
  console.log(`[p9] arps seen={${[...arps].sort((a, b) => a - b).join(',')}}`);
  mod._free(L); mod._free(R); mod._free(cap); mod._free(rd);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}
main().catch((e) => { console.error(e); process.exit(1); });
