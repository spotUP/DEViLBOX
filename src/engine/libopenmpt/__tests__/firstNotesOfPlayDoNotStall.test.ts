// @vitest-environment node
/**
 * The first notes of every Play stuttered (owner, 2026-10-23). The engine posted 'enableOsc'
 * 150 ms after play(), while the song was already audible, and the worklet's handler parsed the
 * whole module once per channel for the oscilloscopes on the audio thread: 21-27 ms for this
 * 4-channel XM against a 2.67 ms render quantum. The scopes are now built inside the paused
 * 'load', before 'playReady', so the parse lands before the first sample renders, and an
 * 'enableOsc' for a module whose scopes exist builds nothing.
 *
 * The hardest bug fixed in DEViLBOX so far (owner): both halves are guarded here.
 *
 * Real worklet + real libopenmpt wasm + a real song, driven the way the engine drives it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Msg = { data: { cmd: string; val?: unknown } };
type Proc = {
  handleMessage_: (m: Msg) => void;
  process: (i: unknown[], o: Float32Array[][], p: Record<string, unknown>) => boolean;
  createOscModule_: () => void;
  port: { postMessage: (m: { cmd: string }) => void };
  channels: number;
  oscModules: unknown[] | null;
};

const song = readFileSync(resolve(__dirname, '../../../../public/data/songs/xm/flo boarding - level 1.xm'));
const songBuffer = (): ArrayBuffer => song.buffer.slice(song.byteOffset, song.byteOffset + song.byteLength) as ArrayBuffer;

/** Counts the per-channel scope builds (one module parse per channel each). */
function countScopeBuilds(p: Proc): { builds: number } {
  const counter = { builds: 0 };
  const build = p.createOscModule_.bind(p);
  p.createOscModule_ = () => { counter.builds++; build(); };
  return counter;
}

function render(p: Proc, quanta: number): void {
  for (let i = 0; i < quanta; i++) p.process([], [[new Float32Array(128), new Float32Array(128)]], {});
}

describe('the first notes of a Play', () => {
  let Ctor!: new (o: unknown) => Proc;

  beforeAll(async () => {
    const g = globalThis as Record<string, unknown>;
    g.AudioWorkletProcessor = class { port = { postMessage: () => {}, onmessage: null }; };
    g.registerProcessor = (_n: string, c: unknown) => { Ctor = c as typeof Ctor; };
    g.sampleRate = 48000;
    g.currentTime = 0;
    const workletPath: string = '../../../../public/chiptune3/chiptune3.worklet.js';
    await import(/* @vite-ignore */ workletPath);
    for (let i = 0; i < 100 && !g.__libopenmptWarmup; i++) await new Promise((r) => setTimeout(r, 100));
  }, 60000);

  it('the per-channel scopes exist when the paused load answers playReady', () => {
    const p = new Ctor({});
    const scopesAtReply: Array<number | null> = [];
    p.port.postMessage = (m) => {
      if (m.cmd === 'playReady') scopesAtReply.push(p.oscModules ? p.oscModules.length : null);
    };
    p.handleMessage_({ data: { cmd: 'load', val: songBuffer() } });

    expect(p.channels).toBe(4);
    expect(scopesAtReply, 'the scopes must be built before playReady, while nothing renders').toEqual([4]);
  }, 60000);

  it('a scope request while the song plays builds nothing, so the output never stalls', () => {
    const p = new Ctor({});
    const scopes = countScopeBuilds(p);
    p.handleMessage_({ data: { cmd: 'load', val: songBuffer() } });
    expect(scopes.builds, 'the paused load builds the scopes once').toBe(1);

    p.handleMessage_({ data: { cmd: 'unpause' } });
    render(p, 60);
    const built = p.oscModules;
    p.handleMessage_({ data: { cmd: 'enableOsc' } });
    render(p, 60);

    expect(scopes.builds, 'an enableOsc while playing parsed the module again on the audio thread').toBe(1);
    expect(p.oscModules, 'the scopes were replaced while playing').toBe(built);
  }, 60000);

  it('the scopes come back after a disableOsc', () => {
    const p = new Ctor({});
    p.handleMessage_({ data: { cmd: 'load', val: songBuffer() } });
    p.handleMessage_({ data: { cmd: 'disableOsc' } });
    expect(p.oscModules).toBeNull();
    p.handleMessage_({ data: { cmd: 'enableOsc' } });
    expect(p.oscModules?.length).toBe(4);
  }, 60000);
});
