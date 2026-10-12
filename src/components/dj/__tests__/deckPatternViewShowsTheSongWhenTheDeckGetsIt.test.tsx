/**
 * The deck pattern view shows the incoming song while it renders (owner
 * 2026-10-12, DECK-B-EMPTY-AFTER-MIX-NOW: after Mix Now deck B showed a
 * waveform, then no pattern for a while, then the pattern). A playlist load
 * parses the song, writes the deck's file name, renders (seconds), and only
 * then gives the deck the song. The view read the song from the deck alone,
 * so for the whole render it showed the empty-deck oscilloscope (or the
 * previous track's pattern). It now reads the song the load parsed for that
 * file (DJSongCache) and re-reads when the deck takes a song (songVersion).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const holder = vi.hoisted(() => ({ deckSong: null as unknown }));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => ({ replayer: { getSong: () => holder.deckSong } }) }),
}));
vi.mock('@/components/tracker/ReadOnlyPatternCanvas', () => ({
  ReadOnlyPatternCanvas: ({ pattern }: { pattern: { id: string } }) => <div data-testid="pattern">{pattern.id}</div>,
}));
vi.mock('@/components/visualization/DJOscilloscope', () => ({
  DJOscilloscope: () => <div data-testid="scope" />,
}));

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { DeckPatternDisplay } from '../DeckPatternDisplay';
import { useDJStore } from '@/stores/useDJStore';
import { cacheSong, clearSongCache } from '@/engine/dj/DJSongCache';

afterEach(() => { cleanup(); clearSongCache(); holder.deckSong = null; });

const songWith = (id: string) => ({ songPositions: [0], patterns: [{ id, length: 64, channels: [] }], numChannels: 4 }) as unknown as TrackerSong;

describe('deck pattern view while the incoming track renders', () => {
  it('shows the parsed song as soon as the deck shows its name, not the oscilloscope', () => {
    // The load parsed the song and wrote the name; the render is under way, the deck has no song.
    cacheSong('modland:x/suggestive vibes 5.mod', songWith('incoming'));
    useDJStore.getState().setDeckState('B', { fileName: 'modland:x/suggestive vibes 5.mod', totalPositions: 1, songPos: 0, pattPos: 0 });
    const view = render(<DeckPatternDisplay deckId="B" />);
    expect(view.queryByTestId('scope')).toBeNull();
    expect(view.getByTestId('pattern').textContent).toBe('incoming');
  });

  it('a deck still holding the previous track shows the incoming song, not the old one', () => {
    holder.deckSong = songWith('previous');
    cacheSong('modland:x/next.mod', songWith('incoming'));
    useDJStore.getState().setDeckState('B', { fileName: 'modland:x/next.mod', totalPositions: 1, songPos: 0, pattPos: 0 });
    const view = render(<DeckPatternDisplay deckId="B" />);
    expect(view.getByTestId('pattern').textContent).toBe('incoming');
  });

  it('re-reads when the deck takes a song with no other store write', () => {
    useDJStore.getState().setDeckState('B', { fileName: 'modland:x/uncached.wav', totalPositions: 1, songPos: 0, pattPos: 0 });
    const view = render(<DeckPatternDisplay deckId="B" />);
    expect(view.queryByTestId('scope')).not.toBeNull();
    holder.deckSong = songWith('taken');
    act(() => { useDJStore.getState().setDeckState('B', { songVersion: useDJStore.getState().decks.B.songVersion + 1 }); });
    expect(view.getByTestId('pattern').textContent).toBe('taken');
  });
});
