/**
 * probe-pos4.ts — locate the "effects missing" window on `ready` song pos 4.
 * Per tick, per voice: position, native period, UADE AUDxPER, and raw effect
 * state (arpSel, arpPhase, pitchSlide, vibIndex). Flags ticks where native
 * period sits FLAT while UADE modulates.
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/probe-pos4.ts [song] [ticks]
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
const REG_VOL = 8;

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'ready';
  const ticks = parseInt(process.argv[3] ?? '200', 10);
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));

  // UADE oracle: per-tick last AUDxPER for all 4 voices
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(1); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load');
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  mod._uade_wasm_enable_paula_log(1);
  const uadePer: (number | null)[][] = [[], [], [], []];
  const uadeVol: (number | null)[][] = [[], [], [], []];
  for (let c = 0; c < ticks; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) break;
    const n = mod._uade_wasm_get_paula_log(lg, 512);
    const h = new Uint32Array(mod.HEAPU8.buffer); const base = lg >> 2;
    const lastP: (number | null)[] = [null, null, null, null];
    const lastV: (number | null)[] = [null, null, null, null];
    for (let i = 0; i < n; i++) {
      const packed = h[base + i * 3];
      const ch = (packed >>> 24) & 0xff, reg = (packed >>> 16) & 0xff, val = packed & 0xffff;
      if (ch < 4 && reg === REG_PER) lastP[ch] = val;
      if (ch < 4 && reg === REG_VOL) lastV[ch] = val;
    }
    for (let v = 0; v < 4; v++) { uadePer[v].push(lastP[v]); uadeVol[v].push(lastV[v]); }
  }
  mod._free(L); mod._free(R); mod._free(lg);
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  // native
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player: any = new (SunTronicPlayer as any)(score);
  const held = [-1, -1, -1, -1];
  const heldV = [-1, -1, -1, -1];
  console.log('tick | v | pos | natPER uadePER Δp | natVOL uadeVOL Δv | arpSel arpPh pslide vibIx');
  for (let c = 0; c < ticks; c++) {
    const snap = player.stepVblankOnce();
    for (let v = 0; v < 4; v++) {
      const u = uadePer[v][c]; if (u != null) held[v] = u;
      const uv = uadeVol[v][c]; if (uv != null) heldV[v] = uv;
      const nat = snap.voices[v].period;
      const natVol = snap.voices[v].outVolume;
      const vv = player.voices[v];
      const dv = player.debugVoice(v);
      const d = held[v] >= 0 ? nat - held[v] : NaN;
      const dvo = heldV[v] >= 0 ? natVol - heldV[v] : NaN;
      if (dv.position >= 3 && dv.position <= 5) {
        console.log(
          `${String(c).padStart(4)} | ${v} | ${String(dv.position).padStart(3)} | ` +
          `${String(nat).padStart(6)} ${String(held[v]).padStart(6)} ${String(Number.isNaN(d) ? '' : d).padStart(4)} | ` +
          `${String(natVol).padStart(6)} ${String(heldV[v]).padStart(6)} ${String(Number.isNaN(dvo) ? '' : dvo).padStart(4)} | ` +
          `${String(vv.arpSel).padStart(6)} ${String(vv.arpPhase).padStart(5)} ${String(vv.pitchSlide).padStart(5)} ${String(vv.vibIndex).padStart(5)}`,
        );
      }
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
