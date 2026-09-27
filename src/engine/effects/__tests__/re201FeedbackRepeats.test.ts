/**
 * "Pull FEEDBACK right and I get LESS feedback" (2026-09-22).
 *
 * The RE-201 echo - the dub bus's echo engine - made no repeats at all.
 * OnePole::setLowpass computed its coefficient in float, and at the 2 Hz
 * corner of the delay-time smoother cosf(w) rounds to exactly 1.0f: b1 = 1,
 * a0 = 0, a filter frozen at 0. The delay time never left 0, the tape delay
 * read one sample behind its write head, and the Intensity (feedback) knob
 * had nothing to act on: output was silent 50 ms after a burst at every
 * intensity (measured 2026-09-27).
 *
 * Runs the shipped public/re201/RE201.wasm.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type RE201 = Record<string, (...a: number[]) => number> & { HEAPF32: Float32Array };
let createRE201: (o: object) => Promise<RE201>;
const wasmBinary = readFileSync(resolve(__dirname, '../../../../public/re201/RE201.wasm'));

beforeAll(() => {
  const js = readFileSync(resolve(__dirname, '../../../../public/re201/RE201.js'), 'utf8');
  createRE201 = new Function(`${js}\nreturn createRE201;`)();
});

/** Build the module the way a browser would: the build refuses Node. */
async function instantiate(): Promise<RE201> {
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try { return await createRE201({ wasmBinary }); }
  finally { Object.defineProperty(process, 'versions', versions); }
}

/** RMS of the echo output per half second after a 50 ms burst. */
async function tail(intensity: number): Promise<number[]> {
  const M = await instantiate();
  const sr = 48000, n = 128;
  const h = M._re201_create(sr);
  M._re201_set_delay_mode(h, 1);            // head 1 only: echo, no reverb
  M._re201_set_repeat_rate(h, 0.383);        // ~450 ms, the dub bus's 1/4 at 133 BPM
  M._re201_set_intensity(h, intensity);
  M._re201_set_echo_volume(h, 0.9);
  M._re201_set_input_level(h, 1);
  const [inL, inR, oL, oR] = [0, 0, 0, 0].map(() => M._malloc(n * 4));
  const rms: number[] = [];
  let acc = 0, cnt = 0;
  for (let b = 0; b < (sr * 4) / n; b++) {
    const input = new Float32Array(M.HEAPF32.buffer, inL, n);
    for (let i = 0; i < n; i++) input[i] = b < 19 ? 0.5 * Math.sin(((b * n + i) * 2 * Math.PI * 800) / sr) : 0;
    new Float32Array(M.HEAPF32.buffer, inR, n).set(input);
    M._re201_process(h, inL, inR, oL, oR, n);
    for (const v of new Float32Array(M.HEAPF32.buffer, oL, n)) acc += v * v;
    cnt += n;
    if (cnt >= sr / 2) { rms.push(Math.sqrt(acc / cnt)); acc = 0; cnt = 0; }
  }
  return rms;
}

describe('the RE-201 echo', { timeout: 60000 }, () => {
  it('repeats after the first half second', async () => {
    const t = await tail(0.5);
    expect(t[1]).toBeGreaterThan(0.005);
  });

  it('rings longer the further Intensity is turned up', async () => {
    const low = await tail(0.2), mid = await tail(0.5), high = await tail(0.9);
    // Energy left at 2-2.5 s after the burst.
    expect(mid[4]).toBeGreaterThan(low[4]);
    expect(high[4]).toBeGreaterThan(mid[4] * 3);
  });
});
