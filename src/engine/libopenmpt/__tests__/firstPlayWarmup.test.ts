// @vitest-environment node
/**
 * The first song played after a page load dropped out (DX7 song, reported
 * 2026-10-15). libopenmpt's first module create costs ~41 ms against ~4 ms
 * afterwards, and that cost landed in the worklet's 'play' handler, which runs
 * on the audio thread. The worklet now warms libopenmpt once when the wasm
 * loads, so the first audible play takes the warm path.
 *
 * Real worklet + real libopenmpt wasm, driven the way the engine drives it,
 * with the 187-byte XM the engine sends for a synth-only song.
 */
import { describe, it, expect } from 'vitest';

type Proc = {
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  modulePtr: number;
};

const ENGINE_XM_HEX =
  '457874656e646564204d6f64756c653a2020202020202020202020202020202020202020201a4f70656e4d505420312e33332e30302e3233202004011500000001000000040001000000000006007d00000900000000400000005354504d2e4250520400040000002e4d50520400100000002e4d4d500400040000002e5657430400230033015657534c0400230033012e415053040030000000565453560400300000002e46534d1100010702000001f8ffff1f40270400010022';

describe('first play after load', () => {
  it('libopenmpt is warmed at wasm load, so the first play handler is fast', async () => {
    const g = globalThis as Record<string, unknown>;
    let Ctor!: new (o: unknown) => Proc;
    g.AudioWorkletProcessor = class { port = { postMessage: () => {}, onmessage: null }; };
    g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
    g.sampleRate = 48000;
    g.currentTime = 0;
    const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
    await import(/* @vite-ignore */ workletPath);

    // The wasm instantiates asynchronously; the warm-up runs when it is up.
    for (let i = 0; i < 100 && !g.__libopenmptWarmup; i++) await new Promise((r) => setTimeout(r, 100));
    const warm = g.__libopenmptWarmup as { frames: number; ms: number } | undefined;
    expect(warm, 'warm-up must run when the wasm loads').toBeDefined();
    expect(warm!.frames, 'warm-up must render through the module').toBe(512);

    const bytes = new Uint8Array(ENGINE_XM_HEX.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(ENGINE_XM_HEX.substr(i * 2, 2), 16);
    const p = new Ctor({});
    const t0 = performance.now();
    p.handleMessage_({ data: { cmd: 'play', val: bytes.buffer } });
    const firstPlayMs = performance.now() - t0;
    expect(p.modulePtr).not.toBe(0);
    // Cold this measured 41+ ms; warm about 4 ms.
    expect(firstPlayMs).toBeLessThan(20);
  }, 60000);
});
