/**
 * The game-music-emu wasm reads every NSF voice's state once per PLAY call.
 *
 * Phase 1 of the editable NSF import (thoughts/shared/plans/2026-11-18-nsf-editable-import.md):
 * gme_wasm_trace_* run a second Nsf_Emu and record the chip state after INIT
 * and after each PLAY call (layout in game-music-emu-wasm/src/gme_wasm.cpp).
 * The Phase 2 converter turns these records into Furnace notes and instruments.
 *
 * One real song per expansion chip lives next to dr mario.nsf (from modland).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const DIR = join(ROOT, 'public/gme');

interface GmeTraceModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _gme_wasm_trace_words(): number;
  _gme_wasm_trace_open(p: number, n: number, track: number): number;
  _gme_wasm_trace_run(frames: number): number;
  _gme_wasm_trace_frame(i: number): number;
  _gme_wasm_trace_read(addr: number): number;
  _gme_wasm_trace_play_hz(): number;
  _gme_wasm_trace_close(): void;
}

// Word offsets of the 2A03 voices in one record (see gme_wasm.cpp T_*).
const SQ1 = 2, SQ2 = 10, TRI = 18, NOISE = 26;
const PERIOD = 7, VOLUME = 5;

let b: WebBundle<GmeTraceModule>;
beforeAll(async () => {
  b = await loadWebBundle<GmeTraceModule>(join(DIR, 'Gme.js'), join(DIR, 'Gme.wasm'), 'createGme');
}, 60_000);

function trace(rel: string, track: number, frames: number): { chips: number; hz: number; rows: Uint16Array[] } {
  const m = b.module;
  const data = new Uint8Array(readFileSync(join(ROOT, rel)));
  const p = m._malloc(data.length);
  b.heap().set(data, p);
  const chips = m._gme_wasm_trace_open(p, data.length, track);
  m._free(p);
  expect(chips).toBeGreaterThanOrEqual(0);
  const n = m._gme_wasm_trace_run(frames);
  const words = m._gme_wasm_trace_words();
  const rows: Uint16Array[] = [];
  for (let i = 0; i < Math.min(n, frames); i++) {
    const at = m._gme_wasm_trace_frame(i);
    rows.push(new Uint16Array(b.heap().buffer, at, words).slice());
  }
  return { chips, hz: m._gme_wasm_trace_play_hz(), rows };
}

const distinct = (rows: Uint16Array[], at: number, gate?: number): number =>
  new Set(rows.filter((r) => gate === undefined || r[gate] > 0).map((r) => r[at])).size;

describe('NSF per-frame state trace', () => {
  it('2A03 (dr mario.nsf): notes change and volumes move on every melodic voice', () => {
    const { chips, hz, rows } = trace('public/data/songs/nsf/dr mario.nsf', 2, 1800); // 30 s of track 2, all four voices play
    b.module._gme_wasm_trace_close();
    expect(chips).toBe(0); // no expansion chip
    expect(hz).toBeGreaterThan(59);
    expect(hz).toBeLessThan(61);
    expect(rows.length).toBe(1800);
    for (const v of [SQ1, SQ2]) {
      expect(distinct(rows, v + PERIOD, v + VOLUME)).toBeGreaterThan(10); // pitch changes while audible
      expect(distinct(rows, v + VOLUME)).toBeGreaterThan(2); // envelope / volume moves
    }
    // Triangle has no volume: audible while length and linear counter run.
    const triOn = rows.filter((r) => r[TRI + 4] > 0 && r[TRI + 5] > 0 && r[TRI + 6]);
    expect(triOn.length).toBeGreaterThan(300);
    expect(new Set(triOn.map((r) => r[TRI + PERIOD])).size).toBeGreaterThan(10);
    expect(distinct(rows, NOISE + VOLUME)).toBeGreaterThan(1);
  });

  // chip bit (NSF header 0x7B), file, track, then the words that must move: [offset, gate offset | -1]
  const CHIPS: [string, number, string, number, number[]][] = [
    ['VRC6', 0x01, 'akumajou densetsu.nsf', 0, [42 + 3, 42 + 7, 42 + 11]],
    ['VRC7', 0x02, 'lagrange point.nsf', 2, [349 + 8, 349 + 11, 349 + 14]],
    ['FDS', 0x04, 'metroid (famicom disk system).nsf', 3, [71 + 0x42, 71 + 0x93]],
    ['MMC5', 0x08, 'just breed.nsf', 0, [54 + 7, 54 + 15]],
    ['N163', 0x10, 'king of kings (n106).nsf', 0, [221 + 0x40, 221 + 0x48, 221 + 0x50, 221 + 0x58, 221 + 0x60, 221 + 0x68, 221 + 0x70, 221 + 0x78]],
    ['S5B', 0x20, 'gimmick!.nsf', 0, [375, 375 + 2, 375 + 4]],
  ];
  it.each(CHIPS)('%s: expansion state words are live over 10 s', (_name, bit, file, track, words) => {
    const { chips, rows } = trace(`public/data/songs/nsf/${file}`, track, 600);
    b.module._gme_wasm_trace_close();
    expect(chips & bit).toBe(bit);
    expect(rows.length).toBe(600);
    const moving = words.map((w) => new Set(rows.map((r) => r[w])).size);
    expect(Math.max(...moving)).toBeGreaterThan(5);
  });

  it('reads PRG bytes through the bank mapping and rejects non-NSF data', () => {
    const m = b.module;
    const data = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/nsf/dr mario.nsf')));
    trace('public/data/songs/nsf/dr mario.nsf', 0, 1);
    const load = data[8] | (data[9] << 8);
    // No bank switching in this file: PRG maps at the load address.
    expect(m._gme_wasm_trace_read(load)).toBe(data[0x80]);
    expect(m._gme_wasm_trace_read(0x1234)).toBe(-1);
    m._gme_wasm_trace_close();
    const junk = m._malloc(16);
    b.heap().fill(0, junk, junk + 16);
    expect(m._gme_wasm_trace_open(junk, 16, 0)).toBe(-1);
    m._free(junk);
  });
});
