/**
 * Ben Daglish: each voice's own output reaches the oscilloscopes (BD-NO-SCOPES, owner 2026-11-05).
 * The Bd worklet rendered one stereo mix and posted no oscData, so the scopes and per-channel meters were empty.
 * Real worklet + WASM; the posted oscData goes through the scope store.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
type Proc = { handleMessage(d: unknown): Promise<void>; process(i: Float32Array[][], o: Float32Array[][]): boolean };
let Processor: new () => Proc;
const posted: Array<{ type?: string; channels?: Int16Array[]; frame?: number; sampleRate?: number }> = [];

beforeAll(() => {
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: { type?: string }) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 44100,
    currentTime: 0,
  };
  new Function(readFileSync(resolve(ROOT, 'public/worklets/channel-stream.js'), 'utf8'))();
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/bd/Bd.worklet.js'), 'utf8'))(...Object.values(scope));
});

describe('a Ben Daglish song', { timeout: 60000 }, () => {
  it('posts each voice to the oscilloscope store while it plays', async () => {
    const p = new Processor();
    const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
    Object.defineProperty(process, 'versions', { value: {}, configurable: true });
    try {
      await p.handleMessage({
        type: 'init', sampleRate: 44100,
        wasmBinary: readFileSync(resolve(ROOT, 'public/bd/Bd.wasm')),
        jsCode: readFileSync(resolve(ROOT, 'public/bd/Bd.js'), 'utf8'),
      });
    } finally { Object.defineProperty(process, 'versions', versions); }
    const file = readFileSync(resolve(ROOT, 'public/data/songs/ben-daglish/motorhead-titleandingame.bd'));
    await p.handleMessage({ type: 'loadModule', moduleData: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), subsong: 0 });
    expect(posted.find((m) => m.type === 'error'), JSON.stringify(posted)).toBeUndefined();

    let mixed = 0;
    for (let b = 0; b < (44100 * 5) / 128; b++) {
      const l = new Float32Array(128), r = new Float32Array(128);
      p.process([], [[l, r]]);
      for (const v of l) mixed += Math.abs(v);
    }
    expect(mixed).toBeGreaterThan(0);

    const osc = posted.filter((m) => m.type === 'oscData');
    expect(osc.length).toBeGreaterThan(50);
    expect(osc[osc.length - 1].channels!.length).toBe(4);
    const heard = [0, 1, 2, 3].filter((v) => osc.some((m) => m.channels![v].some((x) => x !== 0)));
    expect(heard.length, JSON.stringify(heard)).toBeGreaterThanOrEqual(2);

    const { useOscilloscopeStore } = await import('@stores/useOscilloscopeStore');
    for (const m of osc) useOscilloscopeStore.getState().updateChannelData(m.channels!, m.frame!, m.sampleRate!);
    expect(useOscilloscopeStore.getState().channelData[heard[0]]!.length).toBeGreaterThan(0);
  });
});
