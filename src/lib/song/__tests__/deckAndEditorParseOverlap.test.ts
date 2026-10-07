/**
 * U2.6c: the UADE engine a parse scans on travels down the parse as an
 * argument. A deck parse and an editor parse in flight at the same time each
 * scan on their own engine; before, a module-level "deck scope" was true for
 * whichever parse ran while a deck parse was awaiting, so the editor's scan
 * could land on the deck engine.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const probe = vi.hoisted(() => {
  const make = (tag: string) => {
    const engine = {
      tag,
      ready: vi.fn(async () => {}),
      enableTickSnapshots: vi.fn(),
      resetTickSnapshots: vi.fn(),
      release: null as null | ((e: Error) => void),
      load: vi.fn(() => new Promise<never>((_, reject) => { engine.release = reject; })),
    };
    return engine;
  };
  return { editor: make('editor'), deck: make('deck') };
});

vi.mock('@engine/uade/UADEEngine', () => ({
  UADEEngine: {
    getInstance: vi.fn(() => probe.editor),
    getDeckInstance: vi.fn(() => probe.deck),
    getPreviewInstance: vi.fn(),
    hasInstance: vi.fn(() => false),
  },
}));

import { openDeckTrack } from '@/lib/song/openSong';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';

const file = (): File => {
  const p = path.resolve(__dirname, '../../../../public/data/songs/formats/bob4e.dum');
  return new File([new Uint8Array(fs.readFileSync(p))], 'bob4e.dum');
};
const until = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(cond()).toBe(true);
};

describe('a deck parse and an editor parse in flight together', () => {
  it('scan on their own engines: the editor parse never lands on the deck engine', { timeout: 20_000 }, async () => {
    const deckOpen = openDeckTrack({ kind: 'file', file: file() }, 'A');
    await until(() => probe.deck.load.mock.calls.length === 1); // the deck scan is now awaiting
    const editorParse = parseModuleToSong(file());               // the editor parses while the deck scan is in flight
    await until(() => probe.editor.load.mock.calls.length === 1);

    expect(probe.deck.load).toHaveBeenCalledTimes(1);
    expect(probe.editor.load).toHaveBeenCalledTimes(1);

    probe.deck.release?.(new Error('deck scan stopped'));
    probe.editor.release?.(new Error('editor scan stopped'));
    await expect(deckOpen).rejects.toThrow('deck scan stopped');
    await expect(editorParse).rejects.toThrow('editor scan stopped');
  });
});
