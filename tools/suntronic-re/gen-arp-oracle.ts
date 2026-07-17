/**
 * gen-arp-oracle.ts — build the self-contained arp lockstep golden fixture.
 *
 * For a curated set of arp-exercising modules (both driver versions), render the
 * UADE oracle and capture per-tick AUD{voice}PER (Paula log, reg 3) for all 4
 * voices over N ticks. Embed the module bytes (base64) alongside the oracle
 * sequences so the vitest regression is fully self-contained — no live UADE and
 * no external corpus files in CI (UADE stays offline-oracle-only).
 *
 * The native player reproduces these AUD{n}PER sequences ONLY when the drin arp
 * note-transpose table is ported; zero-filling drin collapses arp voices to a
 * monotone → the test fails. That is the fails-on-revert gate.
 *
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/gen-arp-oracle.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

const REG_PER = 3;
const TICKS = 160;
// Curated: Main (×16 drin) + Version-A (×8 drin), each drives arp on ≥1 voice.
// ready + darkness = Main (×16 drin) witnesses; suntronic-k2 = Version-A (×8) witness.
// (multi-arp-long v1 / suntronic-new yield no drin witness — the former exposes a
// SEPARATE unported deep-arp/note-advance residual, tracked outside this fixture.)
const MODULES = ['ready', 'darkness.src', 'suntronic-k2.src'];
const OUT = join(
  process.cwd(),
  'src/engine/suntronic/__fixtures__/suntronicArpOracle.json',
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

async function oracleFor(mod: AnyMod, name: string, data: Uint8Array): Promise<number[][]> {
  const ptr = mod._malloc(data.byteLength); mod.HEAPU8.set(data, ptr);
  const hp = mod._malloc(name.length * 4 + 1); mod.stringToUTF8(name, hp, name.length * 4 + 1);
  mod._uade_wasm_stop(); mod._uade_wasm_set_looping(0); mod._uade_wasm_set_one_subsong(1);
  if (mod._uade_wasm_load(ptr, data.byteLength, hp) !== 0) throw new Error('load ' + name);
  mod._free(ptr); mod._free(hp);
  const L = mod._malloc(882 * 4), R = mod._malloc(882 * 4), lg = mod._malloc(512 * 3 * 4);
  mod._uade_wasm_enable_paula_log(1);
  // per voice: per-tick last AUD PER write, or -1 (hold previous downstream)
  const per: number[][] = [[], [], [], []];
  for (let c = 0; c < TICKS; c++) {
    if (mod._uade_wasm_render(L, R, 882) <= 0) { for (const p of per) p.push(-1); continue; }
    const n = mod._uade_wasm_get_paula_log(lg, 512);
    const h = new Uint32Array(mod.HEAPU8.buffer); const base = lg >> 2;
    const last: (number | null)[] = [null, null, null, null];
    for (let i = 0; i < n; i++) {
      const p = h[base + i * 3];
      const ch = (p >>> 24) & 0xff, reg = (p >>> 16) & 0xff;
      if (ch < 4 && reg === REG_PER) last[ch] = p & 0xffff;
    }
    for (let v = 0; v < 4; v++) per[v].push(last[v] ?? -1);
  }
  mod._free(L); mod._free(R); mod._free(lg);
  return per;
}

function runNative(score: ReturnType<typeof parseSunTronicV13Score>): number[][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = new (SunTronicPlayer as any)(score);
  const per: number[][] = [[], [], [], []];
  for (let t = 0; t < TICKS; t++) { const tk = p.stepVblankOnce(); for (let v = 0; v < 4; v++) per[v].push(tk.voices[v].period); }
  return per;
}
function holdForward(seq: number[]): number[] { const o: number[] = []; let h = -1; for (const x of seq) { if (x >= 0) h = x; o.push(h); } return o; }
function localRecall(native: number[], oh: number[], W: number): number {
  let hit = 0, n = 0;
  for (let c = 0; c < oh.length; c++) {
    if (oh[c] < 0) continue; n++;
    let ok = false;
    for (let j = Math.max(0, c - W); j <= Math.min(native.length - 1, c + W); j++) { if (Math.abs(native[j] - oh[c]) <= 2) { ok = true; break; } }
    if (ok) hit++;
  }
  return n ? hit / n : 1;
}

async function main(): Promise<void> {
  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(44100) !== 0) throw new Error('init');
  addCompanions(mod, loadInstrCompanions());

  const modules = [];
  for (const name of MODULES) {
    const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
    const per = await oracleFor(mod, name, data);
    // Classify each voice by drin-DEPENDENCE: a witness voice is one the ported drin
    // materially fixes — native localRecall(ported) is high but localRecall(zeroed)
    // collapses. Voices whose motion is pure note-sequence/vibrato (arpSel 0) don't
    // change when drin is zeroed → not witnesses (they'd pass trivially and dilute).
    const scorePorted = parseSunTronicV13Score(data);
    const scoreZero = parseSunTronicV13Score(data);
    scoreZero.drin = new Int8Array(scoreZero.drin.length); // simulate the revert
    const natPorted = runNative(scorePorted);
    const natZero = runNative(scoreZero);
    const witnesses: { v: number; portedRecall: number; zeroedRecall: number }[] = [];
    for (let v = 0; v < 4; v++) {
      const oh = holdForward(per[v]);
      const pr = localRecall(natPorted[v], oh, 4);
      const zr = localRecall(natZero[v], oh, 4);
      if (pr >= 0.9 && zr <= 0.7) witnesses.push({ v, portedRecall: +pr.toFixed(3), zeroedRecall: +zr.toFixed(3) });
    }
    modules.push({ name, bytesB64: Buffer.from(data).toString('base64'), ticks: TICKS, perVoice: per, witnesses });
    console.log(`${name}: witnesses=${witnesses.map((w) => `v${w.v}(ported ${w.portedRecall}/zero ${w.zeroedRecall})`).join(' ') || 'NONE'}`);
  }
  try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generated: 'gen-arp-oracle.ts', regPer: REG_PER, modules }, null, 1));
  console.log(`wrote ${OUT} (${modules.length} modules)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
