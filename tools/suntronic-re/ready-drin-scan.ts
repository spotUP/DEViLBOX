/**
 * ready-drin-scan.ts — robustly locate ready's drin by scanning RAM for a
 * 256-byte region whose row0 (arpSel 0) is all-zero (the universal non-arp
 * identity row) and whose later rows carry small signed arp offsets, then
 * VALIDATE each candidate by plugging it into the native player and measuring
 * mean voice fidelity vs the UADE oracle. The real drin maximizes fidelity.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, INSTR_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../../src/engine/suntronic/SunTronicNativeRender';
import { voiceFidelity } from './native-mix';
import { renderUADEPerVoice } from './audio-oracle';

type AnyMod = any;
async function main() {
  const name = process.env.SONG ?? 'ready';
  const seconds = 12;
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load ' + name);
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4);
  for (let i = 0; i < 60; i++) mod._uade_wasm_render(L, R, 882);
  const base = 0x20000, span = 0x60000;
  const scan = mod._malloc(span); mod._uade_wasm_read_memory(base, scan, span);
  const mem = new Int8Array(256);
  const readAt = (abs: number): Int8Array => { const o = new Int8Array(256); for (let i = 0; i < 256; i++) { const b = mod.HEAPU8[scan + (abs - base) + i]; o[i] = b > 127 ? b - 256 : b; } return o; };
  // candidate filter: row0 all zero, rows 1..15 contain some small nonzero arp
  // offsets (|v|<=36) and NOT mostly large garbage.
  const cands: number[] = [];
  for (let a = base; a + 256 < base + span; a += 2) {
    let row0zero = true; for (let i = 0; i < 16; i++) if (mod.HEAPU8[scan + (a - base) + i] !== 0) { row0zero = false; break; }
    if (!row0zero) continue;
    let nz = 0, big = 0;
    for (let i = 16; i < 256; i++) { const b0 = mod.HEAPU8[scan + (a - base) + i]; const s = b0 > 127 ? b0 - 256 : b0; if (s !== 0) { nz++; if (Math.abs(s) > 36) big++; } }
    if (nz >= 20 && nz <= 180 && big <= 4) cands.push(a);
  }
  console.log(`${name}: ${cands.length} row0-zero candidates`);
  // score each by mean voice fidelity
  const score = parseSunTronicV13Score(data);
  const slotPcm = score.instrumentNames.map((n: string) => { const p = join(INSTR_DIR, n); return existsSync(p) ? new Int8Array(readFileSync(p)) : null; });
  const oracle = await renderUADEPerVoice(name, { seconds });
  const results: { abs: number; mean: number; per: number[] }[] = [];
  for (const a of cands) {
    const drin = readAt(a);
    const m = renderSunTronicMix(score, slotPcm, { seconds, drin });
    const per = [0, 1, 2, 3].map((v) => voiceFidelity(m.ch[v], oracle.ch[v]).median);
    results.push({ abs: a, mean: per.reduce((x, y) => x + y, 0) / 4, per });
  }
  results.sort((x, y) => y.mean - x.mean);
  console.log(`top candidates (zero-drin baseline mean was ~0.60):`);
  for (const r of results.slice(0, 8)) console.log(`  0x${r.abs.toString(16)} mean=${r.mean.toFixed(3)} per=[${r.per.map((x) => x.toFixed(2)).join(',')}]  row1=[${Array.from(readAt(r.abs).subarray(16, 32)).join(',')}]`);
}
main().catch((e) => { console.error(e); process.exit(1); });
