/**
 * probe-drin-scan.ts — scan a module's LOADED RAM for gliders' drin signature
 * (16 zeros then 5,-12,0,-12,0,-12...) to test whether drin is a byte-identical
 * replayer constant across modules (so it can be embedded, not read from h1).
 * Prints the found abs addr + the full 256-byte table if the signature hits. NOT committed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
// gliders drin[0x10..0x20] = 5 -12 0 -12 0 -12 0 -12 0 -12 0 -12 0 -12 0 -12
const SIG = [5, -12, 0, -12, 0, -12, 0, -12, 0, -12, 0, -12].map((v) => v & 0xff);

async function scan(name: string): Promise<void> {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  const L = mod._malloc(1024 * 4), R = mod._malloc(1024 * 4);
  for (let i = 0; i < 4; i++) mod._uade_wasm_render(L, R, 882);
  const BASE = 0x10000, LEN = 0x60000;
  const scan = mod._malloc(LEN);
  mod._uade_wasm_read_memory(BASE, scan, LEN);
  const hits: number[] = [];
  for (let a = 0; a + SIG.length <= LEN; a++) {
    let ok = true;
    for (let i = 0; i < SIG.length; i++) if (mod.HEAPU8[scan + a + i] !== SIG[i]) { ok = false; break; }
    if (ok) hits.push(BASE + a);
  }
  // the drin sig sits at drin+0x10, so drin base = hit-0x10; dump 32 bytes from base
  const out = hits.map((h) => {
    const base = h - 0x10;
    const t: number[] = [];
    mod._uade_wasm_read_memory(base >>> 0, scan, 32);
    for (let i = 0; i < 32; i++) { const b = mod.HEAPU8[scan + i]; t.push(b > 127 ? b - 256 : b); }
    return `@${base.toString(16)}: ${t.join(' ')}`;
  });
  console.log(`${name}: ${hits.length} hit(s)`);
  for (const o of out) console.log('  ' + o);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
}

(async () => {
  for (const m of process.argv.slice(2).length ? process.argv.slice(2) : ['gliders.src', 'darkness.src', 'energy.src', 'magnum.src']) {
    await scan(m);
  }
})().catch((e) => { console.error(e); process.exit(1); });
