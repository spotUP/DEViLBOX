import { describe, it, expect } from 'vitest';
import { getPlaybackState } from '../readHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';

/**
 * get_playback_state must report the pattern the tracker is on.
 *
 * The transport store kept its own currentPatternIndex that playback never wrote, so the MCP
 * (and the Maschine screens) reported pattern 0 while the song played pattern 2 (2026-10-18).
 * The tracker store is the one source of the current pattern.
 */
describe('get_playback_state', () => {
  it('reports the tracker store current pattern, not a stale transport copy', () => {
    const tracker = useTrackerStore.getState();
    const base = tracker.patterns[0];
    useTrackerStore.setState({
      patterns: [base, { ...base, id: 'p1' }, { ...base, id: 'p2' }],
      patternOrder: [0, 2, 1],
    });
    useTrackerStore.getState().setCurrentPosition(1);

    expect(useTrackerStore.getState().currentPatternIndex).toBe(2);
    expect(getPlaybackState().currentPattern).toBe(2);
  });
});
