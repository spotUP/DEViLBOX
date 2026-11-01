/**
 * A10 pitch proof for MONOTONE (.MON): render the first row of PRELUDE.MON in
 * the shipped WASM player and measure the period of the square wave it writes.
 *
 * Expected number: PRELUDE's first note is note 40 (middle C). The Pascal
 * table (MT_PLAY.PAS, equal temperament from A=440) gives Round(261.63) = 262
 * Hz, and the PC speaker divisor is PITfreq div 262 = 1193182 div 262 = 4554.
 * The speaker then sounds at 1193182 / 4554 = 262.01 Hz. PITfreq 1193182 is
 * the standard PC PIT clock; the original constant lives in an unreleased unit
 * (see the header of monotone-wasm/src/monotone.c), so it is unverified.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWebBundle } from '@/test/wasm/webBundle';

interface MonotoneModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _mt_create(data: number, size: number, sampleRate: number): number;
  _mt_destroy(m: number): void;
  _mt_render(m: number, out: number, frames: number): number;
  _mt_get_divisor(m: number): number;
  _mt_get_frequency(m: number): number;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SAMPLE_RATE = 48000;
const PIT_HZ = 1193182;
const EXPECTED_DIVISOR = 4554;

describe('MONOTONE pitch (A10)', () => {
  it('sounds PRELUDE row 0 at divisor 4554 (262 Hz) in the WASM player', async () => {
    const dir = join(ROOT, 'public/monotone');
    const b = await loadWebBundle<MonotoneModule>(join(dir, 'Monotone.js'), join(dir, 'Monotone.wasm'), 'createMonotone');
    const mod = b.module;
    const song = new Uint8Array(readFileSync(resolve(ROOT, 'src/lib/import/__tests__/fixtures/monotone/PRELUDE.MON')));

    const dataPtr = mod._malloc(song.length);
    b.heap().set(song, dataPtr);
    const m = mod._mt_create(dataPtr, song.length, SAMPLE_RATE);
    expect(m).not.toBe(0);

    // Render a quarter second: the first row holds one note for its whole length.
    const frames = SAMPLE_RATE / 4;
    const outPtr = mod._malloc(frames * 4);
    const rendered = mod._mt_render(m, outPtr, frames);
    expect(rendered).toBe(frames);
    expect(mod._mt_get_divisor(m)).toBe(EXPECTED_DIVISOR);

    const heap = b.heap();
    const samples = new Float32Array(heap.buffer.slice(outPtr, outPtr + frames * 4));
    // Measure the period from rising edges, skipping the first tick (the player
    // sounds what it chose on the previous tick).
    const rising: number[] = [];
    for (let i = SAMPLE_RATE / 60 + 1; i < frames; i++) {
      if (samples[i - 1] <= 0 && samples[i] > 0) rising.push(i);
    }
    expect(rising.length).toBeGreaterThan(20);
    const periodSamples = (rising[rising.length - 1] - rising[0]) / (rising.length - 1);
    const measuredHz = SAMPLE_RATE / periodSamples;
    expect(measuredHz).toBeCloseTo(PIT_HZ / EXPECTED_DIVISOR, 0); // 262.01 Hz

    mod._free(outPtr);
    mod._mt_destroy(m);
    mod._free(dataPtr);
  });
});
