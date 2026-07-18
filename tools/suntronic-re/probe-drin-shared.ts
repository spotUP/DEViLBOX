/**
 * probe-drin-shared.ts — is the arp `drin` note-transpose table a DRIVER CONSTANT
 * (shared across modules) or per-module? Read 256 bytes of gliders' drin from UADE
 * RAM (known abs 0x2828b), inject it as opts.drin into the native player for a
 * DIFFERENT song (`ready`), and lockstep native voice-1 period vs UADE AUD1PER. If
 * the injected gliders-drin collapses `ready`'s arp Δ to ~0, drin is a shared
 * constant → extract once, ship static, every song's arp fixed 1:1.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-drin-shared.ts [song] [ticks]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const DRIN_ADDR_GLIDERS = 0x2828b; // ctor note: gliders' drin abs addr (file off 0x8003)
const REG_PER = 3;

async function loadAndRender(mod: AnyMod, name: string, data: Uint8Array): Promise<void> {
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load ' + name);
  mod._free(ptr); mod._free(hp);
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'ready';
  const ticks = parseInt(process.argv[3] ?? '80', 10);

  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());

  // ── 1. read gliders' drin (256 bytes) from RAM ──
  const gliders = new Uint8Array(readFileSync(join(CORPUS_DIR, 'gliders.src')));
  await loadAndRender(mod, 'gliders.src', gliders);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), rd = mod._malloc(256);
  for (let c = 0; c < 8; c++) mod._uade_wasm_render(L, R, 882); // warm init so BSS drin is built
  mod._uade_wasm_read_memory(DRIN_ADDR_GLIDERS, rd, 256);
  const drin = new Int8Array(256);
  for (let i = 0; i < 256; i++) drin[i] = (mod.HEAPU8[rd + i] << 24) >> 24;
  const nz = Array.from(drin).filter((x) => x !== 0).length;
  console.log(`gliders drin @${DRIN_ADDR_GLIDERS.toString(16)}: ${nz}/256 nonzero`);
  console.log(`  row0 (d5 0..15): ${Array.from(drin.subarray(0, 16)).join(',')}`);
  console.log(`  row1 (d5 16..31): ${Array.from(drin.subarray(16, 32)).join(',')}`);
  console.log(`  row4 (d5 64..79): ${Array.from(drin.subarray(64, 80)).join(',')}`);

  // ── 2. UADE AUD1PER per tick for the target song ──
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  await loadAndRender(mod, name, data);
  const lg = mod._malloc(512 * 3 * 4);
  mod._uade_wasm_enable_paula_log(1);
  const uadePer: (number | null)[] = [];
  for (let c = 0; c < ticks; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512);
    const h = new Uint32Array(mod.HEAPU8.buffer); const base = lg >> 2;
    let last: number | null = null;
    for (let i = 0; i < n; i++) {
      const packed = h[base + i * 3];
      if (((packed >>> 24) & 0xff) === 1 && ((packed >>> 16) & 0xff) === REG_PER) last = packed & 0xffff;
    }
    uadePer.push(last);
  }
  mod._free(L); mod._free(R); mod._free(rd); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // ── 3. native with injected gliders-drin ──
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score, { drin });
  const nat: number[] = [];
  for (let c = 0; c < ticks; c++) nat.push(player.stepVblankOnce().voices[1].period);

  let held = -1, sumAbs = 0, cnt = 0, maxAbs = 0;
  for (let c = 0; c < ticks; c++) {
    const u = uadePer[c]; if (u != null) held = u;
    if (held >= 0) { const d = Math.abs(nat[c] - held); sumAbs += d; cnt++; if (d > maxAbs) maxAbs = d; }
  }
  console.log(`\n${name} voice1 with gliders-drin injected: meanΔ=${(sumAbs / cnt).toFixed(1)} maxΔ=${maxAbs} (n=${cnt})`);
  console.log(maxAbs <= 2 ? 'VERDICT: drin is a SHARED DRIVER CONSTANT — extract once, ship static.' : 'VERDICT: NOT fully shared (or wrong addr) — arp Δ persists; investigate.');
}
main().catch((e) => { console.error(e); process.exit(1); });
