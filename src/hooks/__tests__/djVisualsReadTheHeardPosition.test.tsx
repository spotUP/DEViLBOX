/**
 * DJ3 reachability: the DJ store's deck position - the one field every DJ
 * visual reads (waveform playhead, beat grid, overview, turntable, pattern
 * lights through the time index) - is written by useDeckStateSync from the
 * deck's HEARD position, not from the player's rendered position. With a
 * known output latency the store shows audio position minus latency at the
 * current rate, at 0 and +-8 % pitch; in tracker mode the row comes from the
 * replayer's display ring (heard times), not the scheduler's counters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { heardPositionSec, outputLatencySec } from '@/engine/audioLatency';

const LATENCY = 0.0333;

const deck = vi.hoisted(() => ({
  playbackMode: 'audio' as 'audio' | 'tracker',
  position: 30,
  rate: 1,
  ringRow: null as { position: number; row: number; elapsedMs: number | null } | null,
  heardCalls: 0,
  heardTrackerCalls: 0,
  playing: true,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({
    getDeck: () => ({
      playbackMode: deck.playbackMode,
      isScratchActive: false,
      audioPlayer: {
        isCurrentlyPlaying: () => deck.playing,
        getPosition: () => deck.position,
        getPlaybackRate: () => deck.rate,
        getDuration: () => 300,
      },
      // What DeckEngine.getHeardPosition does, with a known latency.
      getHeardPosition: () => { deck.heardCalls++; return heardPositionSec(deck.position, deck.rate, outputLatencySec({ outputLatency: LATENCY })); },
      getHeardTrackerState: () => { deck.heardTrackerCalls++; return deck.ringRow ? { songPos: deck.ringRow.position, pattPos: deck.ringRow.row, elapsedMs: deck.ringRow.elapsedMs } : null; },
      getPositionAtTime: () => null,
      isPatternActive: () => false,
      getScratchState: () => ({ velocity: 0, faderGain: 1 }),
      notifyBPMChange: () => {},
      replayer: { isPlaying: () => deck.playing, getSongPos: () => 7, getPattPos: () => 40, getElapsedMs: () => 12_345, getBPM: () => 125, getTempoMultiplier: () => 1 },
    }),
  }),
}));

import { useDeckStateSync } from '../dj/useDeckStateSync';
import { useDJStore } from '@/stores/useDJStore';

async function poll(frames = 6): Promise<void> {
  // The hook throttles to one store write per 50 ms of rAF frames.
  for (let i = 0; i < frames; i++) await vi.advanceTimersByTimeAsync(20);
}

describe('DJ visuals read the heard position', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    deck.playbackMode = 'audio'; deck.position = 30; deck.rate = 1; deck.ringRow = null; deck.heardCalls = 0; deck.heardTrackerCalls = 0; deck.playing = true;
    useDJStore.getState().setDeckState('A', { isPlaying: true, playbackMode: 'audio', audioPosition: 0, elapsedMs: 0, songPos: 0, pattPos: 0 });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('audio mode: the store position is the audio position minus the output latency at the rate, at 0 and +-8 % pitch', async () => {
    renderHook(() => useDeckStateSync('A'));
    for (const rate of [1, 1.08, 0.92]) {
      deck.rate = rate;
      deck.position = 30 + rate;
      await poll();
      const expected = 30 + rate - LATENCY * rate;
      expect(useDJStore.getState().decks.A.audioPosition, `rate ${rate}`).toBeCloseTo(expected, 6);
      expect(useDJStore.getState().decks.A.elapsedMs, `rate ${rate}`).toBeCloseTo(expected * 1000, 3);
    }
    // The hook reached the deck's heard position, never the raw player position.
    expect(deck.heardCalls).toBeGreaterThanOrEqual(3);
    expect(useDJStore.getState().decks.A.audioPosition).not.toBe(deck.position);
  });

  it('tracker mode: the store row is the heard row from the display ring, not the scheduler counters', async () => {
    deck.playbackMode = 'tracker';
    deck.ringRow = { position: 6, row: 32, elapsedMs: 11_900 };
    useDJStore.getState().setDeckState('A', { playbackMode: 'tracker' });
    renderHook(() => useDeckStateSync('A'));
    await poll();
    const d = useDJStore.getState().decks.A;
    expect(deck.heardTrackerCalls).toBeGreaterThanOrEqual(1);
    expect([d.songPos, d.pattPos]).toEqual([6, 32]);
    expect(d.elapsedMs).toBe(11_900);
    // Nothing heard yet (ring empty): the scheduler counters remain the fallback.
    deck.ringRow = null;
    await poll();
    expect([useDJStore.getState().decks.A.songPos, useDJStore.getState().decks.A.pattPos]).toEqual([7, 40]);
  });
});
