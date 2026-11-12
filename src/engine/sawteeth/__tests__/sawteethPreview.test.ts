/**
 * Sawteeth keyboard preview: the standalone preview voice in the WASM replayer
 * must sound for every instrument of a real tune (okolaNUKE.st), and the
 * factory must hand back a synth instead of null for SawteethSynth.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();

interface SawteethWasm {
  _malloc(n: number): number;
  _free(p: number): void;
  _sawteeth_init(ptr: number, len: number): number;
  _sawteeth_stop(): void;
  _sawteeth_preview_create(ins: number): number;
  _sawteeth_preview_free(h: number): void;
  _sawteeth_preview_note_on(h: number, note: number, vel: number): void;
  _sawteeth_preview_note_off(h: number): void;
  _sawteeth_preview_render(out: number, n: number): number;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
}

let m: SawteethWasm;

beforeAll(async () => {
  // The package is ESM, so the emscripten file's CommonJS export branch is off:
  // run it as a function body and take the factory from a fake module object.
  const src = readFileSync(resolve(root, 'public/sawteeth/Sawteeth.js'), 'utf8');
  const mod: { exports: unknown } = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', src)(
    mod, mod.exports, createRequire(import.meta.url), resolve(root, 'public/sawteeth'), resolve(root, 'public/sawteeth/Sawteeth.js'));
  const create = mod.exports as (opts: { wasmBinary: Buffer }) => Promise<SawteethWasm>;
  m = await create({ wasmBinary: readFileSync(resolve(root, 'public/sawteeth/Sawteeth.wasm')) });
  const file = readFileSync(resolve(root, 'public/data/songs/sawteeth/okolaNUKE.st'));
  const p = m._malloc(file.length);
  m.HEAPU8.set(file, p);
  expect(m._sawteeth_init(p, file.length)).toBe(0);
  m._free(p);
});

/** Peak of the preview voice over about 0.5 s, 128 frames at a time. */
function previewPeak(ins: number, note: number): number {
  const h = m._sawteeth_preview_create(ins);
  expect(h).toBeGreaterThanOrEqual(0);
  const buf = m._malloc(128 * 2 * 4);
  m._sawteeth_preview_note_on(h, note, 100);
  let peak = 0;
  for (let i = 0; i < 172; i++) {
    m.HEAPF32.fill(0, buf >> 2, (buf >> 2) + 256);
    m._sawteeth_preview_render(buf, 128);
    for (let j = 0; j < 256; j++) peak = Math.max(peak, Math.abs(m.HEAPF32[(buf >> 2) + j]));
  }
  m._sawteeth_preview_note_off(h);
  m._sawteeth_preview_free(h);
  m._free(buf);
  return peak;
}

describe('Sawteeth standalone preview voice (okolaNUKE.st)', () => {
  for (let ins = 1; ins <= 6; ins++) {
    it(`instrument ${ins} renders non-silent audio at a middle note`, () => {
      expect(previewPeak(ins, 49)).toBeGreaterThan(0.001);
    });
  }

  it('a voice of an unknown instrument is refused', () => {
    expect(m._sawteeth_preview_create(200)).toBe(-1);
  });

  it('the voice survives stopping the song (keyboard works after transport stop)', () => {
    const h = m._sawteeth_preview_create(1);
    m._sawteeth_stop();
    const buf = m._malloc(128 * 2 * 4);
    m.HEAPF32.fill(0, buf >> 2, (buf >> 2) + 256);
    m._sawteeth_preview_note_on(h, 49, 100);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      m._sawteeth_preview_render(buf, 128);
      for (let j = 0; j < 256; j++) peak = Math.max(peak, Math.abs(m.HEAPF32[(buf >> 2) + j]));
    }
    expect(peak).toBeGreaterThan(0.001);
    m._sawteeth_preview_free(h);
    m._free(buf);
  });
});

vi.mock('@/utils/audio-context', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/audio-context')>()),
  getDevilboxAudioContext: () => ({ createGain: () => ({ disconnect() {} }) }),
}));
vi.mock('../SawteethEngine', () => ({
  SawteethEngine: { getInstance: () => ({}) },
}));

describe('InstrumentFactory for SawteethSynth', () => {
  it('returns a synth, not null', async () => {
    const { InstrumentFactory } = await import('../../InstrumentFactory');
    const { SawteethSynth } = await import('../SawteethSynth');
    const synth = InstrumentFactory.createInstrument({
      id: 1, name: '', type: 'synth', synthType: 'SawteethSynth',
    } as never);
    expect(synth).toBeInstanceOf(SawteethSynth);
  }, 120000);
});
