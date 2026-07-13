/**
 * p5-wavebuffer-oracle.ts — Probe P5: capture UADE's real per-tick synth wave
 * buffer via the Paula write-log + read_memory, the ground truth for validating
 * the native MEGAEFFECTS timbre code (SunTronicSynthVoice.ts).
 *
 * Milestone 1 (this file): prove the mechanism — render mule.src with the Paula
 * log enabled, reconstruct each channel's AUDxLC (LCH:LCL) sample-buffer address
 * + AUDxLEN, and read_memory the buffer bytes. Print a per-channel summary so we
 * can see the synth voices' wave buffers as UADE computes them.
 * Milestone 2 (next): diff those bytes against the native MEGAEFFECTS output for
 * the matching synth record + tick state.
 *
 * Paula log ABI (uade-wasm/src/paula_log.h, entry.c:878):
 *   get_paula_log(out, maxEntries) drains up to maxEntries entries; each = 3 u32:
 *     [0] = (channel<<24)|(reg<<16)|value   reg: 0=LCH 1=LCL 2=LEN 3=PER 4=VOL 5=DAT
 *     [1] = source_addr    [2] = tick
 *   Ring buffer is 512 entries — DRAIN PER RENDER CHUNK or it overwrites.
 *
 * Usage: npx tsx tools/suntronic-re/p5-wavebuffer-oracle.ts [module.src]
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadUADEModule } from '../uade-audit/uadeRenderCore';
import { CORPUS_DIR, addCompanions, loadInstrCompanions } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
} from '../../src/engine/suntronic/SunTronicSynthVoice';

const REG = { LCH: 0, LCL: 1, LEN: 2, PER: 3, VOL: 4, DAT: 5 } as const;
const REG_NAME = ['LCH', 'LCL', 'LEN', 'PER', 'VOL', 'DAT'];

/** Unsigned-byte hex of an Int8Array/Uint8Array — canonical buffer key. */
function hexOf(b: Int8Array | Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += ((b[i] & 0xff)).toString(16).padStart(2, '0');
  return s;
}

