/**
 * Sawteeth song playback levels on a real tune (okolaNUKE.st). Instrument 1
 * uses the OLP filter, whose feedback ran into a clamp and buzzed at full
 * scale forever, drowning channel 0 and hiding the other channels. Its amp
 * envelope ends at 0, so the voice must decay and the channel must stay well
 * below full scale.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();

interface SawteethWasm {
  _malloc(n: number): number;
  _free(p: number): void;
  _sawteeth_init(ptr: number, len: number): number;
  _sawteeth_stop(): void;
  _sawteeth_render(out: number, n: number): number;
  _sawteeth_set_channel_gain(ch: number, g: number): void;
  _sawteeth_preview_create(ins: number): number;
  _sawteeth_preview_free(h: number): void;
  _sawteeth_preview_note_on(h: number, note: number, vel: number): void;
  _sawteeth_preview_render(out: number, n: number): number;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
}

let m: SawteethWasm;
let song: Buffer;
let songPtr: number;

beforeAll(async () => {
  const src = readFileSync(resolve(root, 'public/sawteeth/Sawteeth.js'), 'utf8');
  const mod: { exports: unknown } = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', src)(
    mod, mod.exports, createRequire(import.meta.url), resolve(root, 'public/sawteeth'), resolve(root, 'public/sawteeth/Sawteeth.js'));
  const create = mod.exports as (opts: { wasmBinary: Buffer }) => Promise<SawteethWasm>;
  m = await create({ wasmBinary: readFileSync(resolve(root, 'public/sawteeth/Sawteeth.wasm')) });
  song = readFileSync(resolve(root, 'public/data/songs/sawteeth/okolaNUKE.st'));
  songPtr = m._malloc(song.length);
  m.HEAPU8.set(song, songPtr);
});

function rms(render: (buf: number, n: number) => void, seconds: number): number {
  const buf = m._malloc(512 * 2 * 4);
  let sum = 0;
  let count = 0;
  for (let done = 0; done < 44100 * seconds; done += 512) {
    m.HEAPF32.fill(0, buf >> 2, (buf >> 2) + 1024);
    render(buf, 512);
    for (let j = 0; j < 1024; j++) {
      const v = m.HEAPF32[(buf >> 2) + j];
      sum += v * v;
      count++;
    }
  }
  m._free(buf);
  return Math.sqrt(sum / count);
}

describe('Sawteeth okolaNUKE.st levels', () => {
  it('instrument 1 (OLP filter) decays to silence after its envelope ends', () => {
    m._sawteeth_stop();
    expect(m._sawteeth_init(songPtr, song.length)).toBe(0);
    const h = m._sawteeth_preview_create(1);
    m._sawteeth_preview_note_on(h, 49, 100);
    const render = (b: number, n: number) => { m._sawteeth_preview_render(b, n); };
    const start = rms(render, 0.1);
    rms(render, 1.4);
    const tail = rms(render, 0.5);
    m._sawteeth_preview_free(h);
    expect(start).toBeGreaterThan(0.05);
    expect(tail).toBeLessThan(0.02);
  });

  it('channel 0 stays below a clipped buzz over the first 10 seconds', () => {
    m._sawteeth_stop();
    expect(m._sawteeth_init(songPtr, song.length)).toBe(0);
    for (let c = 0; c < 4; c++) m._sawteeth_set_channel_gain(c, c === 0 ? 1 : 0);
    const level = rms((b, n) => { m._sawteeth_render(b, n); }, 10);
    for (let c = 0; c < 4; c++) m._sawteeth_set_channel_gain(c, 1);
    expect(level).toBeGreaterThan(0.01);
    expect(level).toBeLessThan(0.1);
  });

  /**
   * Channels 2 and 3 are mostly rests in this tune (verified from the part
   * data: ch3 is one all-rest part until 11.52 s, ch2 plays instrument 5 drum
   * hits at 2.88-3.84 s and 10.56-11.52 s and instrument 6 at 13.44-17.28 s).
   * Where a note sounds the channel must be audible; in the rests it must be
   * silent. Windows are whole seconds, [start, end).
   */
  const channelWindows: Record<number, { sounding: [number, number][]; rest: [number, number][] }> = {
    2: { sounding: [[3, 4], [13, 17]], rest: [[0, 2], [5, 10]] },
    3: { sounding: [[11, 13], [17, 20]], rest: [[0, 10], [14, 16]] },
  };

  for (const ch of [2, 3]) {
    it(`channel ${ch} is audible in every window with a sounding note and silent in rests`, () => {
      m._sawteeth_stop();
      expect(m._sawteeth_init(songPtr, song.length)).toBe(0);
      for (let c = 0; c < 4; c++) m._sawteeth_set_channel_gain(c, c === ch ? 1 : 0);
      const perSecond: number[] = [];
      for (let sec = 0; sec < 20; sec++) perSecond.push(rms((b, n) => { m._sawteeth_render(b, n); }, 1));
      for (let c = 0; c < 4; c++) m._sawteeth_set_channel_gain(c, 1);
      const { sounding, rest } = channelWindows[ch];
      for (const [a, b] of sounding) {
        for (let sec = a; sec < b; sec++) expect(perSecond[sec], `ch${ch} second ${sec}`).toBeGreaterThan(0.01);
      }
      for (const [a, b] of rest) {
        for (let sec = a; sec < b; sec++) expect(perSecond[sec], `ch${ch} rest second ${sec}`).toBeLessThan(0.002);
      }
    });
  }
});
