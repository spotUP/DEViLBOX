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
import { createScratchRoomIR } from '../scratch/scratchBus';
import { SCRATCH_ROOM } from '../scratch/scratchRoom';

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
    expect(ir.length).toBe(Math.round(sr * SCRATCH_ROOM.seconds));
    const d = ir.getChannelData(0);
    // the reference room's decay (RT60 0.33 s from its Schroeder backward integration), not 0.25 ms
    const e = new Float64Array(d.length);
    let acc = 0;
    for (let i = d.length - 1; i >= 0; i--) { acc += d[i]! * d[i]!; e[i] = acc; }
    const at = (db: number) => e.findIndex((v) => 10 * Math.log10(v / e[0]!) <= db);
    const rt60 = 3 * (at(-25) - at(-5)) / sr;
    expect(rt60).toBeGreaterThan(0.25);
    expect(rt60).toBeLessThan(0.45);
  });

  it('DeckEngine sends its scratch into the scratch bus (wet part), whose room is createScratchRoomIR', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/engine/dj/DeckEngine.ts', 'utf8');
    expect(src).toContain('createScratchBus(ctx, limiter, { wetOnly: true })');
    expect(fs.readFileSync('src/engine/dj/scratch/scratchBus.ts', 'utf8')).toContain('opts.reverbIR ?? createScratchRoomIR(ctx)');
    expect(src).not.toMatch(/createReverbIR\(ctx, 0\.6, 4000\)/);
  });
});
