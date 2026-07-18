/**
 * lockstep-v1-period.ts — ground-truth lockstep for the voice-1 "flat / no arp"
 * bug on `ready`. Reads UADE's Paula AUD1PER (channel 1, reg PER) writes per
 * render tick via the paula log (driver-version-independent — no EFFECTS PC
 * needed, so it works on `ready`'s driver where p9a's hardcoded PC misses), and
 * prints them alongside the native player's voice[1] period. If UADE jumps in an
 * arp pattern while native only wobbles ±vibrato, the missing arp/drin table is
 * the whole defect.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/lockstep-v1-period.ts [song] [ticks] [voice]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const REG_PER = 3;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'ready';
  const ticks = parseInt(process.argv[3] ?? '80', 10);
  const V = parseInt(process.argv[4] ?? '1', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));

  // ── UADE oracle: per-tick last AUD{V}PER write ──
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  mod._uade_wasm_enable_paula_log(1);
  const uadePer: (number | null)[] = [];
  for (let c = 0; c < ticks; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512);
    const h = new Uint32Array(mod.HEAPU8.buffer); const base = lg >> 2;
    let last: number | null = null;
    for (let i = 0; i < n; i++) {
      const packed = h[base + i * 3];
      const ch = (packed >>> 24) & 0xff, reg = (packed >>> 16) & 0xff, val = packed & 0xffff;
      if (ch === V && reg === REG_PER) last = val;
    }
    uadePer.push(last);
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // ── native player: per-vblank voice[V] period ──
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);
  const nat: number[] = [];
  for (let c = 0; c < ticks; c++) nat.push(player.stepVblankOnce().voices[V].period);

  // ── side by side ──
  console.log(`tick | UADE AUD${V}PER | native v${V} period | Δ`);
  let held = -1;
  for (let c = 0; c < ticks; c++) {
    const u = uadePer[c]; if (u != null) held = u;
    const uShow = u != null ? String(u) : `(${held})`;
    const d = held >= 0 ? nat[c] - held : NaN;
    console.log(`${c.toString().padStart(4)} | ${uShow.padStart(11)} | ${String(nat[c]).padStart(15)} | ${Number.isNaN(d) ? '' : d}`);
  }
  const uVals = uadePer.filter((x): x is number => x != null);
  console.log(`--- UADE distinct AUD${V}PER=${new Set(uVals).size} native distinct=${new Set(nat).size} ---`);
}
main().catch((e) => { console.error(e); process.exit(1); });
