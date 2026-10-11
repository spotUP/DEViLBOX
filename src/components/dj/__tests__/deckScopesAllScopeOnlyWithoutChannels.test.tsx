/**
 * Owner decision 2026-10-12 (SCOPE-ALL): a deck with per-channel scopes shows
 * CH1..CH4 and no ALL scope; ALL stays only for a deck without channel data
 * (an audio file, a cache entry rendered before the scope track existed).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/hooks/dj/useDeckVisualizationData', () => ({
  useDeckVisualizationData: () => ({ getWaveform: () => null, getChannelWaveforms: () => null }),
}));

import { DeckScopes } from '../DeckScopes';
import { useDJStore } from '@/stores/useDJStore';
import { showsAllScope } from '@/engine/dj/channelScopeTrack';

afterEach(cleanup);

const ALL_TITLE = 'Enable all channels';

function scopesFor(channelScopeCount: number): string[] {
  useDJStore.getState().setDeckState('A', { channelScopeCount });
  const { container } = render(<DeckScopes deckId="A" />);
  return Array.from(container.querySelectorAll('canvas')).map((c) => c.getAttribute('title') ?? '');
}

describe('the ALL scope exists only on a deck without channel scopes', () => {
  it('a deck with channel scopes shows four channel scopes and no ALL', () => {
    const titles = scopesFor(4);
    expect(titles).toHaveLength(4);
    expect(titles).not.toContain(ALL_TITLE);
  });

  it('a deck with fewer channels than four shows just those, still no ALL', () => {
    const titles = scopesFor(2);
    expect(titles).toHaveLength(2);
    expect(titles).not.toContain(ALL_TITLE);
  });

  it('a deck with no channel data (audio file, old cache entry) keeps ALL as its only scope', () => {
    const titles = scopesFor(0);
    expect(titles).toEqual([ALL_TITLE]);
  });

  it('the pure rule agrees', () => {
    expect(showsAllScope(0)).toBe(true);
    expect(showsAllScope(1)).toBe(false);
    expect(showsAllScope(4)).toBe(false);
  });
});
