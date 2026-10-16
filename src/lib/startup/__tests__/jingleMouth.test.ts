import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let level = 200;
const analyser = {
  frequencyBinCount: 128,
  fftSize: 256,
  getByteFrequencyData: (b: Uint8Array) => { b.fill(level); },
  getByteTimeDomainData: (b: Uint8Array) => { b.fill(128 + level / 4); },
};
vi.mock('@engine/jingle/JingleEngine', () => ({ getJingleEngine: () => ({ getAnalyser: () => analyser }) }));

import { useTrackerStore } from '@stores/useTrackerStore';
import { injectMouthPatterns, teardownMouthPatterns } from '@engine/jingle/JinglePatterns';

const litRows = () => useTrackerStore.getState().patterns[0]!.channels[0]!.rows.filter((r) => r.note !== 0).length;

describe('startup jingle: the pattern grid animates from the jingle analyser', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }); });
  afterEach(() => { teardownMouthPatterns(); vi.useRealTimers(); });

  it('lights pattern rows while the jingle plays and restores the grid at the end', () => {
    const before = litRows();
    injectMouthPatterns();
    expect(useTrackerStore.getState().patterns[0]!.channels.length).toBeGreaterThanOrEqual(6);
    vi.advanceTimersByTime(300);
    expect(litRows()).toBeGreaterThan(before); // driver ran and wrote cells (sentinel)
    teardownMouthPatterns();
    expect(litRows()).toBe(before);
  });
});
