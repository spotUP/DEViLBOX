/**
 * A note scheduled ahead keeps its time on the MAME chip synths (D50, VFX, MAMESynth). They dropped the `time`
 * argument and wrote chip registers on arrival, and D50/VFX triggerAttackRelease released with setTimeout, so a
 * main-thread stall delivered pattern rows late and bunched (flam). The real MAMEEngine render loop runs against a
 * recording stand-in for the WASM module: each register write is stamped with the frame the render had reached.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let ctxNow = 0;
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ get currentTime() { return ctxNow; } }),
  noteToMidi: (n: string) => (n === 'C4' ? 60 : 62),
  noteToFrequency: (n: string) => (n === 'C4' ? 261.63 : 293.66),
  timeToSeconds: (n: string) => Number(n),
}));
import { MAMEEngine } from '@/engine/MAMEEngine';
import { D50Synth } from '@/engine/d50/D50Synth';
import { VFXSynth } from '@/engine/vfx/VFXSynth';
import { MAMESynth } from '@/engine/MAMESynth';

const RATE = 48000;
const BLOCK = 512;
const HANDLE = 7;

type Write = { offset: number; value: number; at: number };
let writes: Write[];
let rendered: number;
let blockStart: number;

function wiredEngine(): MAMEEngine {
  const engine = MAMEEngine.getInstance();
  const mem = new ArrayBuffer(1 << 16);
  writes = [];
  const e = engine as unknown as Record<string, unknown>;
  e.isInitialized = true;
  e.timed = new Map();
  e.module = {
    wasmMemory: { buffer: mem },
    _malloc: () => 0,
    _free: () => {},
    _mame_write: (_h: number, offset: number, value: number) => writes.push({ offset, value, at: blockStart + rendered / RATE }),
    _mame_write16: (_h: number, offset: number, value: number) => writes.push({ offset, value, at: blockStart + rendered / RATE }),
    _mame_render: (_h: number, _l: number, _r: number, n: number) => { rendered += n; },
    _mame_delete_instance: () => {},
  };
  return engine;
}

/** Run the audio callback block by block, as the ScriptProcessorNode would. */
function run(engine: MAMEEngine, seconds: number) {
  for (let b = 0; b < Math.ceil((seconds * RATE) / BLOCK); b++) {
    blockStart = ctxNow;
    rendered = 0;
    engine.render(HANDLE, BLOCK, blockStart, RATE);
    ctxNow += BLOCK / RATE;
  }
}

function wiredD50(engine: MAMEEngine) {
  const synth = Object.create(D50Synth.prototype);
  Object.assign(synth, {
    mameEngine: engine, handle: HANDLE, isInitialized: true, romLoaded: true, audioContext: { get currentTime() { return ctxNow; } },
    voices: Array.from({ length: 4 }, () => ({ note: 0, velocity: 0, active: false, partialMask: 0 })),
  });
  return synth as D50Synth;
}

function wiredVfx(engine: MAMEEngine) {
  const synth = Object.create(VFXSynth.prototype);
  Object.assign(synth, {
    mameEngine: engine, handle: HANDLE, isInitialized: true, audioContext: { get currentTime() { return ctxNow; } },
    voices: Array.from({ length: 4 }, () => ({ note: 0, velocity: 0, active: false })),
  });
  return synth as VFXSynth;
}

function wiredMameSynth(engine: MAMEEngine) {
  const synth = Object.create(MAMESynth.prototype);
  Object.assign(synth, {
    engine, handle: HANDLE, isInitialized: true, config: { type: 'doc' },
    voices: Array.from({ length: 4 }, (_v, i) => ({ voiceIndex: i, note: '', active: false, startTime: 0 })),
  });
  return synth as MAMESynth;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1 / RATE;

beforeEach(() => { ctxNow = 0; });

for (const [name, wire] of [['D50', wiredD50], ['VFX', wiredVfx], ['MAMESynth', wiredMameSynth]] as const) {
  describe(`note scheduled ahead keeps its time on ${name}`, () => {
    it('a note with a future time writes the chip at that frame, not on arrival', () => {
      const engine = wiredEngine();
      const synth = wire(engine) as unknown as { triggerAttack(n: string, t?: number, v?: number): void };
      run(engine, 0.01);
      const t0 = ctxNow;
      synth.triggerAttack('C4', t0 + 0.05, 0.8);
      expect(writes).toEqual([]);
      run(engine, 0.1);
      expect(writes.length).toBeGreaterThan(0);
      expect(writes.every((w) => near(w.at, t0 + 0.05))).toBe(true);
    });

    it('a note with no time, a past time or an unusable time writes at once', () => {
      const engine = wiredEngine();
      const synth = wire(engine) as unknown as { triggerAttack(n: string, t?: number, v?: number): void };
      run(engine, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      const first = writes.length;
      expect(first).toBeGreaterThan(0);
      synth.triggerAttack('D4', ctxNow - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(writes.length).toBeGreaterThan(first * 2);
    });

    it('releaseAll on song stop drops notes still queued ahead, so none starts after the stop', () => {
      const engine = wiredEngine();
      const synth = wire(engine) as unknown as { triggerAttack(n: string, t?: number, v?: number): void; releaseAll(): void };
      run(engine, 0.01);
      const t0 = ctxNow;
      synth.triggerAttack('C4', t0 + 0.05, 0.8);
      synth.releaseAll();
      run(engine, 0.1);
      expect(writes.some((w) => near(w.at, t0 + 0.05))).toBe(false);
    });
  });
}

for (const [name, wire] of [['D50', wiredD50], ['VFX', wiredVfx]] as const) {
  describe(`triggerAttackRelease on ${name} releases at time plus duration`, () => {
    it('queues the release with the attack, with no timer', () => {
      const engine = wiredEngine();
      const synth = wire(engine);
      const timer = vi.spyOn(globalThis, 'setTimeout');
      run(engine, 0.01);
      const t0 = ctxNow;
      synth.triggerAttackRelease('C4', 0.1, t0 + 0.05, 0.8);
      expect(timer).not.toHaveBeenCalled();
      timer.mockRestore();
      run(engine, 0.3);
      const attackEnd = writes.reduce((last, w, i) => (near(w.at, t0 + 0.05) ? i : last), -1);
      const release = writes.slice(attackEnd + 1);
      expect(release.length).toBeGreaterThan(0);
      expect(release.every((w) => near(w.at, t0 + 0.15))).toBe(true);
    });
  });
}
