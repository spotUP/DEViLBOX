/**
 * SCORE-IN-INFO-BAR: the deck's song info bar shows the song's community score
 * ("Average rating 4.2 from 7 votes"), fetched once through the ratings API client,
 * refreshed when the song changes and when a rating write records its answer.
 * Only the network is mocked; the bar, SongScore and the ratings store are real.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';

vi.mock('@/engine/dj/DJKeyUtils', () => ({
  camelotDisplay: () => '', camelotColor: () => '', keyCompatibility: () => 'none', keyCompatibilityColor: () => '',
}));
vi.mock('../../dj/DeckBeatPhase', () => ({ DeckBeatPhase: () => null }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

import { SongScore } from '../SongScore';
import { DeckTrackInfo } from '../../dj/DeckTrackInfo';
import { useDJStore } from '@/stores/useDJStore';
import { useRatingsStore } from '@/stores/useRatingsStore';

function answer(ratings: Record<string, { avg: number; count: number }>) {
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ ratings }) }));
}

describe('SongScore (component)', () => {
  it('shows nothing for a song without votes and for a source that is not rated', async () => {
    useRatingsStore.setState({ ratings: {} });
    answer({});
    const a = render(<SongScore fileName="modland:pub/x/none.mod" />);
    await act(async () => { await Promise.resolve(); });
    expect(a.container.textContent).toBe('');
    a.unmount();
    const b = render(<SongScore fileName="local:song.mod" />);
    expect(b.container.textContent).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('names the numbers in full words in the tooltip', () => {
    useRatingsStore.setState({ ratings: { 'hvsc:a/b.sid': { avg: 5, count: 1 } } });
    const { container } = render(<SongScore fileName="hvsc:a/b.sid" />);
    expect(container.querySelector('[title]')?.getAttribute('title')).toBe('Average rating 5.0 from 1 vote');
  });
});

describe('the deck info bar score (reachability)', () => {
  it('fetches the loaded song rating once, shows it, follows song change and a rating write', async () => {
    useRatingsStore.setState({ ratings: {} });
    answer({ 'pub/m/one.mod': { avg: 4.2, count: 7 }, 'pub/m/two.mod': { avg: 3, count: 2 } });
    useDJStore.getState().setDeckState('A', { trackName: 'one', fileName: 'modland:pub/m/one.mod' });
    const { container, getByText } = render(<DeckTrackInfo deckId="A" />);

    await waitFor(() => expect(getByText('4.2')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/ratings/batch');
    expect(String(fetchMock.mock.calls[0][0])).toContain('keys=pub%2Fm%2Fone.mod');
    expect(container.querySelector('[title="Average rating 4.2 from 7 votes"]')).toBeTruthy();
    expect(container.textContent).toContain('(7)');

    act(() => { useDJStore.getState().setDeckState('A', { trackName: 'two', fileName: 'modland:pub/m/two.mod' }); });
    await waitFor(() => expect(container.querySelector('[title="Average rating 3.0 from 2 votes"]')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    act(() => { useRatingsStore.getState().record('modland', 'pub/m/two.mod', { avg: 3.7, count: 3, userRating: 5 }); });
    expect(container.querySelector('[title="Average rating 3.7 from 3 votes"]')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
