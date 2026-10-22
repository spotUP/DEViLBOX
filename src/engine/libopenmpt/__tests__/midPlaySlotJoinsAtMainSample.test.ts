// @vitest-environment node
/**
 * An effect retargeted while a song plays builds a new channel isolation slot (a second libopenmpt
 * module that renders only that channel). The slot was seeked to main's order and row only, so it
 * started at the beginning of main's row while main was already part way through it: the isolated
 * channel played up to one row behind the rest of the song (owner, 2026-10-22, found during the
 * first-rows distortion fix).
 *
 * Real worklet + real libopenmpt wasm. Main renders 50 blocks of 128 frames (mid-row), a slot
 * covering every channel is added, and its next block must equal what a reference module renders
 * after exactly the same 50 x 128 frames from the start.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Slot = { modulePtr: number; leftPtr: number; rightPtr: number };
type Proc = {
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  process: (i: unknown[], o: Float32Array[][], p: unknown) => boolean;
  modulePtr: number;
  channels: number;
  isolationSlots: (Slot | null)[];
  dubSlots: (Slot | null)[];
};
type Wasm = {
  HEAPF32: Float32Array;
  _malloc: (n: number) => number;
  _openmpt_module_read_float_stereo: (m: number, sr: number, n: number, l: number, r: number) => number;
  _openmpt_module_get_position_seconds: (m: number) => number;
};

const SR = 48000;
const BLOCKS = 50;

const loadWorklet = async (): Promise<{ Ctor: new (o: unknown) => Proc; wasm: Wasm }> => {
  const g = globalThis as Record<string, unknown>;
  let Ctor!: new (o: unknown) => Proc;
  g.AudioWorkletProcessor = class { port = { postMessage: () => {}, onmessage: null }; };
  g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
  g.sampleRate = SR;
  g.currentTime = 0;
  const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
  await import(/* @vite-ignore */ workletPath);
  for (let i = 0; i < 100 && !g.__libopenmpt; i++) await new Promise((r) => setTimeout(r, 100));
  return { Ctor, wasm: g.__libopenmpt as Wasm };
};

/** Next 128 stereo frames of `modulePtr`, copied out of the heap. */
const readBlock = (wasm: Wasm, s: Slot): Float32Array => {
  const n = wasm._openmpt_module_read_float_stereo(s.modulePtr, SR, 128, s.leftPtr, s.rightPtr);
  const out = new Float32Array(256);
  out.set(wasm.HEAPF32.subarray(s.leftPtr / 4, s.leftPtr / 4 + n), 0);
  out.set(wasm.HEAPF32.subarray(s.rightPtr / 4, s.rightPtr / 4 + n), 128);
  return out;
};

describe('a slot added while the song plays joins main at its exact sample', () => {
  it('the isolation slot and the dub slot render what main renders at that frame, not the start of its row', async () => {
    const { Ctor, wasm } = await loadWorklet();
    const bytes = readFileSync(join(process.cwd(), 'src/__tests__/fixtures/micro15-goto80.mod'));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    const p = new Ctor({});
    p.handleMessage_({ data: { cmd: 'play', val: buffer } });
    expect(p.modulePtr).not.toBe(0);
    const out = [[new Float32Array(128), new Float32Array(128)]];
    for (let i = 0; i < BLOCKS; i++) p.process([], out, {});

    p.handleMessage_({ data: { cmd: 'addIsolation', val: { slotIndex: 0, channelMask: (1 << p.channels) - 1 } } });
    const slot = p.isolationSlots[0];
    expect(slot, 'the isolation slot was built').toBeTruthy();
    p.handleMessage_({ data: { cmd: 'dubChannelEnable', val: { channel: 0 } } });

    // Reference: a second worklet processor on the same file, rendered for exactly the frames main has
    // rendered, so it carries the worklet's own module config (repeat count, stereo, interpolation, Amiga resampler).
    const r = new Ctor({});
    r.handleMessage_({ data: { cmd: 'play', val: buffer.slice(0) } });
    for (let i = 0; i < BLOCKS; i++) r.process([], out, {});
    const ref: Slot = { modulePtr: r.modulePtr, leftPtr: wasm._malloc(512), rightPtr: wasm._malloc(512) };

    const mainSec = wasm._openmpt_module_get_position_seconds(p.modulePtr);
    expect(wasm._openmpt_module_get_position_seconds(slot!.modulePtr), 'slot clock equals main clock')
      .toBeCloseTo(mainSec, 6);

    const want = readBlock(wasm, ref);
    expect(want.some((v) => Math.abs(v) > 1e-4), 'the reference block is not silent').toBe(true);
    const got = readBlock(wasm, slot!);
    let worst = 0;
    for (let i = 0; i < 256; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]));
    expect(worst, 'isolation slot sample error against main').toBeLessThan(1e-5);

    const dub = p.dubSlots[0];
    expect(dub, 'the dub slot was built').toBeTruthy();
    expect(wasm._openmpt_module_get_position_seconds(dub!.modulePtr), 'dub slot clock equals main clock')
      .toBeCloseTo(mainSec, 6);

    r.handleMessage_({ data: { cmd: 'stop' } });
    p.handleMessage_({ data: { cmd: 'stop' } });
  }, 60000);
});
