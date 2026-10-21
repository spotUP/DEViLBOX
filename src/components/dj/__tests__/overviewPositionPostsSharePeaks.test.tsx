/**
 * DECK-OVERVIEW-PEAKS-COPIED-PER-POSITION: position posts (~20 Hz) must not
 * carry the analysis peaks; only a peaks change posts them (once).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

const posts: Array<Record<string, unknown>> = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  OffscreenBridge: class {
    post(msg: Record<string, unknown>) { posts.push(msg); }
    dispose() {}
    destroy() {}
  },
}));
vi.mock('@/workers/dj-overview.worker.ts?worker', () => ({ default: class {} }));

import { DeckTrackOverview } from '../DeckTrackOverview';
import { useDJStore } from '@/stores/useDJStore';

beforeEach(() => {
  posts.length = 0;
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).transferControlToOffscreen = () => ({});
});
afterEach(() => { cleanup(); });

describe('DeckTrackOverview posts', () => {
  it('position updates post no peaks arrays; a peaks change posts them once', () => {
    useDJStore.getState().setDeckState('A', {
      waveformPeaks: new Float32Array([0.1, 0.2]),
      frequencyPeaks: [new Float32Array([1]), new Float32Array([2]), new Float32Array([3])],
    });
    render(React.createElement(DeckTrackOverview, { deckId: 'A' }));
    expect(posts.length).toBe(1);
    expect(posts[0].type).toBe('init');
    posts.length = 0;

    for (let i = 1; i <= 4; i++) {
      act(() => { useDJStore.getState().setDeckState('A', { songPos: i, totalPositions: 10 }); });
    }
    expect(posts.length).toBeGreaterThanOrEqual(4);
    for (const m of posts) {
      expect('waveformPeaks' in m).toBe(false);
      expect('frequencyPeaks' in m).toBe(false);
    }
    posts.length = 0;

    act(() => { useDJStore.getState().setDeckState('A', { waveformPeaks: new Float32Array([0.5]) }); });
    const withPeaks = posts.filter((m) => 'waveformPeaks' in m);
    expect(withPeaks.length).toBe(1);
    expect(withPeaks[0].type).toBe('state');
  });
});
