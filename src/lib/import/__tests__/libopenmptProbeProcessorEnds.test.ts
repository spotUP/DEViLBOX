/**
 * Disposing a ChiptunePlayer disconnected its nodes but the libopenmpt
 * processor kept running: a worklet processor lives until process() returns
 * false. After ~30 loads, 13 processors were still rendering on the audio
 * thread (5246 process() calls/s).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../public/chiptune3/libopenmpt.worklet.js', () => ({
  default: () => new Promise(() => { /* wasm never needed: no module is loaded */ }),
}));

type Proc = { process: () => boolean; handleMessage_: (m: { data: { cmd: string } }) => void };

describe('libopenmpt-processor', () => {
  it('importing ten modules leaves no probe processor still processing', async () => {
    let Ctor!: new (o: unknown) => Proc;
    (globalThis as Record<string, unknown>).AudioWorkletProcessor = class { port = { postMessage() {}, onmessage: null }; };
    (globalThis as Record<string, unknown>).registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
    const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
    await import(/* @vite-ignore */ workletPath);

    const procs = Array.from({ length: 10 }, () => new Ctor({}));
    procs.forEach((p) => p.handleMessage_({ data: { cmd: 'dispose' } }));
    const stillProcessing = procs.filter((p) => p.process() !== false).length;
    expect(stillProcessing).toBe(0);
  });
});
