/**
 * A MOD's note numbering is the same whichever way it is loaded.
 *
 * parseMODFile (the native parser the DJ decks and corpus use) and
 * parseModuleToSong (the tracker's import route) must give the same first
 * pattern, and every note must be the one src/lib/amiga/periodNotes.ts names
 * for the cell's raw period (428 = C-2 = note 25). The replayer's
 * noteToPeriod must map each such note back to the same period.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMODFile } from '../formats/MODParser';
import { parseModuleToSong } from '../parseModuleToSong';
import { periodToNote, noteToPeriod, AMIGA_PERIODS, PT_FIRST_NOTE, PT_LAST_NOTE } from '@/lib/amiga/periodNotes';
import { TrackerReplayer } from '@/engine/TrackerReplayer';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const FIXTURE = resolve(__dirname, '../../../__tests__/fixtures/mortimer-twang-2118bytes.mod');

type Cell = { note?: number; period?: number };

function firstPatternCells(song: TrackerSong): Cell[][] {
  return song.patterns[0].channels.map((c) => c.rows as Cell[]);
}

describe('MOD note numbering across load paths', () => {
  const bytes = readFileSync(FIXTURE);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  it('parseMODFile and parseModuleToSong agree, and match periodNotes.ts', async () => {
    const viaParser = await parseMODFile(ab, 'twang.mod');
    const viaRoute = await parseModuleToSong(new File([ab], 'twang.mod'));
    const a = firstPatternCells(viaParser);
    const b = firstPatternCells(viaRoute);
    expect(b.length).toBe(a.length);

    let noted = 0;
    for (let ch = 0; ch < a.length; ch++) {
      expect(b[ch].length).toBe(a[ch].length);
      for (let r = 0; r < a[ch].length; r++) {
        expect(b[ch][r].note ?? 0).toBe(a[ch][r].note ?? 0);
        for (const cell of [a[ch][r], b[ch][r]]) {
          if (cell.period) {
            noted++;
            expect(cell.note).toBe(periodToNote(cell.period));
          }
        }
      }
    }
    // Guard against a vacuous pass: the fixture's first pattern has notes.
    expect(noted).toBeGreaterThan(0);
  });

  it('replayer noteToPeriod round-trips every ProTracker note', () => {
    const proto = TrackerReplayer.prototype as unknown as {
      noteToPeriod: (note: number, finetune: number) => number;
      getPeriod: (i: number, ft: number) => number;
    };
    for (let n = PT_FIRST_NOTE; n <= PT_LAST_NOTE; n++) {
      const period = AMIGA_PERIODS[n - 1];
      expect(noteToPeriod(n)).toBe(period);
      expect(periodToNote(period)).toBe(n);
      expect(proto.noteToPeriod.call(proto, n, 0)).toBe(period);
    }
  });
});
