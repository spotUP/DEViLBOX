/**
 * A deck shows the pattern view only when the song has notes, otherwise the
 * oscilloscope - one rule for both decks (owner decision 2026-10-12,
 * SID-DECK-FOLLOWUP b). RSIDs that are whole C64 programs (Venus_Falling_SCC_Extended,
 * La_Mer) parse to an empty song; since every deck load holds its song
 * (SID-DECK-AUDIT 2) both decks showed an empty pattern grid instead of the scope.
 * Real HVSC files through the real SIDParser.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => ({ replayer: { getSong: () => null } }) }),
}));
vi.mock('@/components/tracker/ReadOnlyPatternCanvas', () => ({
  ReadOnlyPatternCanvas: () => <div data-testid="pattern" />,
}));
vi.mock('@/components/visualization/DJOscilloscope', () => ({
  DJOscilloscope: () => <div data-testid="scope" />,
}));

import { DeckPatternDisplay } from '../DeckPatternDisplay';
import { useDJStore } from '@/stores/useDJStore';
import { cacheSong, clearSongCache } from '@/engine/dj/DJSongCache';
import { parseSIDFile } from '@/lib/import/formats/SIDParser';

const load = (name: string): ArrayBuffer => {
  const b = readFileSync(join(__dirname, '../../../lib/sid/__tests__/fixtures', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

afterEach(() => { cleanup(); clearSongCache(); });

async function viewFor(deck: 'A' | 'B', file: string) {
  const song = await parseSIDFile(load(file), file);
  const key = `hvsc:${file}`;
  cacheSong(key, song);
  useDJStore.getState().setDeckState(deck, { fileName: key, totalPositions: song.songLength, songPos: 0, pattPos: 0 });
  return render(<DeckPatternDisplay deckId={deck} />);
}

describe('deck view: patterns only for a song with notes', () => {
  for (const deck of ['A', 'B'] as const) {
    it(`deck ${deck}: an RSID program (Venus_Falling_SCC_Extended) shows the oscilloscope`, async () => {
      const view = await viewFor(deck, 'Venus_Falling_SCC_Extended.sid');
      expect(view.queryByTestId('pattern')).toBeNull();
      expect(view.getByTestId('scope')).toBeTruthy();
    }, 60_000);

    it(`deck ${deck}: a PSID with notes (Commando) shows its patterns`, async () => {
      const view = await viewFor(deck, 'Commando.sid');
      expect(view.getByTestId('pattern')).toBeTruthy();
      expect(view.queryByTestId('scope')).toBeNull();
    }, 60_000);
  }

  it('La_Mer (RSID program) shows the oscilloscope', async () => {
    const view = await viewFor('A', 'La_Mer.sid');
    expect(view.queryByTestId('pattern')).toBeNull();
  }, 60_000);
});
