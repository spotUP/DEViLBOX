/**
 * A key-locked audio deck sounds ~91 ms after it plays (SoundTouch's WSOLA
 * window; field measurement 103 vs 12 ms, thoughts/lars/todos.md:166). The
 * heard position subtracted only the output latency, so a phase lock against
 * a key-locked deck was 91 ms off - double kicks in a mix (plan
 * 2026-10-11-dj-juggling C10).
 *
 * The worklet reports its latency; DeckKeyLock.latencySec() hands it on while
 * the signal runs through the worklet; DeckEngine.getHeardPosition subtracts
 * it; phase correction (DJAutoSync) locks on that heard position. Real
 * DeckKeyLock / DeckEngine methods on stand-in objects (no AudioContext).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ decks: {} as Record<string, unknown>, bends: [] as Array<{ deck: string; ratio: number; ms: number }> }));

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0, outputLatency: 0.012 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => {
  const engine = { getDeck: (id: string) => h.decks[id] };
  return { getDJEngine: () => engine, getDJEngineIfActive: () => engine };
});

import { DeckEngine } from '../DeckEngine';
import { DeckKeyLock } from '../DeckKeyLock';
import { phaseAlign } from '../DJAutoSync';
import { useDJStore } from '@/stores/useDJStore';

const OUTPUT_LATENCY = 0.012;
const KEY_LOCK_LATENCY = 0.0917; // what the worklet reports at 0 semitones, 48 kHz (DeckKeyLockWASM.cpp probe)

function keyLock(routed: boolean): DeckKeyLock {
  const k = Object.assign(Object.create(DeckKeyLock.prototype), {
    routedThroughWorklet: routed, reportedLatencySec: 0, isActive: routed, isWasmReady: true, workletNode: null, pendingPitchSemis: 0,
  }) as DeckKeyLock;
  (k as unknown as { _onWorkletMessage(d: unknown): void })._onWorkletMessage({ type: 'latency', seconds: KEY_LOCK_LATENCY });
  return k;
}

function audioDeck(id: 'A' | 'B', position: number, lock: DeckKeyLock): DeckEngine {
  const player = { getPosition: () => position, getPlaybackRate: () => 1 };
  return Object.assign(Object.create(DeckEngine.prototype), {
    id, _playbackMode: 'audio', _stemMode: false, audioPlayer: player, stemPlayer: player, keyLock: lock,
    isPlaying: () => true,
    bendRate: (ratio: number, ms: number) => { h.bends.push({ deck: id, ratio, ms }); },
  }) as DeckEngine;
}

const BPM = 120;
const grid = () => {
  const beats = Array.from({ length: 400 }, (_, i) => i * 0.5);
  return { beats, downbeats: beats.filter((_, i) => i % 4 === 0), bpm: BPM, timeSignature: 4 };
};

describe('a key-locked deck is heard later by its processing latency', () => {
  beforeEach(() => {
    h.bends.length = 0;
    for (const id of ['A', 'B'] as const) {
      useDJStore.getState().setDeckState(id, { isPlaying: true, durationMs: 200_000, pitchOffset: 0, beatGrid: grid() });
    }
  });

  it('latencySec is the worklet-reported latency while the signal runs through it, 0 on the bypass wire', () => {
    expect(keyLock(true).latencySec()).toBeCloseTo(KEY_LOCK_LATENCY, 9);
    expect(keyLock(false).latencySec()).toBe(0);
  });

  it('the heard position of a key-locked deck is the played position minus output and key-lock latency', () => {
    expect(audioDeck('A', 30, keyLock(true)).getHeardPosition()).toBeCloseTo(30 - OUTPUT_LATENCY - KEY_LOCK_LATENCY, 9);
    expect(audioDeck('A', 30, keyLock(false)).getHeardPosition()).toBeCloseTo(30 - OUTPUT_LATENCY, 9);
  });

  it('phase correction locks what the listener hears: a key-locked deck played on the grid is pushed ahead by its latency', () => {
    // Both decks have PLAYED exactly to the same beat; B is key-locked and so sounds 91.7 ms later.
    h.decks.A = audioDeck('A', 40, keyLock(false));
    h.decks.B = audioDeck('B', 40, keyLock(true));
    phaseAlign('B', 'A', 'beat');
    expect(h.bends.length, 'no bend: the phase lock did not see the key-lock latency').toBe(1);
    const { ratio, ms } = h.bends[0];
    expect(ratio).toBeGreaterThan(1);
    // Track seconds gained by the bend = (ratio - 1) * duration: the key-lock latency.
    expect((ratio - 1) * (ms / 1000)).toBeCloseTo(KEY_LOCK_LATENCY, 6);
  });

  it('two decks without key lock on the same beat are left alone', () => {
    h.decks.A = audioDeck('A', 40, keyLock(false));
    h.decks.B = audioDeck('B', 40, keyLock(false));
    phaseAlign('B', 'A', 'beat');
    expect(h.bends).toEqual([]);
  });
});
