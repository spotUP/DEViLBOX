/**
 * Auto DJ's tempo sync wrote only the store's pitch, so the incoming deck's
 * playback rate never changed: the pitch readout showed a matched tempo while
 * the audio ran at the track's own (found reading the code 2026-10-08). The
 * audio engine changes only through the pitch action. Drives the real
 * beatMatchedTransition (what Auto DJ starts for a crossfade) against a fake
 * deck engine that records setPitch, the call that sets the playback rate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const engine = vi.hoisted(() => ({
  pitchCalls: [] as Array<{ deck: string; semitones: number }>,
}));

vi.mock('@/engine/dj/DJEngine', () => {
  const deck = (id: string) => ({
    setPitch: (semitones: number) => { engine.pitchCalls.push({ deck: id, semitones }); },
    play: vi.fn(async () => {}),
    stop: vi.fn(),
    setFilterPosition: vi.fn(),
    getAudioPosition: () => 10,
    seek: vi.fn(),
  });
  const decks: Record<string, ReturnType<typeof deck>> = { A: deck('A'), B: deck('B'), C: deck('C') };
  return { getDJEngine: () => ({ getDeck: (id: string) => decks[id], setCrossfader: vi.fn() }), getDJEngineIfActive: () => null };
});

import { useDJStore } from '@/stores/useDJStore';
import { beatMatchedTransition } from '../DJQuantizedFX';

const grid = (bpm: number) => ({ beats: [0, 60 / bpm], downbeats: [0], bpm, timeSignature: 4 });

describe('Auto DJ tempo sync reaches the audio engine', () => {
  beforeEach(() => {
    engine.pitchCalls.length = 0;
    useDJStore.getState().setDeckState('A', { beatGrid: grid(120), detectedBPM: 120, effectiveBPM: 120, isPlaying: true });
    useDJStore.getState().setDeckState('B', { beatGrid: grid(128), detectedBPM: 128, effectiveBPM: 128, isPlaying: false });
    useDJStore.getState().setDeckPitch('B', 0);
  });

  it('a crossfade into a faster track changes the incoming deck playback rate, not just the readout', async () => {
    const cancel = beatMatchedTransition('A', 'B', 8, false);
    cancel();
    const expected = 12 * Math.log2(120 / 128);
    const call = engine.pitchCalls.find((c) => c.deck === 'B');
    expect(call).toBeDefined();
    expect(call!.semitones).toBeCloseTo(expected, 6);
    // the pitch action writes the store on the next animation frame
    await vi.waitFor(() => expect(useDJStore.getState().decks.B.pitchOffset).toBeCloseTo(expected, 6));
  });

  it('a pitch beyond the Auto DJ limit still reaches the engine clamped', () => {
    useDJStore.getState().setDeckState('B', { beatGrid: grid(160), detectedBPM: 160, effectiveBPM: 160 });
    const cancel = beatMatchedTransition('A', 'B', 8, false);
    cancel();
    const call = engine.pitchCalls.find((c) => c.deck === 'B');
    expect(call!.semitones).toBeCloseTo(-4, 6);
  });
});
