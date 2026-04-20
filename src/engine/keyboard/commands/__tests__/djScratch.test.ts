/**
 * Regression tests for DJ scratch keyboard command wiring.
 *
 * Guards the class of regression where a pattern rename in SCRATCH_PATTERNS
 * silently decouples from the command function indexing it. e.g. if someone
 * deletes "Baby Scratch" from the registry, `djScratchBaby()` would blow up
 * inside the keyboard handler with no compile-time warning — only a failed
 * keystroke during a live set would surface it.
 *
 * Also guards the off-by-one regression class (`djScratchTrans` accidentally
 * points at `SCRATCH_PATTERNS[0]` instead of `[1]`, etc.).
 *
 * Pure-logic: mocks the engine + stores so we can assert the call arguments
 * without actually instantiating DeckEngine / Tone.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SCRATCH_PATTERNS } from '@/engine/dj/DJScratchEngine';

// ── Mock the engine + stores BEFORE the command module imports them ───────
const stopPattern = vi.fn();
const playPattern = vi.fn();
const fakeDeck = { stopPattern, playPattern, startFaderLFO: vi.fn(), stopFaderLFO: vi.fn() };

vi.mock('@engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => fakeDeck }),
}));

vi.mock('@stores/useDJStore', () => {
  const state = {
    decks: {
      A: { isPlaying: true,  beatGrid: null },
      B: { isPlaying: false, beatGrid: null },
      C: { isPlaying: false, beatGrid: null },
    },
    setDeckPattern: vi.fn(),
  };
  return {
    useDJStore: {
      getState: () => state,
      setState: (partial: unknown) => Object.assign(state, partial),
    },
  };
});

vi.mock('@stores/useUIStore', () => {
  const state = { setStatusMessage: vi.fn() };
  return {
    useUIStore: {
      getState: () => state,
      setState: (p: unknown) => Object.assign(state, p),
    },
  };
});

// Import after mocks — otherwise the real modules get bound into the closures.
import * as djScratch from '../djScratch';

const {
  djScratchBaby,   djScratchTrans,  djScratchFlare,   djScratchHydro,
  djScratchCrab,   djScratchOrbit,  djScratchChirp,   djScratchStab,
  djScratchScrbl,  djScratchTear,
  djScratchUzi,    djScratchTwiddle, djScratch8Crab,  djScratch3Flare,
  djScratchLaser,  djScratchPhaser, djScratchTweak,   djScratchDrag,
  djScratchVibrato,
  djScratchStop,
  djFaderLFOOff,   djFaderLFO14,    djFaderLFO18,
  djFaderLFO116,   djFaderLFO132,
  clearPatternGuard,
} = djScratch;

describe('djScratch keyboard command exports', () => {
  it('exports all 19 scratch pattern commands', () => {
    const patternCommands = [
      djScratchBaby,   djScratchTrans,  djScratchFlare,   djScratchHydro,
      djScratchCrab,   djScratchOrbit,  djScratchChirp,   djScratchStab,
      djScratchScrbl,  djScratchTear,
      djScratchUzi,    djScratchTwiddle, djScratch8Crab,  djScratch3Flare,
      djScratchLaser,  djScratchPhaser, djScratchTweak,   djScratchDrag,
      djScratchVibrato,
    ];
    expect(patternCommands).toHaveLength(SCRATCH_PATTERNS.length);
    for (const cmd of patternCommands) {
      expect(typeof cmd).toBe('function');
    }
  });

  it('exports Stop + 5 fader-LFO commands + pattern guard', () => {
    for (const fn of [djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132, clearPatternGuard]) {
      expect(typeof fn).toBe('function');
    }
  });
});

// Helper: commands 10-18 accept `start?: boolean` (undefined = toggle via
// triggerPattern). Commands 0-9 default start=true. Invoking with start=false
// always dispatches to stopPattern. We use start=false to observe which
// pattern name was most recently started via the tracked playPattern mock.
//
// Strategy: set up the guard so the command routes to stopPattern via the
// "already-running" branch — but that actually clears state without exposing
// the pattern name. Better strategy: observe playPattern calls directly.

describe('pattern commands map to the correct SCRATCH_PATTERNS index', () => {
  beforeEach(() => {
    playPattern.mockClear();
    stopPattern.mockClear();
    // Reset pattern guard between tests by invoking djScratchStop for deck A.
    clearPatternGuard('A'); clearPatternGuard('B'); clearPatternGuard('C');
    playPattern.mockClear();
    stopPattern.mockClear();
  });

  const commandIndexPairs: Array<[(start?: boolean) => boolean, number, string]> = [
    [djScratchBaby,     0, 'djScratchBaby'],
    [djScratchTrans,    1, 'djScratchTrans'],
    [djScratchFlare,    2, 'djScratchFlare'],
    [djScratchHydro,    3, 'djScratchHydro'],
    [djScratchCrab,     4, 'djScratchCrab'],
    [djScratchOrbit,    5, 'djScratchOrbit'],
    [djScratchChirp,    6, 'djScratchChirp'],
    [djScratchStab,     7, 'djScratchStab'],
    [djScratchScrbl,    8, 'djScratchScrbl'],
    [djScratchTear,     9, 'djScratchTear'],
    [djScratchUzi,     10, 'djScratchUzi'],
    [djScratchTwiddle, 11, 'djScratchTwiddle'],
    [djScratch8Crab,   12, 'djScratch8Crab'],
    [djScratch3Flare,  13, 'djScratch3Flare'],
    [djScratchLaser,   14, 'djScratchLaser'],
    [djScratchPhaser,  15, 'djScratchPhaser'],
    [djScratchTweak,   16, 'djScratchTweak'],
    [djScratchDrag,    17, 'djScratchDrag'],
    [djScratchVibrato, 18, 'djScratchVibrato'],
  ];

  for (const [cmd, index, label] of commandIndexPairs) {
    it(`${label} invokes SCRATCH_PATTERNS[${index}] = "${SCRATCH_PATTERNS[index].name}"`, () => {
      // Guard cleared in beforeEach; fire with start=true so it routes
      // through startPattern → deck.playPattern.
      const ok = cmd(true);
      expect(ok).toBe(true);
      // deck.playPattern should have been called exactly once with the
      // canonical pattern name at this index. Catches off-by-one bugs.
      expect(playPattern).toHaveBeenCalledTimes(1);
      expect(playPattern.mock.calls[0][0]).toBe(SCRATCH_PATTERNS[index].name);
    });
  }
});

describe('pattern guard semantics', () => {
  beforeEach(() => {
    clearPatternGuard('A'); clearPatternGuard('B'); clearPatternGuard('C');
    playPattern.mockClear();
    stopPattern.mockClear();
  });

  it('start while nothing is running → starts', () => {
    djScratchBaby(true);
    expect(playPattern).toHaveBeenCalledTimes(1);
    expect(stopPattern).not.toHaveBeenCalled();
  });

  it('start while a DIFFERENT pattern is already running → ignored (guard)', () => {
    djScratchBaby(true);
    playPattern.mockClear();
    // Attempt a second start with a different command — guard must refuse.
    djScratchFlare(true);
    expect(playPattern).not.toHaveBeenCalled();
    expect(stopPattern).not.toHaveBeenCalled();
  });

  it('release (start=false) of any pattern calls stopPattern', () => {
    djScratchBaby(true);
    stopPattern.mockClear();
    djScratchBaby(false);
    expect(stopPattern).toHaveBeenCalledTimes(1);
  });

  it('clearPatternGuard frees the deck for a new start', () => {
    djScratchBaby(true);
    playPattern.mockClear();
    clearPatternGuard('A');
    // Guard is now clear — a fresh start MUST succeed.
    djScratchFlare(true);
    expect(playPattern).toHaveBeenCalledTimes(1);
    expect(playPattern.mock.calls[0][0]).toBe(SCRATCH_PATTERNS[2].name); // Flare
  });
});
