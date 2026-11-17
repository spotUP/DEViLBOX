import { describe, it, expect, vi } from 'vitest';

const ctor = vi.hoisted(() => ({ n: 0 }));
vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { ctor.n++; throw new Error('AudioBuffer is not defined'); },
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore } from '../useTrackerStore';

describe('editing cells headless', () => {
  it('setCell, clearCell, clearPattern and setCurrentPosition do not construct the audio replayer', async () => {
    const st = () => useTrackerStore.getState();
    st().setCell(0, 0, { note: 49, instrument: 1 });
    expect(st().patterns[st().currentPatternIndex].channels[0].rows[0].note).toBe(49);
    st().clearCell(0, 0);
    expect(st().patterns[st().currentPatternIndex].channels[0].rows[0].note).toBe(0);
    st().setCell(0, 1, { note: 50, instrument: 1 });
    st().clearPattern();
    expect(st().patterns[st().currentPatternIndex].channels[0].rows[1].note).toBe(0);
    st().setCurrentPosition(0);
    // the debounced re-export timer also reads the replayer
    await new Promise((r) => setTimeout(r, 1500));
    expect(ctor.n).toBe(0);
  });
});
