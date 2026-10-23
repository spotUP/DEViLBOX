/**
 * A note scheduled ahead keeps its time on the Hively instrument player. The synth dropped the `time` argument of
 * triggerAttack/triggerRelease, and the worklet keyed the player on message arrival, so a main-thread stall delivered
 * pattern rows late and bunched. The synth must send the time (also through the retry of an attack that arrived before
 * the player existed) and the real worklet must hold the note until the host frame it is due, rendering the block in
 * segments so it keys at that frame.
 *
 * The worklet runs as the real public/hively/Hively.worklet.js in a stand-in AudioWorkletGlobalScope (its import of the
 * shared queue is inlined) with a recording stand-in for the WASM exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';

const testEngine = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../HivelyEngine', () => ({
  HivelyEngine: { getInstance: () => testEngine.current },
}));
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
  }),
  noteToMidi: (n: string) => (n === 'C4' ? 60 : 36),
}));

import { HivelySynth } from '../HivelySynth';
import type { HivelyConfig } from '@/types/instrument';

const ROOT = resolve(__dirname, '../../../..');
const RATE = 48000;
const BLOCK = 128;

type Proc = {
  port: { onmessage: ((e: { data: unknown }) => unknown) | null };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
  [k: string]: unknown;
};
type Keyed = { ev: string; handle: number; at: number };

const config = {
  volume: 64, filterSpeed: 0, waveLength: 0,
  envelope: { aFrames: 1, aVolume: 64, dFrames: 1, dVolume: 64, sFrames: 1, rFrames: 1, rVolume: 0 },
  filterLowerLimit: 0, vibratoDelay: 0, hardCutRelease: false, hardCutReleaseFrames: 0,
  vibratoDepth: 0, vibratoSpeed: 0, squareLowerLimit: 0, squareUpperLimit: 0, squareSpeed: 0,
  filterUpperLimit: 0,
  performanceList: { speed: 0, entries: [] },
} as unknown as HivelyConfig;

const g = globalThis as Record<string, unknown>;
let now = 0;
beforeEach(() => {
  now = 0;
  Object.defineProperty(g, 'currentTime', { get: () => now, configurable: true });
  g.sampleRate = RATE;
});
afterEach(() => {
  delete g.currentTime;
  delete g.sampleRate;
});

function wired() {
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, 'public/hively/Hively.worklet.js'), 'utf8'), 'hively');
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor();
  const keyed: Keyed[] = [];
  let rendered = 0;
  proc.initialized = true;
  proc.playerOutPtrs = { 0: { l: 0, r: BLOCK * 4 } };
  proc.wasm = {
    HEAPF32: new Float32Array(BLOCK * 2),
    // Player set-up the synth posts before its first note (createPlayer, setInstrument).
    HEAPU8: new Uint8Array(1 << 16),
    _malloc: () => 16,
    _free: () => {},
    _hively_create_player: () => 0,
    _hively_destroy_player: () => {},
    _hively_player_set_instrument: () => {},
    _hively_player_note_on: (handle: number) => { keyed.push({ ev: 'on', handle, at: now + rendered / RATE }); },
    _hively_player_note_off: (handle: number) => { keyed.push({ ev: 'off', handle, at: now + rendered / RATE }); },
    _hively_player_render: (_h: number, _l: number, _r: number, n: number) => { rendered += n; return n; },
  };
  const origProcess = proc.process.bind(proc);
  proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };

  // The engine without its AudioWorkletNode: posted messages go to the real worklet message handler.
  const engine = {
    output: { connect: vi.fn() },
    instrumentOutput: { connect: vi.fn(), disconnect: vi.fn() },
    ready: vi.fn(async () => {}),
    sendMessage: (m: object) => { proc.port.onmessage?.({ data: m }); },
    waitForPlayerHandle: vi.fn(async () => 0),
    play: vi.fn(),
    stop: vi.fn(),
  };
  testEngine.current = engine;
  return { proc, keyed, engine };
}

function renderBlocks(proc: Proc, seconds: number) {
  const blocks = Math.ceil((seconds * RATE) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    const outs = Array.from({ length: 38 }, () => [new Float32Array(BLOCK), new Float32Array(BLOCK)]);
    proc.process([], outs);
    now += BLOCK / RATE;
  }
}

async function readySynth() {
  const synth = new HivelySynth();
  await synth.setInstrument(config);
  return synth;
}

describe('note scheduled ahead keeps its time on Hively', () => {
  it('rows delivered together as one burst key at their own frames', async () => {
    const { proc, keyed } = wired();
    const synth = await readySynth();
    renderBlocks(proc, 0.01);
    const t0 = now;
    synth.triggerAttack('C4', t0 + 0.05, 0.8);
    synth.triggerRelease('C4', t0 + 0.17);
    expect(keyed).toEqual([]);
    renderBlocks(proc, 0.3);
    expect(keyed.map((k) => k.ev)).toEqual(['on', 'off']);
    expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
    expect(Math.abs(keyed[1].at - (t0 + 0.17))).toBeLessThanOrEqual(1 / RATE);
  });

  it('a note with no time, a past time or an unusable time keys at once', async () => {
    const { proc, keyed } = wired();
    const synth = await readySynth();
    renderBlocks(proc, 0.01);
    synth.triggerAttack('C4', undefined, 0.8);
    synth.triggerAttack('C4', now - 0.02, 0.8);
    synth.triggerAttack('C4', NaN, 0.8);
    expect(keyed).toHaveLength(3);
  });

  it('an attack that arrived before the player existed keeps its time through the retry', async () => {
    const { proc, keyed, engine } = wired();
    let resolveHandle!: (h: number) => void;
    engine.waitForPlayerHandle = vi.fn(() => new Promise<number>((r) => { resolveHandle = r; }));
    const synth = new HivelySynth();
    void synth.setInstrument(config);
    await Promise.resolve();
    renderBlocks(proc, 0.01);
    const t0 = now;
    synth.triggerAttack('C4', t0 + 0.05, 0.8);
    resolveHandle(0);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(keyed).toEqual([]);
    renderBlocks(proc, 0.2);
    expect(keyed.map((k) => k.ev)).toEqual(['on']);
    expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
  });

  it('a retried attack whose time already passed plays at once', async () => {
    const { proc, keyed, engine } = wired();
    let resolveHandle!: (h: number) => void;
    engine.waitForPlayerHandle = vi.fn(() => new Promise<number>((r) => { resolveHandle = r; }));
    const synth = new HivelySynth();
    void synth.setInstrument(config);
    await Promise.resolve();
    renderBlocks(proc, 0.01);
    synth.triggerAttack('C4', now + 0.01, 0.8);
    renderBlocks(proc, 0.05);
    resolveHandle(0);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(keyed).toHaveLength(1);
  });

  it('releaseAll cancels the rows already sent for later', async () => {
    const { proc, keyed } = wired();
    const synth = await readySynth();
    renderBlocks(proc, 0.01);
    synth.triggerAttack('C4', now + 0.1, 0.8);
    synth.releaseAll();
    renderBlocks(proc, 0.2);
    expect(keyed.map((k) => k.ev)).toEqual(['off']);
  });
});
