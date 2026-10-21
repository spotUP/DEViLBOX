/**
 * The startup jingle draws its lips across the whole pattern editor, so the
 * instrument panel collapses while it plays and comes back as it was when the
 * jingle ends (owner 2026-10-21).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@engine/TrackerReplayer', () => {
  const replayer = { isPlaying: () => false, getCurrentPosition: () => 0, seekTo: () => undefined };
  return { peekTrackerReplayer: () => replayer, getTrackerReplayer: () => replayer };
});

import { injectMouthPatterns, teardownMouthPatterns } from '../JinglePatterns';
import { useUIStore } from '@stores/useUIStore';

describe('startup jingle and the instrument panel', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  it('collapses an open panel during the jingle and reopens it at the end', () => {
    useUIStore.getState().setShowInstrumentPanel(true);

    injectMouthPatterns();
    expect(useUIStore.getState().showInstrumentPanel).toBe(false);

    teardownMouthPatterns();
    expect(useUIStore.getState().showInstrumentPanel).toBe(true);
  });

  it('leaves a panel the user had collapsed collapsed', () => {
    useUIStore.getState().setShowInstrumentPanel(false);

    injectMouthPatterns();
    teardownMouthPatterns();

    expect(useUIStore.getState().showInstrumentPanel).toBe(false);
  });
});
