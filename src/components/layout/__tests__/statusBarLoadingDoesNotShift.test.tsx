/**
 * "the loading text push other text aside" (2026-10-07). The status bar put
 * the song-loading text in its row of items, so every load (and every phase
 * and seconds change during it) moved the items after it. The text is now
 * drawn over the bar, out of the layout flow.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { StatusBar } from '../StatusBar';
import { useSongLoadStore } from '@/stores/useSongLoadStore';

afterEach(() => {
  cleanup();
  useSongLoadStore.setState({ depth: 0 });
});

describe('status bar while a song loads', { timeout: 60000 }, () => {
  it('shows the loading text out of the layout flow, so the other items do not move', () => {
    const { container, getByTestId } = render(<StatusBar />);
    const before = container.innerHTML.length;
    act(() => { useSongLoadStore.setState({ depth: 1, label: 'skateordie.rh', startedAt: Date.now() }); });
    const el = getByTestId('status-bar-loading');
    expect(el.textContent).toMatch(/Loading skateordie\.rh/i);
    expect(el.className).toMatch(/\babsolute\b/);
    expect(el.className).toMatch(/\bpointer-events-none\b/);
    // Its positioned parent is the bar itself, not a flex row of items.
    expect(el.parentElement?.className).toMatch(/\brelative\b/);
    expect(container.innerHTML.length).toBeGreaterThan(before);
  });
});
