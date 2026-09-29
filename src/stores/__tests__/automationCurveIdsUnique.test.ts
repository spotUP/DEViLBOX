/**
 * Two automation curves made in the same millisecond are two curves.
 *
 * addCurve named curves `curve-${Date.now()}`. The one-time dub-lane
 * conversion on project load creates curves in a loop, so two of them could
 * share an id - and every point meant for the second went to the first
 * (found 2026-09-29: echoThrow ended with 4 points, dubSiren with 0).
 */
import { describe, it, expect, vi } from 'vitest';
import { useAutomationStore } from '../useAutomationStore';

describe('automation curve ids', () => {
  it('are distinct for curves created in the same millisecond', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    try {
      const store = useAutomationStore.getState();
      store.reset();
      const a = store.addCurve('p0', 0, 'dub.echoThrow');
      const b = store.addCurve('p0', 1, 'dub.dubSiren');
      expect(a).not.toBe('');
      expect(b).not.toBe(a);
      useAutomationStore.getState().addPoint(b, 12, 1);
      const curves = useAutomationStore.getState().curves;
      expect(curves.find((c) => c.id === a)?.points).toHaveLength(0);
      expect(curves.find((c) => c.id === b)?.points).toHaveLength(1);
    } finally {
      now.mockRestore();
    }
  });
});
