import { describe, it, expect, vi } from 'vitest';

const ctor = vi.hoisted(() => ({ n: 0 }));
vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { ctor.n++; throw new Error('AudioBuffer is not defined'); },
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore } from '../useTrackerStore';

describe('selecting a pattern headless', () => {
  it('does not construct the audio replayer as a side effect', () => {
    const st = useTrackerStore.getState();
    st.addPattern?.();
    const n = useTrackerStore.getState().patterns.length;
    expect(n).toBeGreaterThan(1);
    useTrackerStore.getState().setCurrentPattern(1);
    expect(useTrackerStore.getState().currentPatternIndex).toBe(1);
    expect(ctor.n).toBe(0);
  });
});
