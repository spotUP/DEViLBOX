/**
 * p7k-trace-inventory.ts — dump the read/write burst inventory for one tick so we can
 * SEE the SunTronic synth data flow (which regions are read as wave sources, which are
 * written as output/internal buffers). Uses the UADE-WASM acctrace.
 *
 * Usage: npx tsx tools/suntronic-re/p7k-trace-inventory.ts [module.src] [tick]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'gliders.src';
  const wantTick = parseInt(process.argv[3] ?? '80', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);
  mod._uade_wasm_enable_paula_log(1);
  mod._uade_wasm_enable_acctrace(1);

  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  const AT = mod._malloc(200000 * 2 * 4);
  const loc = [0, 0, 0, 0], len = [0, 0, 0, 0], lch = [0, 0, 0, 0];
  for (let c = 0; c <= wantTick; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512); const h = new Uint32Array(mod.HEAPU8.buffer);
    for (let i = 0; i < n; i++) {
      const p = h[(lg >> 2) + i * 3]; const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff, v = p & 0xffff;
      if (ch > 3) continue;
      if (reg === REG.LCH) lch[ch] = v; else if (reg === REG.LCL) loc[ch] = ((lch[ch] << 16) | v) >>> 0;
      else if (reg === REG.LEN) len[ch] = v;
    }
    const trace: { addr: number; val: number; wr: number }[] = [];
    let got: number;
    do {
      got = mod._uade_wasm_drain_acctrace(AT, 200000);
      const hh = new Uint32Array(mod.HEAPU8.buffer);
      for (let i = 0; i < got; i++) {
        const addr = hh[(AT >> 2) + i * 2]; const w = hh[(AT >> 2) + i * 2 + 1];
        trace.push({ addr, val: w & 0xff, wr: (w >> 16) & 1 });
      }
    } while (got === 200000);

    if (c !== wantTick) continue;
    console.log(`[p7k] tick${c} locs: ${loc.map((l, i) => `ch${i}=0x${l.toString(16)}(byteLen${len[i] * 2})`).join(' ')}`);
    console.log(`[p7k] trace length=${trace.length}`);
    // Coalesce into monotone bursts: same wr, addr strictly ascending by 1.
    type Burst = { wr: number; base: number; len: number; step: number };
    const bursts: Burst[] = [];
    let i = 0;
    while (i < trace.length) {
      const wr = trace[i].wr; const base = trace[i].addr;
      let j = i + 1; let step = 0;
      if (j < trace.length && trace[j].wr === wr) step = trace[j].addr - trace[i].addr;
      // group while same wr and constant step (allow step 0/1/2 typical)
      while (j < trace.length && trace[j].wr === wr && trace[j].addr - trace[j - 1].addr === (step || (trace[j].addr - trace[j - 1].addr))) {
        if (step === 0) step = trace[j].addr - trace[j - 1].addr;
        if (trace[j].addr - trace[j - 1].addr !== step) break;
        j++;
      }
      bursts.push({ wr, base, len: j - i, step });
      i = j;
    }
    // print notable bursts (len >= 4)
    for (const b of bursts) {
      if (b.len < 4) continue;
      console.log(`   ${b.wr ? 'W' : 'R'} base=0x${b.base.toString(16)} len=${b.len} step=${b.step} end=0x${(b.base + b.len * b.step).toString(16)}`);
    }
    // access-class histogram: reads vs writes, and address ranges touched
    const rd = trace.filter((e) => !e.wr), wr = trace.filter((e) => e.wr);
    console.log(`[p7k] reads=${rd.length} writes=${wr.length}`);
    const lo = Math.min(...trace.map((e) => e.addr)), hi = Math.max(...trace.map((e) => e.addr));
    console.log(`[p7k] addr range 0x${lo.toString(16)}..0x${hi.toString(16)}`);
    // read-address histogram in 0x40-byte buckets
    const buckets = new Map<number, number>();
    for (const e of rd) { const b = e.addr & ~0x3f; buckets.set(b, (buckets.get(b) ?? 0) + 1); }
    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const [b, cnt] of sorted) console.log(`   Rbucket 0x${b.toString(16)}: ${cnt} reads`);
    // ordered read addresses in the hottest bucket region (classify access pattern)
    const hot = sorted[0][0];
    const region = trace.filter((e) => !e.wr && (e.addr & ~0xff) === (hot & ~0xff));
    console.log(`[p7k] ordered reads near hot bucket 0x${hot.toString(16)} (first 40 of ${region.length}):`);
    console.log('   ' + region.slice(0, 40).map((e) => (e.addr - (hot & ~0xff)).toString(16)).join(' '));
  }
  mod._free(L); mod._free(R); mod._free(lg); mod._free(AT);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
