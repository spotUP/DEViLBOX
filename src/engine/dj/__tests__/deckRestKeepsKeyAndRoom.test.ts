/**
 * PITCH-EQ-TEMPO and SA-m2 (scratch audit, thoughts/shared/research/2026-10-12_scratch-work-audit.md).
 *
 * - The deck's decay to rest (jog release, pattern stop) and its hard reset set a tracker's pitch
 *   to the tempo multiplier, dropping key lock. They now go through the one rest-rate path.
 * - The deck's own scratch reverb used createReverbIR(ctx, 0.6, 4000): a 0.25 ms noise burst.
 *   It now uses the scratch bus's room.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DeckEngine } from '../DeckEngine';
import { createScratchRoomIR, SCRATCH_BUS } from '../scratch/scratchBus';

interface St { tempo: number; pitch: number; rest: number; keyLock: boolean }

function deckOver(st: St): DeckEngine {
  const e = Object.create(DeckEngine.prototype) as Record<string, unknown>;
  e._playbackMode = 'tracker';
  e.decayRafId = null;
  e.replayer = {
    getTempoMultiplier: () => st.tempo, setTempoMultiplier: (r: number) => { st.tempo = r; },
    setPitchMultiplier: (r: number) => { st.pitch = r; },
  };
  Object.defineProperty(e, 'restMultiplier', { get: () => st.rest });
  Object.defineProperty(e, 'keyLockEnabled', { get: () => st.keyLock });
  return e as unknown as DeckEngine;
}

describe('deck decay to rest keeps the key (Key Lock on, pitch fader up)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function decay(st: St) {
    let now = 0;
    const q: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => { q.push(f); return q.length; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const deck = deckOver(st);
    (deck as unknown as { _decayToRest(ms: number): void })._decayToRest(200);
    const seenPitch: number[] = [];
    for (let i = 0; i < 20 && q.length; i++) { now += 20; q.shift()!(); seenPitch.push(st.pitch); }
    return seenPitch;
  }

  it('leaves the tracker pitch at 1 while the tempo returns to the fader rate', () => {
    const st: St = { tempo: 0.3, pitch: 1, rest: 1.08, keyLock: true };
    const pitches = decay(st);
    expect(st.tempo).toBeCloseTo(1.08, 5);
    expect(pitches.every((p) => p === 1)).toBe(true);
  });

  it('without key lock the pitch still follows the rate', () => {
    const st: St = { tempo: 0.3, pitch: 0.3, rest: 1.08, keyLock: false };
    decay(st);
    expect(st.pitch).toBeCloseTo(1.08, 5);
  });

  it('the already-at-rest early exit keeps the key too', () => {
    const st: St = { tempo: 1.08, pitch: 1, rest: 1.08, keyLock: true };
    decay(st);
    expect(st.pitch).toBe(1);
  });
});

describe('deck scratch reverb is the scratch bus room (SA-m2)', () => {
  it('has the bus IR length and decays over the bus time constant, not 0.25 ms', () => {
    const sr = 48000;
    const ctx = { sampleRate: sr, createBuffer: (n: number, len: number, rate: number) => {
      const d = Array.from({ length: n }, () => new Float32Array(len));
      return { length: len, sampleRate: rate, numberOfChannels: n, getChannelData: (c: number) => d[c] };
    } } as unknown as BaseAudioContext;
    const ir = createScratchRoomIR(ctx);
    expect(ir.length).toBe(Math.floor(sr * SCRATCH_BUS.reverbSec));
    const d = ir.getChannelData(0);
    const rms = (a: number, b: number) => Math.sqrt(d.slice(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
    // envelope exp(-t x 6.7): 100 ms in, still 51 % of the start; the old 4000 Hz decay was at 0.1 %
    const ratio = rms(Math.floor(0.1 * sr), Math.floor(0.11 * sr)) / rms(0, Math.floor(0.01 * sr));
    expect(ratio).toBeGreaterThan(0.4);
  });

  it('DeckEngine builds its reverb from createScratchRoomIR', async () => {
    const src = (await import('node:fs')).readFileSync('src/engine/dj/DeckEngine.ts', 'utf8');
    expect(src).toContain('createScratchRoomIR(ctx)');
    expect(src).not.toMatch(/createReverbIR\(ctx, 0\.6, 4000\)/);
  });
});
