// @vitest-environment node
/**
 * A new song with one synth stopped playing and the console filled with
 * "memory access out of bounds" from the worklet's setPitch / setTempo
 * handlers (reported 2026-10-19). Both handlers wrote their ctl strings
 * with stackAlloc and never restored the wasm stack, so every pitch-slider
 * event leaked about 40 bytes of stack for the life of the wasm instance.
 * A few thousand slider events overran the stack and every later libopenmpt
 * call faulted.
 *
 * Real worklet + real libopenmpt wasm, driven the way the engine drives it.
 */
import { describe, it, expect } from 'vitest';

type Proc = {
  handleMessage_: (m: { data: { cmd: string; val?: unknown } }) => void;
  process: (i: unknown[], o: Float32Array[][], p: unknown) => boolean;
  modulePtr: number;
};
type Wasm = { stackSave: () => number };

const ENGINE_XM_HEX =
  '457874656e646564204d6f64756c653a2020202020202020202020202020202020202020201a4f70656e4d505420312e33332e30302e3233202004011500000001000000040001000000000006007d00000900000000400000005354504d2e4250520400040000002e4d50520400100000002e4d4d500400040000002e5657430400230033015657534c0400230033012e415053040030000000565453560400300000002e46534d1100010702000001f8ffff1f40270400010022';

describe('libopenmpt worklet ctl_set stack usage', () => {
  it('ten thousand setPitch/setTempo pairs leave the wasm stack where it was and the module still renders', async () => {
    const g = globalThis as Record<string, unknown>;
    let Ctor!: new (o: unknown) => Proc;
    g.AudioWorkletProcessor = class { port = { postMessage: () => {}, onmessage: null }; };
    g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
    g.sampleRate = 48000;
    g.currentTime = 0;
    const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
    await import(/* @vite-ignore */ workletPath);
    for (let i = 0; i < 100 && !g.__libopenmpt; i++) await new Promise((r) => setTimeout(r, 100));
    const wasm = g.__libopenmpt as Wasm | undefined;
    expect(wasm, 'worklet must expose the wasm instance').toBeDefined();

    const bytes = new Uint8Array(ENGINE_XM_HEX.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(ENGINE_XM_HEX.substr(i * 2, 2), 16);
    const p = new Ctor({});
    p.handleMessage_({ data: { cmd: 'play', val: bytes.buffer } });
    expect(p.modulePtr).not.toBe(0);

    const before = wasm!.stackSave();
    // The pitch slider sends one setTempo + one setPitch per input event.
    // Before the fix each pair leaked ~40 bytes; 10 000 pairs is ~400 KB,
    // well past the wasm stack, and the fault surfaced as a RuntimeError.
    for (let i = 0; i < 10000; i++) {
      const f = 0.25 + (i % 100) / 50;
      p.handleMessage_({ data: { cmd: 'setTempo', val: f } });
      p.handleMessage_({ data: { cmd: 'setPitch', val: f } });
    }
    expect(wasm!.stackSave(), 'ctl_set must restore the wasm stack').toBe(before);

    const out = [[new Float32Array(128), new Float32Array(128)]];
    expect(() => p.process([], out, {})).not.toThrow();
    p.handleMessage_({ data: { cmd: 'stop' } });
  }, 60000);
});
