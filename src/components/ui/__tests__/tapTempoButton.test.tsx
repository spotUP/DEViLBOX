/**
 * TAP-BUTTON (owner 2026-10-12): the Tap button next to the deck BPM shows the
 * BPM tapped on it. Taps 400 ms apart read 150 BPM; the label returns to "Tap"
 * after 2 s idle; the deck's own tempo and beat grid are not touched.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('@/engine/dj/DJKeyUtils', () => ({
  camelotDisplay: () => '', camelotColor: () => '', keyCompatibility: () => 'none', keyCompatibilityColor: () => '',
}));
vi.mock('../../dj/DeckBeatPhase', () => ({ DeckBeatPhase: () => null }));

import { DeckTrackInfo } from '../../dj/DeckTrackInfo';
import { useDJStore } from '@/stores/useDJStore';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the deck Tap button', () => {
  it('taps 400 ms apart read 150 BPM on the button and change nothing on the deck', () => {
    useDJStore.getState().setDeckState('A', { effectiveBPM: 128, detectedBPM: 128 });
    const before = { eff: useDJStore.getState().decks.A.effectiveBPM, grid: useDJStore.getState().decks.A.beatGrid };
    const { getByRole } = render(<DeckTrackInfo deckId="A" />);
    const button = getByRole('button', { name: /^Tap/ });
    expect(button.textContent).toBe('Tap');

    for (let i = 0; i < 4; i++) {
      fireEvent.click(button);
      act(() => { vi.advanceTimersByTime(400); });
    }
    expect(button.textContent).toBe('Tap 150');

    const after = useDJStore.getState().decks.A;
    expect(after.effectiveBPM).toBe(before.eff);
    expect(after.beatGrid).toBe(before.grid);

    // Idle for 2 s: the button goes back to its plain label.
    act(() => { vi.advanceTimersByTime(2100); });
    expect(button.textContent).toBe('Tap');
  });
});
