/**
 * The scratch voice pool's programme meter (SCR-WET-BUS: the bus follows the decks' level, read every
 * 100 ms) was started outside the pool and never stopped: every pool rebuild (`resetScratchVoicePool`,
 * a context rebuild) left one more 10 Hz interval reading a dead engine, and the long-set test's
 * "nothing left running" saw it. The pool owns the meter now and its dispose stops it.
 *
 * Entry: the app's pool (`getScratchVoicePool`, the one the pads and the Auto DJ scratch through) and
 * its release (`resetScratchVoicePool`). The audio rings and buses are stubbed: no audio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock('tone', () => ({ getContext: () => ({ rawContext: {} }) }));
vi.mock('../DeckScratchBuffer', () => ({
  SCRATCH_RECORD_RING_BASE: 100,
  DeckScratchBuffer: class {
    playbackGain = { connect: () => {} };
    onPosition: unknown = null;
    async init() {}
    silenceAndStop() {}
    dispose() {}
  },
}));
vi.mock('../scratch/scratchBus', async (orig) => ({
  ...(await orig<typeof import('../scratch/scratchBus')>()),
  createScratchBus: () => ({ input: {}, dispose: () => {} }),
}));
vi.mock('../DJEngine', () => ({
  getDJEngine: () => ({
    mixer: { samplerInput: {} },
    getDeck: () => ({ waveformAnalyser: { getValue: () => { reads.n++; return new Float32Array(8).fill(0.1); } } }),
  }),
}));

import { getScratchVoicePool, resetScratchVoicePool } from '../scratch/scratchVoicePool';

describe('the scratch voice pool releases its programme meter', () => {
  afterEach(() => { resetScratchVoicePool(); vi.useRealTimers(); });

  it('a pool rebuild leaves no programme meter reading the decks', async () => {
    vi.useFakeTimers();
    getScratchVoicePool();
    await vi.advanceTimersByTimeAsync(300);
    expect(reads.n).toBeGreaterThan(0); // the meter follows the decks while the pool lives
    resetScratchVoicePool();
    expect(vi.getTimerCount()).toBe(0);
    // a second pool and its release: still nothing left
    getScratchVoicePool();
    resetScratchVoicePool();
    const before = reads.n;
    await vi.advanceTimersByTimeAsync(1000);
    expect(reads.n).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
