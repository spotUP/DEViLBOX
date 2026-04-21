/**
 * Regression tests for DJ scratch action bindings in `DJActions.ts`.
 *
 * Scratch has three entry points (`startScratch` / `setScratchVelocity` /
 * `stopScratch`) that thin-wrap DeckEngine methods AND update the DJ
 * store. Last bug-fixed 2026-04-07 (direction-switch cooldown, pattern
 * state reset, gain-oscillation) but has zero automated tests on the
 * action layer — the only existing scratch tests are:
 *   - `scratchPatterns.test.ts` (pattern registry shape)
 *   - `djScratch.test.ts` (keyboard→command wiring via mocks)
 *
 * This file fills the gap on the action layer: verify that calling
 * `startScratch` / `setScratchVelocity` / `stopScratch` from any caller
 * (keyboard, MIDI, UI) produces the right store writes AND the right
 * DeckEngine calls. Engine-side audio correctness is out of scope
 * (DeckEngine is heavy to instantiate — that needs a full audio-context
 * setup and would duplicate the existing `scratchPatterns` integration
 * coverage).
 *
 * Pure mocking — no Tone.js, no AudioContext.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks (must be declared before importing DJActions) ─────────────────────

const deckCalls = {
  startScratch: vi.fn(),
  setScratchVelocity: vi.fn(),
  stopScratch: vi.fn(),
};

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({
    getDeck: () => deckCalls,
  }),
}));

// Store state keyed by deckId; reset between tests. We mirror the shape
// `startScratch/stopScratch/setScratchVelocity` actually write to.
type StoreState = Record<'A' | 'B' | 'C', { scratchActive: boolean; scratchVelocity: number }>;
const storeState: { decks: StoreState } = {
  decks: {
    A: { scratchActive: false, scratchVelocity: 0 },
    B: { scratchActive: false, scratchVelocity: 0 },
    C: { scratchActive: false, scratchVelocity: 0 },
  },
};
const setDeckScratchActive = vi.fn((deck: 'A' | 'B' | 'C', active: boolean) => {
  storeState.decks[deck].scratchActive = active;
});
const setDeckState = vi.fn((deck: 'A' | 'B' | 'C', patch: Partial<{ scratchActive: boolean; scratchVelocity: number }>) => {
  Object.assign(storeState.decks[deck], patch);
});

vi.mock('@/stores/useDJStore', () => ({
  useDJStore: {
    getState: () => ({
      ...storeState,
      setDeckScratchActive,
      setDeckState,
    }),
  },
}));

import { startScratch, setScratchVelocity, stopScratch } from '../DJActions';

beforeEach(() => {
  deckCalls.startScratch.mockClear();
  deckCalls.setScratchVelocity.mockClear();
  deckCalls.stopScratch.mockClear();
  setDeckScratchActive.mockClear();
  setDeckState.mockClear();
  for (const d of ['A', 'B', 'C'] as const) {
    storeState.decks[d].scratchActive = false;
    storeState.decks[d].scratchVelocity = 0;
  }
});

describe('startScratch', () => {
  it('sets scratchActive=true in the store for the target deck', () => {
    startScratch('A');
    expect(setDeckScratchActive).toHaveBeenCalledWith('A', true);
    expect(storeState.decks.A.scratchActive).toBe(true);
  });

  it('delegates to DeckEngine.startScratch', () => {
    startScratch('A');
    expect(deckCalls.startScratch).toHaveBeenCalledTimes(1);
  });

  it('swallows engine errors silently (keyboard path must not throw)', () => {
    deckCalls.startScratch.mockImplementationOnce(() => {
      throw new Error('engine not ready');
    });
    expect(() => startScratch('A')).not.toThrow();
    // Store write still happened before the engine call failed.
    expect(setDeckScratchActive).toHaveBeenCalledWith('A', true);
  });

  it('targets decks independently — startScratch A doesn\'t touch B', () => {
    startScratch('A');
    expect(storeState.decks.A.scratchActive).toBe(true);
    expect(storeState.decks.B.scratchActive).toBe(false);
    expect(storeState.decks.C.scratchActive).toBe(false);
  });
});

describe('setScratchVelocity', () => {
  it('writes velocity to the store', () => {
    setScratchVelocity('A', 2.5);
    expect(setDeckState).toHaveBeenCalledWith('A', { scratchVelocity: 2.5 });
    expect(storeState.decks.A.scratchVelocity).toBe(2.5);
  });

  it('delegates the same velocity to DeckEngine', () => {
    setScratchVelocity('B', -3);
    expect(deckCalls.setScratchVelocity).toHaveBeenCalledWith(-3);
  });

  it('passes negative velocities through (backward scratch)', () => {
    setScratchVelocity('A', -1.5);
    expect(storeState.decks.A.scratchVelocity).toBe(-1.5);
    expect(deckCalls.setScratchVelocity).toHaveBeenCalledWith(-1.5);
  });

  it('engine errors are swallowed — store write still reflects intent', () => {
    deckCalls.setScratchVelocity.mockImplementationOnce(() => {
      throw new Error('audio context suspended');
    });
    expect(() => setScratchVelocity('A', 1)).not.toThrow();
    expect(storeState.decks.A.scratchVelocity).toBe(1);
  });

  it('extreme velocity values are passed through (clamp is DeckEngine\'s job)', () => {
    // The docstring on setScratchVelocity says "Clamped to [-4, 4]" but the
    // action itself doesn't clamp — it's the engine that enforces. This
    // test locks that contract so a future "let's clamp at the action
    // layer too" refactor has to update the docstring as well.
    setScratchVelocity('A', 999);
    expect(storeState.decks.A.scratchVelocity).toBe(999);
    expect(deckCalls.setScratchVelocity).toHaveBeenCalledWith(999);
  });
});

describe('stopScratch', () => {
  it('sets scratchActive=false AND scratchVelocity=0', () => {
    storeState.decks.A.scratchActive = true;
    storeState.decks.A.scratchVelocity = 3;
    stopScratch('A');
    expect(setDeckScratchActive).toHaveBeenCalledWith('A', false);
    expect(setDeckState).toHaveBeenCalledWith('A', { scratchVelocity: 0 });
    expect(storeState.decks.A.scratchActive).toBe(false);
    expect(storeState.decks.A.scratchVelocity).toBe(0);
  });

  it('passes the default decay (200 ms) when not specified', () => {
    stopScratch('A');
    expect(deckCalls.stopScratch).toHaveBeenCalledWith(200);
  });

  it('passes custom decay durations through', () => {
    stopScratch('A', 50);  // the `panic` / short-decay path
    expect(deckCalls.stopScratch).toHaveBeenCalledWith(50);
    stopScratch('B', 1000); // a long ramp
    expect(deckCalls.stopScratch).toHaveBeenCalledWith(1000);
  });

  it('engine errors are swallowed — store ends up in rest state anyway', () => {
    storeState.decks.A.scratchActive = true;
    deckCalls.stopScratch.mockImplementationOnce(() => {
      throw new Error('disposed');
    });
    expect(() => stopScratch('A')).not.toThrow();
    expect(storeState.decks.A.scratchActive).toBe(false);
    expect(storeState.decks.A.scratchVelocity).toBe(0);
  });
});

describe('scratch lifecycle integration', () => {
  it('start → velocity → velocity → stop leaves the store clean', () => {
    startScratch('A');
    setScratchVelocity('A', 2);
    setScratchVelocity('A', -1);
    stopScratch('A');
    expect(storeState.decks.A).toEqual({ scratchActive: false, scratchVelocity: 0 });
    expect(deckCalls.startScratch).toHaveBeenCalledTimes(1);
    expect(deckCalls.setScratchVelocity).toHaveBeenCalledTimes(2);
    expect(deckCalls.stopScratch).toHaveBeenCalledTimes(1);
  });

  it('velocity-before-start does not blow up (early-MIDI-CC race)', () => {
    // Can happen when a MIDI controller sends a jog delta before the
    // touch-start event arrives. setScratchVelocity must not throw and
    // must still write the value so the engine can catch up.
    setScratchVelocity('A', 0.5);
    startScratch('A');
    expect(storeState.decks.A.scratchVelocity).toBe(0.5);
    expect(storeState.decks.A.scratchActive).toBe(true);
  });

  it('stop-without-start is idempotent', () => {
    stopScratch('A');
    stopScratch('A');
    expect(storeState.decks.A.scratchActive).toBe(false);
    expect(storeState.decks.A.scratchVelocity).toBe(0);
    expect(deckCalls.stopScratch).toHaveBeenCalledTimes(2);
  });
});