interface LogEntry { ch: number; reg: number; value: number; src: number; tick: number; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

function drainLog(mod: AnyMod, outPtr: number, maxEntries: number): LogEntry[] {
  const n = mod._uade_wasm_get_paula_log(outPtr, maxEntries) as number;
  const out: LogEntry[] = [];
  const base = outPtr >> 2;
  const h = new Uint32Array(mod.HEAPU8.buffer);
  for (let i = 0; i < n; i++) {
    const packed = h[base + i * 3 + 0];
    out.push({
      ch: (packed >>> 24) & 0xff,
      reg: (packed >>> 16) & 0xff,
      value: packed & 0xffff,
      src: h[base + i * 3 + 1],
      tick: h[base + i * 3 + 2],
    });
  }
  return out;
}

function readMem(mod: AnyMod, addr: number, len: number): Uint8Array {
  const p = mod._malloc(len);
  if (!p) throw new Error('malloc failed for read_memory');
  mod._uade_wasm_read_memory(addr, p, len);
  const bytes = new Uint8Array(mod.HEAPU8.buffer, p, len).slice();
  mod._free(p);
  return bytes;
}

/**
 * Capture UADE's ground-truth per-tick synth wave buffers.
 *
 * The synth voice REWRITES the same chip buffer in place every replayer tick, so
 * a single post-render read only sees the last state. We render in ~1-tick chunks
 * (882 frames ≈ one 50 Hz vblank), and after each chunk read the current buffer at
 * each channel's latest AUDxLC:LEN — one snapshot per tick. Dedup by content.
 */
export function captureUadeBuffers(mod: AnyMod, name: string, data: Uint8Array): Set<string> {
  const chunkFrames = 882; // ~one PAL vblank tick at 44100
  const chunks = 400; // ~8 s of song
  const ptr = mod._malloc(data.byteLength);
  mod.HEAPU8.set(data, ptr);
  const hintPtr = mod._malloc(name.length * 4 + 1);
  mod.stringToUTF8(name, hintPtr, name.length * 4 + 1);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(0);
  mod._uade_wasm_set_one_subsong(1);
  const loadRet = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
  mod._free(ptr); mod._free(hintPtr);
  if (loadRet !== 0) throw new Error(`load failed ${loadRet}`);

  mod._uade_wasm_enable_paula_log(1);
  const ptrL = mod._malloc(chunkFrames * 4);
  const ptrR = mod._malloc(chunkFrames * 4);
  const logPtr = mod._malloc(512 * 3 * 4);

  const loc = [0, 0, 0, 0]; // current AUDxLC per channel (LCH<<16|LCL)
  const lenW = [0, 0, 0, 0]; // current AUDxLEN words per channel
  const lchTmp = [0, 0, 0, 0];
  const buffers = new Set<string>();

  for (let c = 0; c < chunks; c++) {
    const ret = mod._uade_wasm_render(ptrL, ptrR, chunkFrames);
    if (ret <= 0) break;
    for (const e of drainLog(mod, logPtr, 512)) {
      if (e.ch > 3) continue;
      if (e.reg === REG.LCH) lchTmp[e.ch] = e.value;
      else if (e.reg === REG.LCL) loc[e.ch] = (((lchTmp[e.ch] << 16) | e.value) >>> 0);
      else if (e.reg === REG.LEN) lenW[e.ch] = e.value;
    }
    // Snapshot every active voice's buffer as left by the last tick this chunk.
    for (let ch = 0; ch < 4; ch++) {
      if (loc[ch] === 0 || lenW[ch] === 0) continue;
      const bytes = readMem(mod, loc[ch], lenW[ch] * 2);
      buffers.add(hexOf(bytes));
    }
  }
  mod._free(ptrL); mod._free(ptrR); mod._free(logPtr);
  return buffers;
}

/**
 * Enumerate all wave buffers the NATIVE MEGAEFFECTS generator produces for each
 * synth instrument across a full arp cycle. Returns per-buffer → producing
 * instrument type, so a UADE buffer that matches can be attributed to a type.
 */
function enumerateNativeBuffers(
  synthInstruments: ReturnType<typeof parseSunTronicV13Score>['synthInstruments'],
): Map<string, number> {
  const byHex = new Map<string, number>(); // hex → synthType
  for (const inst of synthInstruments) {
    if (inst.waveWordLen <= 0) continue;
    // A full arp cycle covers every phase UADE could snapshot; run 2 cycles so
    // the arp-loop tail (arpLoop..arpLen) is also visited from a fresh start.
    const ticks = Math.max(1, inst.arpLen) * 2 + 4;
    const state = createVoiceState();
    const prng = createPrng();
    for (let t = 0; t < ticks; t++) {
      const buf = renderSynthTick(inst, state, prng);
      const hx = hexOf(buf);
      if (!byHex.has(hx)) byHex.set(hx, inst.synthType);
    }
  }
  return byHex;
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'mule.src';
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const sampleRate = 44100;

  // Native side: parse the module's synth instruments.
  const score = parseSunTronicV13Score(data);
  const synths = score.synthInstruments;
  const typeCounts: Record<number, number> = {};
  for (const s of synths) typeCounts[s.synthType] = (typeCounts[s.synthType] ?? 0) + 1;
  console.log(
    `[p5] ${name}: ${synths.length} synth instruments ` +
    `types { ${Object.entries(typeCounts).map(([t, n]) => `${t}:${n}`).join(' ')} }`,
  );

  const native = enumerateNativeBuffers(synths);
  console.log(`[p5] native MEGAEFFECTS enumerated ${native.size} distinct buffers`);

  const mod: AnyMod = await loadUADEModule(false);
  if (mod._uade_wasm_init(sampleRate) !== 0) throw new Error('init failed');
  let uade: Set<string>;
  try {
    addCompanions(mod, loadInstrCompanions());
    uade = captureUadeBuffers(mod, name, data);
  } finally {
    try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
  }
  console.log(`[p5] UADE captured ${uade.size} distinct chip-RAM wave buffers`);

  if (process.env.P5_DEBUG) {
    const byLen: Record<number, string[]> = {};
    for (const hx of uade) { const L = hx.length / 2; (byLen[L] ??= []).push(hx); }
    for (const L of Object.keys(byLen).map(Number).sort((a, b) => a - b)) {
      console.log(`[p5]   len ${L}B: ${byLen[L].length} distinct; sample: ${byLen[L][0].slice(0, 64)}...`);
      if (process.env.P5_FULL64 && L === 64) byLen[L].forEach((h) => console.log(`[p5]     U ${h}`));
    }
    const natByLen: Record<number, number> = {};
    for (const hx of native.keys()) { const L = hx.length / 2; natByLen[L] = (natByLen[L] ?? 0) + 1; }
    console.log(`[p5]   native lengths: ${Object.entries(natByLen).map(([l, n]) => `${l}B:${n}`).join(' ')}`);
  }

  // Match: how many UADE buffers does native reproduce exactly, and by which type?
  let matched = 0;
  const matchByType: Record<number, number> = {};
  for (const hx of uade) {
    const t = native.get(hx);
    if (t !== undefined) { matched++; matchByType[t] = (matchByType[t] ?? 0) + 1; }
  }
  const pct = uade.size ? ((matched / uade.size) * 100).toFixed(1) : '0.0';
  console.log(`[p5] MATCH: ${matched}/${uade.size} (${pct}%) UADE buffers reproduced natively`);
  console.log(
    `[p5]   by producing type: ` +
    `{ ${Object.entries(matchByType).map(([t, n]) => `${t}:${n}`).join(' ') || '(none)'} }`,
  );
  console.log(
    `[p5]   unmatched ${uade.size - matched} = buffers native cannot reproduce ` +
    `(feedback/live-buffer types 1/3/else, the wave1-approx suspects)`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
