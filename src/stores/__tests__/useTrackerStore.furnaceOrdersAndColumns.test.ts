import { describe, it, expect } from 'vitest';
import { useTrackerStore } from '../useTrackerStore';

describe('Furnace order operations and effect columns', () => {
  it('clamps effect columns to 1-8 on every pattern', () => {
    const s = useTrackerStore.getState();
    s.setChannelEffectCols(0, 20);
    expect(useTrackerStore.getState().patterns[0].channels[0].channelMeta?.effectCols).toBe(8);
    s.setChannelEffectCols(0, 0);
    expect(useTrackerStore.getState().patterns[0].channels[0].channelMeta?.effectCols).toBe(1);
    s.setChannelEffectCols(0, 5);
    expect(useTrackerStore.getState().patterns.every((p) => p.channels[0].channelMeta?.effectCols === 5)).toBe(true);
  });

  it('deep clone makes a new pattern, copy to end reuses the reference', () => {
    const before = useTrackerStore.getState();
    const nPat = before.patterns.length;
    const nOrd = before.patternOrder.length;
    before.deepClonePosition(0);
    let s = useTrackerStore.getState();
    expect(s.patterns.length).toBe(nPat + 1);
    expect(s.patternOrder.length).toBe(nOrd + 1);
    expect(s.patternOrder[1]).toBe(nPat);
    s.placeCopyAtEnd(0);
    s = useTrackerStore.getState();
    expect(s.patternOrder[s.patternOrder.length - 1]).toBe(s.patternOrder[0]);
    expect(s.patterns.length).toBe(nPat + 1);
  });
});
