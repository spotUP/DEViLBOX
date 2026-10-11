/**
 * DJ view: DeckVinylView, DeckTurntable and DeckVinyl3DView read the 20 Hz
 * store position (audioPosition / elapsedMs, held between writes) so the
 * platter and tonearm stepped and trailed the audio. They now read the heard
 * clock per frame through platterPositionSec (deckPositionAt on the deck's
 * clock anchor), the same helper the CSS turntable uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (f: string) => readFileSync(resolve(__dirname, '../../components/dj', f), 'utf8');

describe('the turntable views turn with the heard position, per frame', () => {
  it.each(['DeckVinylView.tsx', 'DeckTurntable.tsx', 'DeckVinyl3DView.tsx'])(
    '%s reads platterPositionSec and never the held store position',
    (f) => {
      const src = read(f);
      expect(src).toMatch(/import \{ platterPositionSec \} from '\.\/DeckCssTurntable'/);
      expect(src).toMatch(/platterPositionSec\(deckId\)/);
      expect(src).not.toMatch(/\.audioPosition\b/);
      expect(src).not.toMatch(/audioPosition:\s*aPos/);
      expect(src).not.toMatch(/elapsedMs\s*\/\s*1000/);
    },
  );

  it('DeckTurntable feeds the worker every frame, not on store changes', () => {
    const src = read('DeckTurntable.tsx');
    expect(src).toMatch(/requestAnimationFrame\(postPosition\)/);
    expect(src).not.toMatch(/useDJStore\.subscribe\(\s*\(s\) => \{\s*const d = s\.decks/);
  });
});
