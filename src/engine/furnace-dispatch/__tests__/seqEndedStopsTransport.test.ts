/**
 * Furnace FF (stop song) stops the WASM sequencer, but the worklet only went
 * quiet about it: no message reached the main thread, so the transport kept
 * "playing" and every channel kept its last tone (BossGame start.fur,
 * 2026-11-13: a held beep after the jingle). The worklet must post seqEnded
 * on the tick the sequencer stops, once.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Processor {
  process(inputs: unknown[], outputs: Float32Array[][], params: unknown): boolean;
}

let Processor: new () => Processor;

beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../../../../public/furnace-dispatch/FurnaceDispatch.worklet.js'), 'utf8');
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_name: string, cls: new () => Processor) => { Processor = cls; },
    sampleRate: 48000,
    currentTime: 0,
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
});

describe('the WASM sequencer stopping by itself', () => {
  it('posts seqEnded once, on the tick FF stops it', () => {
    const p = new Processor() as Processor & Record<string, unknown>;
    let ticksLeft = 3; // the third tick runs the FF row
    const calls: Record<string, () => number> = {
      seqIsPlaying: () => (ticksLeft > 0 ? 1 : 0),
      seqTick: () => { ticksLeft--; return 0; },
    };
    const wasm = new Proxy(calls, { get: (t, k: string) => t[k] ?? (() => 0) });
    const posted: string[] = [];
    Object.assign(p, {
      initialized: true, wasm, sequencerActive: true,
      chips: new Map([[1, { handle: 1, numChannels: 3 }]]),
      updateBufferViews: () => {},
      outputBufferL: new Float32Array(128), outputBufferR: new Float32Array(128),
      samplesPerTick: 128, tickAccumulator: 0,
      port: { postMessage: (m: { type: string }) => posted.push(m.type) },
    });
    const out = [[new Float32Array(128), new Float32Array(128)]];
    for (let i = 0; i < 6; i++) p.process([], out, {});

    expect(posted.filter((t) => t === 'seqEnded')).toEqual(['seqEnded']);
  });
});
