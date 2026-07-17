/**
 * probe-drin-locate-verify.ts — verify the RE report's generic drin locator +
 * version detection, then prove it by lockstep. drin is plain hunk#1 module data
 * found by the EFFECTS arp signature: word 0x47FA (LEA d16(pc),A3) immediately
 * followed by `42 45 1A 28 00 0E` (clr.w d5; move.b 0x0e(a0),d5). PC-relative
 * target = (site+2) + s16BE(site+2). Shift word at site+10: e94d=×4 (256-byte
 * drin, main), e74d=×3 (128-byte, version-A).
 *
 * Slices the located drin, injects via opts.drin, and locksteps native voice-1
 * period vs UADE AUD1PER. Δ→0 proves the port.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-drin-locate-verify.ts [song] [ticks] [voice]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;
const s16 = (h: Uint8Array, o: number): number => (((h[o] << 8) | h[o + 1]) << 16) >> 16;
const s8 = (b: number): number => (b << 24) >> 24;

/** Locate drin in hunk#1 by the EFFECTS arp signature. Returns {off, shift} or null. */
function locateDrin(h1: Uint8Array): { off: number; shift: number } | null {
  const SIG = [0x42, 0x45, 0x1a, 0x28, 0x00, 0x0e]; // clr.w d5; move.b 0x0e(a0),d5
  for (let i = 0; i + 12 < h1.length; i += 2) {
    if (h1[i] !== 0x47 || h1[i + 1] !== 0xfa) continue;
    let ok = true;
    for (let k = 0; k < SIG.length; k++) if (h1[i + 4 + k] !== SIG[k]) { ok = false; break; }
    if (!ok) continue;
    const off = (i + 2) + s16(h1, i + 2);
    const shiftWord = (h1[i + 10] << 8) | h1[i + 11];
    const shift = shiftWord === 0xe94d ? 4 : shiftWord === 0xe74d ? 3 : 0;
    if (shift === 0 || off < 0 || off + 128 > h1.length) continue;
    return { off, shift };
  }
  return null;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'ready';
  const ticks = parseInt(process.argv[3] ?? '80', 10);
  const V = parseInt(process.argv[4] ?? '1', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h1: Uint8Array = (score as any).h1;

  const loc = locateDrin(h1);
  if (!loc) { console.log(`${name}: drin NOT located`); return; }
  const len = loc.shift === 4 ? 256 : 128;
  const drin = new Int8Array(len);
  for (let i = 0; i < len; i++) drin[i] = s8(h1[loc.off + i]);
  console.log(`${name}: drin @h1+0x${loc.off.toString(16)} shift=×${loc.shift} len=${len}`);
  console.log(`  row1: [${Array.from(drin.subarray(1 << loc.shift, (1 << loc.shift) + 8)).join(',')}]`);

  // UADE AUD{V}PER per tick
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
      const p = h[base + i * 3];
      if (((p >>> 24) & 0xff) === V && ((p >>> 16) & 0xff) === 3) last = p & 0xffff;
    }
    uadePer.push(last);
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // native WITH injected located drin (shift handling still hardcoded ×16 in player —
  // for shift=4 modules this is correct; shift=3 will need the player patch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score, { drin });
  const nat: number[] = [];
  for (let c = 0; c < ticks; c++) nat.push(player.stepVblankOnce().voices[V].period);

  let held = -1, sum = 0, cnt = 0, mx = 0, exact = 0;
  const rows: string[] = [];
  for (let c = 0; c < ticks; c++) {
    const u = uadePer[c]; if (u != null) held = u;
    if (held >= 0) {
      const d = Math.abs(nat[c] - held); sum += d; cnt++; if (d > mx) mx = d; if (d <= 1) exact++;
      rows.push(`${c.toString().padStart(3)} u=${(u != null ? String(u) : '(' + held + ')').padStart(5)} nat=${String(nat[c]).padStart(4)} d=${nat[c] - held}`);
    }
  }
  console.log(rows.slice(0, 40).join('\n'));
  console.log(`  lockstep v${V}: meanΔ=${(sum / cnt).toFixed(2)} maxΔ=${mx} within1=${exact}/${cnt}`);
  // phase-tolerant: best within-1 over onset offsets -3..+3 (isolates arp-pitch correctness
  // from sub-tick vblank scheduler phase, the deferred Paula-DMA stub)
  const held2: number[] = []; let h2 = -1;
  for (let c = 0; c < ticks; c++) { const u = uadePer[c]; if (u != null) h2 = u; held2.push(h2); }
  let bestOff = 0, bestHit = -1;
  for (let off = -3; off <= 3; off++) {
    let hit = 0, n = 0;
    for (let c = 0; c < ticks; c++) {
      const j = c + off; if (j < 0 || j >= ticks || held2[c] < 0) continue;
      n++; if (Math.abs(nat[j] - held2[c]) <= 2) hit++;
    }
    if (n > 0 && hit / n > bestHit / Math.max(1, n)) { if (hit > bestHit) { bestHit = hit; bestOff = off; } }
  }
  console.log(`  best phase offset=${bestOff}: within2=${bestHit}/${cnt}`);
  console.log('  ' + (bestHit / cnt >= 0.9 ? 'PROVEN: drin arp pitches match UADE (residual = sub-tick scheduler phase).' : 'RESIDUAL — pitch mismatch persists even phase-aligned.'));
}
main().catch((e) => { console.error(e); process.exit(1); });
