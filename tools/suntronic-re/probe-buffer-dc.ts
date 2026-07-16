/**
 * probe-buffer-dc.ts — decide: is native's per-buffer DC a synthesis bug or real?
 *
 * Captures UADE's REAL chip-RAM wave buffers (the signed-8-bit bytes Paula reads)
 * and, separately, enumerates the native renderSynthTick buffers per synth type.
 * For each, reports the DC (mean of signed bytes / 128) and range. If the real
 * buffers are all ~centered but native produces a strongly-biased buffer for some
 * type, that type's kernel is wrong (real fix); if the real buffers carry the same
 * DC, native is faithful and the DC is removed downstream by the Amiga output cap.
 *
 * Run: TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-buffer-dc.ts [song.src]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSynthTick, createVoiceState, createPrng } from '../../src/engine/suntronic/SunTronicSynthVoice';

const REG = { LCH: 0, LCL: 1, LEN: 2 } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

interface Stat { mean: number; min: number; max: number; len: number; }
function statSigned(bytes: Uint8Array): Stat {
  let sum = 0, min = 127, max = -128;
  for (let i = 0; i < bytes.length; i++) {
    const s = (bytes[i] << 24) >> 24; // sign-extend
    sum += s; if (s < min) min = s; if (s > max) max = s;
  }
  return { mean: sum / bytes.length / 128, min, max, len: bytes.length };
}
function fmt(s: Stat): string {
  return `dc=${s.mean >= 0 ? '+' : ''}${s.mean.toFixed(3)} range[${s.min},${s.max}] len=${s.len}`;
}

function readMem(mod: AnyMod, addr: number, len: number): Uint8Array {
  const p = mod._malloc(len);
  mod._uade_wasm_read_memory(addr, p, len);
  const b = new Uint8Array(mod.HEAPU8.buffer, p, len).slice();
  mod._free(p);
  return b;
}
function drainLog(mod: AnyMod, outPtr: number, max: number): { ch: number; reg: number; value: number }[] {
  const n = mod._uade_wasm_get_paula_log(outPtr, max) as number;
  const base = outPtr >> 2;
  const h = new Uint32Array(mod.HEAPU8.buffer);
  const out = [];
  for (let i = 0; i < n; i++) {
    const packed = h[base + i * 3 + 0];
    out.push({ ch: (packed >>> 24) & 0xff, reg: (packed >>> 16) & 0xff, value: packed & 0xffff });
  }
  return out;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'ok-2.src';
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);

  // ── Native: enumerate renderSynthTick buffers per instrument, per type ──
  console.log(`\n=== NATIVE renderSynthTick buffer DC (per synth instrument) — ${name} ===`);
  for (const inst of score.synthInstruments) {
    if (inst.waveWordLen <= 0) { console.log(`  type${inst.synthType} off=${inst.recOff}: waveWordLen<=0 (skip)`); continue; }
    const ticks = Math.max(1, inst.arpLen) * 2 + 4;
    const state = createVoiceState();
    const prng = createPrng();
    let acc = 0, cnt = 0, gmin = 127, gmax = -128;
    for (let t = 0; t < ticks; t++) {
      const buf = renderSynthTick(inst, state, prng);
      const s = statSigned(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      acc += s.mean; cnt++; if (s.min < gmin) gmin = s.min; if (s.max > gmax) gmax = s.max;
    }
    console.log(`  type${inst.synthType} off=${inst.recOff}: avgDC=${(acc / cnt >= 0 ? '+' : '')}${(acc / cnt).toFixed(3)} range[${gmin},${gmax}] len=${inst.waveWordLen * 2}`);
  }

  // ── UADE: capture real chip-RAM buffers, report DC distribution ──
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init failed');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load failed');
  mod._free(ptr); mod._free(hp);
  mod._uade_wasm_enable_paula_log(1);
  const pL = mod._malloc(882 * 4), pR = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  const loc = [0, 0, 0, 0], lenW = [0, 0, 0, 0], lch = [0, 0, 0, 0];
  const seen = new Set<string>();
  const dcBuckets: Record<string, number> = { centered: 0, weak: 0, strong: 0 };
  let hexOf = (b: Uint8Array) => { let s = ''; for (const x of b) s += (x & 0xff).toString(16).padStart(2, '0'); return s; };
  for (let c = 0; c < 400; c++) {
    if (mod._uade_wasm_render(pL, pR, 882) <= 0) break;
    for (const e of drainLog(mod, lg, 512)) {
      if (e.ch > 3) continue;
      if (e.reg === REG.LCH) lch[e.ch] = e.value;
      else if (e.reg === REG.LCL) loc[e.ch] = (((lch[e.ch] << 16) | e.value) >>> 0);
      else if (e.reg === REG.LEN) lenW[e.ch] = e.value;
    }
    for (let ch = 0; ch < 4; ch++) {
      if (loc[ch] === 0 || lenW[ch] === 0) continue;
      const bytes = readMem(mod, loc[ch], lenW[ch] * 2);
      const hx = hexOf(bytes); if (seen.has(hx)) continue; seen.add(hx);
      const s = statSigned(bytes);
      const a = Math.abs(s.mean);
      dcBuckets[a < 0.05 ? 'centered' : a < 0.15 ? 'weak' : 'strong']++;
    }
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  console.log(`\n=== UADE real chip-RAM buffer DC distribution (${seen.size} distinct) — ${name} ===`);
  console.log(`  centered(|dc|<0.05): ${dcBuckets.centered}   weak(<0.15): ${dcBuckets.weak}   strong(>=0.15): ${dcBuckets.strong}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
