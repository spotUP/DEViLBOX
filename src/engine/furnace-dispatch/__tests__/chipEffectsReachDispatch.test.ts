// @vitest-environment node
// The real Furnace sequencer WASM (no mocks) must turn a pattern effect on AMIGA / POKEY into the
// DIV_CMD_* the generated sysDef effect table names, with the converted value. Effect numbers,
// commands and value pools all come from furnaceEffectTable.gen.ts, never from literals here.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FURNACE_EFFECT_POOL, FURNACE_EFFECT_TABLE, FURNACE_DISPATCH_CMD_NAMES } from '../furnaceEffectTable.gen';

const dir = path.resolve(__dirname, '../../../../public/furnace-dispatch');
// DivSystem ids (third-party/furnace-master/src/engine/sysDef.h), equal to the dispatch platform ids.
const AMIGA = 18;
const POKEY = 41;

interface Mod {
  getValue(ptr: number, type: string): number;
  _furnace_init(): void;
  _furnace_dispatch_create(platform: number, rate: number): number;
  _furnace_dispatch_get_num_channels(h: number): number;
  _furnace_seq_load_song(ch: number, patLen: number, orders: number): void;
  _furnace_seq_set_cell(ch: number, pat: number, row: number, col: number, v: number): void;
  _furnace_seq_set_order(ch: number, order: number, pat: number): void;
  _furnace_seq_set_effect_cols(ch: number, n: number): void;
  _furnace_seq_set_channel_chip(ch: number, chip: number, sub: number): void;
  _furnace_seq_set_channel_dispatch(ch: number, h: number): void;
  _furnace_seq_set_dispatch_handle(h: number): void;
  _furnace_seq_set_sample_rate(r: number): void;
  _furnace_seq_set_divider(d: number): void;
  _furnace_seq_set_speed(a: number, b: number): void;
  _furnace_seq_play(order: number, row: number): void;
  _furnace_seq_tick(): number;
  _furnace_cmd_log_enable(e: number): void;
  _furnace_cmd_log_count(): number;
  _furnace_cmd_log_get(): number;
  _free(p: number): void;
}

async function load(): Promise<Mod> {
  const src = readFileSync(path.join(dir, 'FurnaceDispatch.js'), 'utf8');
  const factory = new Function('module', 'exports', 'define', 'require', '__dirname', '__filename', `${src}\nreturn createFurnaceDispatch;`)(
    undefined, undefined, undefined, createRequire(import.meta.url), dir, path.join(dir, 'FurnaceDispatch.js')) as (o: object) => Promise<Mod>;
  return factory({ wasmBinary: readFileSync(path.join(dir, 'FurnaceDispatch.wasm')) });
}

/** What Furnace's handler for (system, lane, effect) must dispatch for this parameter. */
function expected(sys: number, lane: 'effect' | 'post' | 'pre', fx: number, param: number) {
  const e = FURNACE_EFFECT_TABLE[sys][lane][fx];
  const pick = (i: number) => (i < 0 ? null : FURNACE_EFFECT_POOL[i][param]);
  return { cmd: e[0], val: pick(e[1]) ?? param, val2: pick(e[2]) ?? 0 };
}

/** Plays one effect per row on channel 0 and returns the command log. */
async function play(sys: number, rows: Array<[fx: number, param: number]>) {
  const m = await load();
  m._furnace_init();
  const h = m._furnace_dispatch_create(sys, 44100);
  expect(h).toBeGreaterThan(0);
  const chans = m._furnace_dispatch_get_num_channels(h);
  m._furnace_seq_load_song(chans, rows.length, 1);
  for (let c = 0; c < chans; c++) {
    m._furnace_seq_set_order(c, 0, 0);
    m._furnace_seq_set_effect_cols(c, 1);
    m._furnace_seq_set_channel_chip(c, sys, c);
    m._furnace_seq_set_channel_dispatch(c, h);
  }
  m._furnace_seq_set_dispatch_handle(h);
  m._furnace_seq_set_sample_rate(44100);
  m._furnace_seq_set_divider(60);
  m._furnace_seq_set_speed(1, 1);
  rows.forEach(([fx, param], r) => {
    m._furnace_seq_set_cell(0, 0, r, 3, fx);
    m._furnace_seq_set_cell(0, 0, r, 4, param);
  });
  m._furnace_cmd_log_enable(1);
  m._furnace_seq_play(0, 0);
  for (let t = 0; t < rows.length + 2; t++) m._furnace_seq_tick();
  const n = m._furnace_cmd_log_count();
  const p = m._furnace_cmd_log_get();
  const raw = Array.from({ length: n * 6 }, (_, i) => m.getValue(p + i * 4, 'i32'));
  m._free(p);
  const log: Array<{ cmd: number; chan: number; val1: number; val2: number }> = [];
  for (let i = 0; i < n; i++) log.push({ cmd: raw[i * 6 + 1], chan: raw[i * 6 + 2], val1: raw[i * 6 + 3], val2: raw[i * 6 + 4] });
  return log;
}

function check(sys: number, lane: 'effect' | 'post', fxs: number[], param: (fx: number) => number) {
  return async () => {
    const log = await play(sys, fxs.map((fx) => [fx, param(fx)]));
    for (const fx of fxs) {
      const want = expected(sys, lane, fx, param(fx));
      const hit = log.find((l) => l.cmd === want.cmd && l.chan === 0 && l.val1 === want.val && l.val2 === want.val2);
      expect(hit, `fx 0x${fx.toString(16)} -> ${FURNACE_DISPATCH_CMD_NAMES[want.cmd]}(${want.val},${want.val2}) in ${JSON.stringify(log.slice(0, 12))}`).toBeDefined();
    }
  };
}

describe('Furnace chip effects reach the real dispatch (sequencer WASM, cmd log)', () => {
  it('AMIGA post effects: filter, amplitude modulation, period modulation, wave', check(AMIGA, 'post', Object.keys(FURNACE_EFFECT_TABLE[AMIGA].post).map(Number), (fx) => 1 + (fx & 1)));
  it('POKEY effects: waveform, AUDCTL noise mode, noise frequency', check(POKEY, 'effect', Object.keys(FURNACE_EFFECT_TABLE[POKEY].effect).map(Number), (fx) => 2 + (fx & 3)));
});
