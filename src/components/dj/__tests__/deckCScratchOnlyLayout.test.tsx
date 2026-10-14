/**
 * DECK-C-LAYOUT: Deck C with no track is the scratch deck (scratch-only controls); a track loaded on it brings
 * the full track controls back; a scratch pad with a record selected reaches the scratch voice pool.
 * One reachability test through DJDeck, the real fireDjFx and the real DeckScratch.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

const perform = vi.fn(() => null);
vi.mock('@/engine/dj/scratch/scratchVoicePool', async (orig) => ({
  ...(await orig<typeof import('@/engine/dj/scratch/scratchVoicePool')>()),
  getScratchVoicePool: () => ({ perform }),
  getScratchVoicePoolIfActive: () => ({ releaseAll: () => {} }),
}));
for (const m of ['DeckScopes', 'DeckTrackInfo', 'DeckTrackOverview', 'DeckBeatGrid', 'DeckVisualizer', 'DeckPatternDisplay', 'DeckPitchSlider', 'DeckTransport', 'DeckNudge', 'DeckTurntable', 'DeckCssTurntable', 'DeckCScratchLanes', 'DeckFXPads', 'DeckCuePoints', 'DeckLoopControls', 'DeckQuantize', 'DeckQuickEQ', 'DeckStemControls']) {
  vi.doMock(`../${m}`, () => ({ [m]: () => <div data-testid={m} /> }));
}

import { useDJStore } from '@/stores/useDJStore';
import { CRATE_LOAD_ORDER } from '@/engine/dj/scratch/scratchCatalogue';
import { SCRATCH_PATTERNS } from '@/engine/dj/DJScratchEngine';
import { getGesture } from '@/engine/dj/scratch/scratchGestureCatalog';

afterEach(() => { cleanup(); useDJStore.getState().setDeckState('C', { fileName: '' }); perform.mockClear(); });

describe('Deck C layout', () => {
  it('scratch-only without a track, full controls with one, pads play the selected record on the voice pool', async () => {
    const { DJDeck } = await import('../DJDeck');
    const { container, queryByTestId, getByText, getByRole } = render(<DJDeck deckId="C" />);
    for (const id of ['DeckScopes', 'DeckTrackInfo', 'DeckPitchSlider', 'DeckTransport', 'DeckNudge']) expect(queryByTestId(id), id).toBeNull();
    expect(container.querySelector('[data-deck-panel-tabs]')).toBeNull();
    expect(queryByTestId('DeckCScratchLanes')).not.toBeNull();
    expect(getByText('Record')).toBeTruthy();

    const target = CRATE_LOAD_ORDER[1]!;
    act(() => useDJStore.getState().setDeckCRecordId(target.id));
    const pad = getByRole('button', { name: getGesture(SCRATCH_PATTERNS[0]!.gestureId).name });
    fireEvent.pointerDown(pad);
    expect(perform).toHaveBeenCalledTimes(1);
    expect((perform.mock.calls[0] as unknown[])[1]).toMatchObject({ record: target.id });

    act(() => useDJStore.getState().setDeckState('C', { fileName: 'x.mp3' }));
    for (const id of ['DeckScopes', 'DeckTrackInfo', 'DeckPitchSlider', 'DeckTransport', 'DeckNudge']) expect(queryByTestId(id), id).not.toBeNull();
    expect(container.querySelector('[data-deck-panel-tabs]')).not.toBeNull();
  });
});
