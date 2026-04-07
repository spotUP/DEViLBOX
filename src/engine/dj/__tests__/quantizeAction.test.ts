import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDJStore } from '@/stores/useDJStore';
import { snapPositionToBeat, snapLoopLength } from '../DJAutoSync';
import { quantizeAction, setQuantizeMode } from '../DJQuantizedFX';
import type { BeatGridData } from '../DJAudioCache';

// Build a 120 BPM beat grid: beats every 0.5s, downbeats every 2.0s, 4/4 time.
const grid120bpm: BeatGridData = {
  bpm: 120,
  beats: Array.from({ length: 200 }, (_, i) => i * 0.5),       // 0, 0.5, 1.0, ...
  downbeats: Array.from({ length: 50 }, (_, i) => i * 2.0),    // 0, 2.0, 4.0, ...
  timeSignature: 4,
};

beforeEach(() => {
  // Reset DJ state — clear playing flags, beat grids, pending actions on both decks.
  const store = useDJStore.getState();
  for (const id of ['A', 'B', 'C'] as const) {
    store.setDeckState(id, {
      isPlaying: false,
      beatGrid: null,
      audioPosition: 0,
      elapsedMs: 0,
      playbackMode: 'audio',
      durationMs: 100_000,
      pendingAction: null,
    });
  }
  setQuantizeMode('beat');
});

afterEach(() => {
  vi.useRealTimers();
});

// ── snapLoopLength ──────────────────────────────────────────────────────────

describe('snapLoopLength', () => {
  it('snaps to nearest power-of-2 beat count', () => {
    expect(snapLoopLength(0.3)).toBe(0.25);
    expect(snapLoopLength(0.4)).toBe(0.5);
    expect(snapLoopLength(1.7)).toBe(2);
    expect(snapLoopLength(3)).toBe(2); // 3 is closer to 2 than to 4
    expect(snapLoopLength(3.5)).toBe(4);
    expect(snapLoopLength(12)).toBe(8);  // tie at distance 4 — implementation keeps the first match (8)
    expect(snapLoopLength(20)).toBe(16); // clamp
  });

  it('returns smallest length for non-positive input', () => {
    expect(snapLoopLength(0)).toBe(0.25);
    expect(snapLoopLength(-1)).toBe(0.25);
    expect(snapLoopLength(NaN)).toBe(0.25);
  });
});

// ── snapPositionToBeat ──────────────────────────────────────────────────────

describe('snapPositionToBeat', () => {
  beforeEach(() => {
    useDJStore.getState().setDeckState('A', { beatGrid: grid120bpm });
  });

  it('snaps to nearest beat (mode = beat)', () => {
    expect(snapPositionToBeat('A', 0.1, 'beat')).toBe(0);   // closer to 0
    expect(snapPositionToBeat('A', 0.3, 'beat')).toBe(0.5); // closer to 0.5
    expect(snapPositionToBeat('A', 1.74, 'beat')).toBe(1.5);
    expect(snapPositionToBeat('A', 1.76, 'beat')).toBe(2);
  });

  it('snaps to nearest downbeat (mode = bar)', () => {
    expect(snapPositionToBeat('A', 0.5, 'bar')).toBe(0);
    expect(snapPositionToBeat('A', 1.1, 'bar')).toBe(2.0);
    expect(snapPositionToBeat('A', 3.4, 'bar')).toBe(4.0);
  });

  it('passes through unchanged when no beat grid', () => {
    useDJStore.getState().setDeckState('A', { beatGrid: null });
    expect(snapPositionToBeat('A', 1.234, 'beat')).toBe(1.234);
  });
});

// ── quantizeAction ──────────────────────────────────────────────────────────

describe('quantizeAction', () => {
  it('fires immediately when quantize mode is off', () => {
    setQuantizeMode('off');
    useDJStore.getState().setDeckState('A', { beatGrid: grid120bpm });

    const fn = vi.fn();
    quantizeAction('A', fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires immediately when no usable beat grid is available', () => {
    setQuantizeMode('beat');
    // No grid on A or B, B not playing
    const fn = vi.fn();
    quantizeAction('A', fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses THIS deck grid in solo mode (other deck silent) and waits for next beat', () => {
    vi.useFakeTimers();
    setQuantizeMode('beat');
    useDJStore.getState().setDeckState('A', {
      beatGrid: grid120bpm,
      audioPosition: 0.1, // 0.4s until next beat at 0.5
      playbackMode: 'audio',
    });

    const fn = vi.fn();
    quantizeAction('A', fn, { allowSolo: true });
    expect(fn).not.toHaveBeenCalled();

    // Pending action set
    expect(useDJStore.getState().decks['A'].pendingAction?.kind).toBe('play');

    vi.advanceTimersByTime(450); // 0.4s + jitter guard
    expect(fn).toHaveBeenCalledTimes(1);
    expect(useDJStore.getState().decks['A'].pendingAction).toBeNull();
  });

  it('locks to OTHER (master) deck grid when it is playing', () => {
    vi.useFakeTimers();
    setQuantizeMode('bar');
    // B is the master at 1.3s into the song → next bar at 2.0s → 0.7s away
    useDJStore.getState().setDeckState('B', {
      beatGrid: grid120bpm,
      isPlaying: true,
      audioPosition: 1.3,
      playbackMode: 'audio',
    });
    useDJStore.getState().setDeckState('A', {
      beatGrid: grid120bpm,
      audioPosition: 0,
      playbackMode: 'audio',
    });

    const fn = vi.fn();
    quantizeAction('A', fn, { kind: 'cue' });
    expect(fn).not.toHaveBeenCalled();
    expect(useDJStore.getState().decks['A'].pendingAction?.kind).toBe('cue');

    vi.advanceTimersByTime(750); // ~0.7s
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel function clears the timer and pending state', () => {
    vi.useFakeTimers();
    setQuantizeMode('bar');
    useDJStore.getState().setDeckState('B', {
      beatGrid: grid120bpm,
      isPlaying: true,
      audioPosition: 1.3,
      playbackMode: 'audio',
    });

    const fn = vi.fn();
    const cancel = quantizeAction('A', fn);
    expect(useDJStore.getState().decks['A'].pendingAction).not.toBeNull();

    cancel();
    expect(useDJStore.getState().decks['A'].pendingAction).toBeNull();

    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('falls back to next boundary when within 50ms jitter window', () => {
    vi.useFakeTimers();
    setQuantizeMode('beat');
    // 0.49s → next beat at 0.5 is only 10ms away → bumps to 1.0 (510ms total)
    useDJStore.getState().setDeckState('A', {
      beatGrid: grid120bpm,
      audioPosition: 0.49,
      playbackMode: 'audio',
    });

    const fn = vi.fn();
    quantizeAction('A', fn, { allowSolo: true });

    // Should NOT fire at the original 10ms — it bumped to next beat
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
