/**
 * X7 (owner decision 2026-10-13): a module deck - tracker playback, no buffer of its own - is read from its audio as
 * the DJ pipeline rendered it ahead (the render cached under its file name), so a planned three-deck routine's
 * duck and level (three_deck.render: lp(|beat|, 40) / max, depth .25; 0.60 x rms) apply to it exactly as to a deck
 * with a buffer. Before, the deck had no audio to read and the routine got no duck at all.
 *
 * Reachability: the Auto DJ's `shapeRoutine` dependency calls `scratchShapeDecks` (live engine + store) and hands
 * its decks to the pool's `shapeRoutinePlan`. Sentinel: `autoScratchRuntimeStats.moduleRenders` (one decode per
 * file, however many routines).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';

const RATE = 22050;
const holder = vi.hoisted(() => ({ engine: null as unknown, reads: [] as string[], wav: null as ArrayBuffer | null }));
vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => holder.engine, getDJEngineIfActive: () => holder.engine }));
vi.mock('@/engine/dj/DJAudioCache', async (orig) => ({
  ...(await orig<typeof import('@/engine/dj/DJAudioCache')>()),
  getCachedAudioByFilename: async (f: string) => { holder.reads.push(f); return f === 'tune.mod' && holder.wav ? { audioData: holder.wav } : null; },
}));

/** A 16-bit mono WAV at 22,050 Hz: a kick-like burst every 0.5 s. */
function wavOf(seconds: number): { bytes: ArrayBuffer; pcm: Float32Array } {
  const n = Math.trunc(seconds * RATE);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) { const ph = (i % (RATE / 2)) / RATE; pcm[i] = Math.round(0.8 * Math.exp(-ph * 30) * Math.sin(2 * Math.PI * 60 * ph) * 32767) / 32768; }
  const buf = new ArrayBuffer(44 + 2 * n);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + 2 * n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, 2 * n, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + 2 * i, Math.round(pcm[i]! * 32768), true);
  return { bytes: buf, pcm };
}

describe('a module deck is read from its rendered-ahead audio for the routine duck (X7)', () => {
  beforeAll(() => { installRealWebAudio(); });

  it('the routine shape reads the module deck from its render, at the row it is heard, and decodes it once', async () => {
    const { useDJStore } = await import('@/stores/useDJStore');
    const { scratchShapeDecks, autoScratchRuntimeStats } = await import('@/engine/dj/scratch/autoScratchRuntime');
    const { programmeSpan, deckCDuck } = await import('@/engine/dj/scratch/scratchDeckC');
    const Tone = await import('tone');
    const ctx = Tone.getContext().rawContext as BaseAudioContext;
    const render = wavOf(40);
    holder.wav = render.bytes;
    const own = ctx.createBuffer(1, RATE * 60, RATE);
    own.getChannelData(0).fill(0.05);
    holder.engine = {
      getDeck: (d: 'A' | 'B') => d === 'A'
        ? { audioPlayer: { getAudioBuffer: () => own, getPosition: () => 30, getPlaybackRate: () => 1 }, getHeardTrackerState: () => null }
        : { audioPlayer: { getAudioBuffer: () => null, getPosition: () => 0, getPlaybackRate: () => 1 }, getHeardTrackerState: () => ({ songPos: 3, pattPos: 0, elapsedMs: 12_000 }) },
    };
    useDJStore.getState().setDeckState('A', { isPlaying: true, playbackMode: 'audio', fileName: 'a.wav' });
    useDJStore.getState().setDeckState('B', { isPlaying: true, playbackMode: 'tracker', fileName: 'tune.mod', detectedBPM: 125, effectiveBPM: 125 });
    const before = autoScratchRuntimeStats.moduleRenders;
    const startSec = ctx.currentTime + 2;
    const shape = { deck: 'A' as const, startSec, trackFromSec: 32 };
    const decks = await scratchShapeDecks(shape);
    expect(decks, 'a module deck must not void the shape').not.toBeNull();
    expect(decks!.length).toBe(2);
    const b = decks![1]!;
    expect(Math.abs(b.audio.duration - render.pcm.length / RATE)).toBeLessThan(1e-3);
    // heard at 12 s, read from where it will be when the routine starts
    expect(b.trackFromSec).toBeCloseTo(12 + (startSec - ctx.currentTime), 1);
    // the duck the pool computes from A + B carries the module deck's kicks (A alone is a flat signal: no duck shape)
    const n = 4 * RATE;
    const beat = new Float64Array(n);
    for (const d of decks!) { const x = programmeSpan(d.audio, d.trackFromSec, n); for (let i = 0; i < n; i++) beat[i] = beat[i]! + d.gain * x[i]!; }
    const duck = deckCDuck(beat);
    let lo = Infinity, hi = -Infinity;
    for (let i = RATE; i < n; i++) { lo = Math.min(lo, duck[i]!); hi = Math.max(hi, duck[i]!); }
    expect(hi - lo).toBeGreaterThan(0.15);
    expect(autoScratchRuntimeStats.moduleRenders - before).toBe(1);
    await scratchShapeDecks(shape);
    expect(autoScratchRuntimeStats.moduleRenders - before).toBe(1);
  });
});
