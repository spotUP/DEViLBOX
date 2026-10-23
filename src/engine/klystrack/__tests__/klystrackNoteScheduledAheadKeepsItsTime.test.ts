/**
 * A note scheduled ahead keeps its time on the Klystrack synth. The synth dropped the `time` argument of
 * triggerAttack/triggerRelease and the worklet keyed the audition channel on message arrival, so a main-thread
 * stall delivered pattern rows late and bunched. The synth must send the time and the real worklet must hold the
 * note until the host frame it is due, and key it at that frame inside the block.
 *
 * The worklet runs as the real public/klystrack/Klystrack.worklet.js in a stand-in AudioWorkletGlobalScope (its
 * import of the shared queue is inlined) with a recording stand-in for the WASM exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({ createGain: () => ({}) }), noteToMidi: (n: string) => (n === 'C4' ? 60 : 62) }));
vi.mock('@stores/useFormatStore', () => ({ useFormatStore: {} }));
vi.mock('@/components/klystrack/klysInstrumentEdit', () => ({
  editKlysField: () => {}, isStandaloneKlysInstrument: () => false, readKlysInstrument: () => null, sendStandalone: () => {},
}));
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';
import { KlysSynth } from '@/engine/klystrack/KlysSynth';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';

const ROOT = resolve(__dirname, '../../../..');
const RATE = 48000;
const BLOCK = 128;

type Proc = {
  port: { onmessage: ((e: { data: unknown }) => unknown) | null };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
  [k: string]: unknown;
};
type Keyed = { ev: string; note?: number; at: number };

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
  const file = 'public/klystrack/Klystrack.worklet.js';
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, file), 'utf8'), 'klystrack');
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
  proc.songLoaded = true;
  // A voice is already sounding, so every segment is rendered and `rendered` counts the block's frames (an idle worklet skips silent segments)
  proc.previewing = true;
  proc.decodeCapacity = BLOCK;
  proc.wasm = {
    _klys_set_song_running: () => {},
    _klys_pause: () => {},
    _klys_preview_note_on: (_i: number, note: number) => { keyed.push({ ev: 'on', note, at: now + rendered / RATE }); return 1; },
    _klys_preview_note_off: () => { keyed.push({ ev: 'off', at: now + rendered / RATE }); },
    _klys_stop: () => {},
    // Position report the worklet posts after each block
    _klys_get_song_position: () => 0,
    _klys_get_pattern_position: () => 0,
    _klys_get_song_speed: () => 6,
    _klys_decode: (_l: number, _r: number, n: number) => { rendered += n; return n; },
    HEAPF32: new Float32Array(BLOCK),
  };
  const origProcess = proc.process.bind(proc);
  const blockFrames: number[] = [];
  proc.process = (i, o) => { rendered = 0; const r = origProcess(i, o); blockFrames.push(rendered); return r; };

  // The engine and synth without their AudioWorkletNode: posted messages go to the real worklet message handler.
  const engine = Object.create(KlysEngine.prototype) as KlysEngine;
  Object.assign(engine, { workletNode: { port: { postMessage: (m: object) => proc.port.onmessage?.({ data: m }) } } });
  const synth = Object.create(KlysSynth.prototype) as KlysSynth;
  Object.assign(synth, { engine, instrumentId: 1, _disposed: false });
  return { proc, keyed, synth, engine, blockFrames };
}

function renderBlocks(proc: Proc, seconds: number) {
  const blocks = Math.ceil((seconds * RATE) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
    now += BLOCK / RATE;
  }
}

describe('note scheduled ahead keeps its time on Klystrack', () => {
  it('two rows delivered together as one burst key at their own frames', () => {
    const { proc, keyed, synth } = wired();
    renderBlocks(proc, 0.01);
    const t0 = now;
    synth.triggerAttack(62, t0 + 0.05, 0.8);
    synth.triggerRelease(62, t0 + 0.17);
    synth.triggerAttack(60, t0 + 0.17, 0.8);
    expect(keyed).toEqual([]);
    renderBlocks(proc, 0.3);
    expect(keyed.map((k) => k.ev)).toEqual(['on', 'off', 'on']);
    expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
    expect(Math.abs(keyed[2].at - (t0 + 0.17))).toBeLessThanOrEqual(1 / RATE);
  });

  it('a note with no time, a past time or an unusable time keys at once', () => {
    const { proc, keyed, synth } = wired();
    renderBlocks(proc, 0.01);
    synth.triggerAttack(60, undefined, 0.8);
    synth.triggerAttack(62, now - 0.02, 0.8);
    synth.triggerAttack(60, NaN, 0.8);
    expect(keyed).toHaveLength(3);
  });

  it('Stop cancels the rows already sent for later', () => {
    const { proc, keyed, synth } = wired();
    renderBlocks(proc, 0.01);
    synth.triggerAttack(60, now + 0.1, 0.8);
    synth.releaseAll();
    renderBlocks(proc, 0.2);
    expect(keyed.map((k) => k.ev)).toEqual(['off']);
  });

  it('an idle worklet keys a note due mid-block at its frame and renders the frames after it', () => {
    const { proc, keyed, synth, blockFrames } = wired();
    proc.previewing = false;
    renderBlocks(proc, 0.01);
    // Nothing sounds, so the silent blocks before the note are skipped
    expect(blockFrames.every((n) => n === 0)).toBe(true);
    const t0 = now;
    // 0.05 s is 2400 frames: 18 whole blocks plus 96 frames, so the note is due mid-block
    synth.triggerAttack(62, t0 + 0.05, 0.8);
    expect(keyed).toEqual([]);
    blockFrames.length = 0;
    renderBlocks(proc, 0.1);
    expect(keyed.map((k) => k.ev)).toEqual(['on']);
    const noteBlock = Math.floor((0.05 * RATE) / BLOCK);
    // The harness stamps a key with the frames rendered so far; an idle segment renders none, so the stamp is the block start.
    // The key's frame is proven by the frames rendered after it below.
    expect(keyed[0].at).toBeCloseTo(t0 + (noteBlock * BLOCK) / RATE, 6);
    expect(blockFrames.slice(0, noteBlock).every((n) => n === 0)).toBe(true);
    expect(blockFrames[noteBlock]).toBe(BLOCK - ((0.05 * RATE) % BLOCK));
    expect(blockFrames[noteBlock + 1]).toBe(BLOCK);
  });
});
