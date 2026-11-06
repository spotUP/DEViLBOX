/**
 * Loading a PreTracker song is silent; the worklet renders audio only between 'play' and 'stop'.
 *
 * Wired: the real worklet file is evaluated with a fake AudioWorkletProcessor and a fake replayer module; the
 * sentinel is the replayer's _player_render call count, driven through the processor's message and process entry points.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'public/pretracker/PreTracker.worklet.js'), 'utf-8');

function makeProcessor() {
  let Ctor: new () => Record<string, any>;
  class Base { port = { onmessage: null as unknown, postMessage: () => {} }; }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'currentTime', SRC)(
    Base, (_n: string, c: typeof Ctor) => { Ctor = c; }, 0);
  const proc = new Ctor!();
  const calls = { render: 0 };
  const heap = new Float32Array(4096);
  proc.module = {
    HEAPF32: heap,
    _player_render: (_p: number, n: number) => { calls.render++; heap.fill(0.5, 0, n * 2); return n; },
  };
  proc.initialized = true;
  proc.interleavedPtr = 16;
  const out = () => [new Float32Array(128), new Float32Array(128)];
  const run = () => { const o = out(); proc.process([], [o], {}); return o; };
  return { proc, calls, run };
}

describe('PreTracker worklet transport', () => {
  it('stays silent after load, sounds after play, silent again after stop', () => {
    const { proc, calls, run } = makeProcessor();
    const loaded = run();
    expect(calls.render).toBe(0);
    expect(loaded[0].every((v) => v === 0)).toBe(true);

    proc.handleMessage({ type: 'play' });
    const played = run();
    expect(calls.render).toBe(1);
    expect(played[0][0]).toBe(0.5);

    proc.handleMessage({ type: 'stop' });
    run();
    expect(calls.render).toBe(1);
  });
});
