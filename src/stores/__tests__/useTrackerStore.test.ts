import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackerStore } from '../useTrackerStore';
import { resetStore } from './_harness';

describe('useTrackerStore — pattern lifecycle', () => {
  beforeEach(() => resetStore(useTrackerStore));

  it('has at least one initial pattern with channels', () => {
    const s = useTrackerStore.getState();
    expect(Array.isArray(s.patterns)).toBe(true);
    expect(s.patterns.length).toBeGreaterThan(0);
    expect(s.patterns[0].channels.length).toBeGreaterThan(0);
  });

  it('addPattern appends a new pattern with the current channel count', () => {
    const before = useTrackerStore.getState().patterns.length;
    const channels = useTrackerStore.getState().patterns[0].channels.length;
    useTrackerStore.getState().addPattern();
    const s = useTrackerStore.getState();
    expect(s.patterns.length).toBe(before + 1);
    expect(s.patterns[s.patterns.length - 1].channels.length).toBe(channels);
  });

  it('deletePattern removes the pattern at an index but never the last survivor', () => {
    useTrackerStore.getState().addPattern();
    useTrackerStore.getState().addPattern();
    const startCount = useTrackerStore.getState().patterns.length;

    useTrackerStore.getState().deletePattern(1);
    expect(useTrackerStore.getState().patterns.length).toBe(startCount - 1);

    // Drain down to 1 and then try to delete — should be a no-op.
    while (useTrackerStore.getState().patterns.length > 1) {
      useTrackerStore.getState().deletePattern(0);
    }
    useTrackerStore.getState().deletePattern(0);
    expect(useTrackerStore.getState().patterns.length).toBe(1);
  });

  it('clonePattern with an out-of-range index is a no-op', () => {
    const before = useTrackerStore.getState().patterns.length;
    useTrackerStore.getState().clonePattern(999);
    expect(useTrackerStore.getState().patterns.length).toBe(before);
  });

  // Note: the happy-path clonePattern test is covered by the Puppeteer UI
  // smoke suite (Phase 3) — happy-dom's structuredClone can't unwrap immer
  // Proxy drafts, so running it here would only test the test environment.
});
