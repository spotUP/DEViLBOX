/**
 * An edited Face The Music song exports to a file that imports as the edit.
 *
 * FTM channels are event streams: an event sits `spacing` rows after the row
 * following the previous one, and a spacing line sets that gap for the NEXT
 * event only (after it the channel's default spacing applies). The encoder
 * treated a spacing line as persistent, emitting one only when the gap
 * changed, so two events in a row with the same gap put the second on the
 * wrong row; and the exporter wrote every file from scratch with default
 * spacing 0, no effect scripts and no artist. Export now writes the loaded
 * file with each edited channel re-encoded under its own default spacing.
 *
 * Edit (set a note on an empty row, change a note, clear a note), export,
 * re-import, compare every cell; untouched channels stay byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFaceTheMusicFile } from '@lib/import/formats/FaceTheMusicParser';
import { exportFaceTheMusic } from '@lib/export/FaceTheMusicExporter';
import { cellFieldsEqual } from '@engine/uade/UADEPatternEncoder';
import { encodeFtmEventStream } from '@engine/uade/encoders/FaceTheMusicEncoder';
import { EMPTY_CELL } from '@/types';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = resolve(__dirname, '../../..');

function load(rel: string): { file: Uint8Array; song: TrackerSong } {
  const file = new Uint8Array(readFileSync(resolve(ROOT, rel)));
  return { file, song: parseFaceTheMusicFile(file, rel.split('/').pop()!)! };
}

const isNote = (n: number) => n > 0 && n < 97;

describe('Face The Music edit -> export -> import', () => {
  it('a spacing line holds for one event: equal gaps each get one', () => {
    // Notes on rows 2 and 5: both 2 rows after the row following the previous
    // event. Default spacing 0 applies after the first, so the second needs its own.
    const rows = Array.from({ length: 8 }, () => ({ ...EMPTY_CELL }));
    rows[2] = { ...rows[2], note: 49 + 1 };
    rows[5] = { ...rows[5], note: 49 + 3 };
    expect(Array.from(encodeFtmEventStream(rows, 0))).toEqual([0xF0, 2, 0x00, 2, 0xF0, 2, 0x00, 4]);
    // Default spacing 2: only the first event (spacing 0 before it) needs a line.
    expect(Array.from(encodeFtmEventStream(rows, 2))).toEqual([0xF0, 2, 0x00, 2, 0x00, 4]);
  });

  for (const rel of ['public/data/songs/face-the-music/rock.ftm', 'public/data/songs/formats/staticoscillations.ftm']) {
    it(`${rel.split('/').pop()}: re-imports as the edited grid`, async () => {
      const { file, song } = load(rel);
      const pats = song.patterns;
      // A channel with at least two notes in one measure and an empty row.
      let P = -1; let CH = -1;
      pats.some((pat, p) => pat.channels.some((ch, c) => {
        if (ch.rows.filter((x) => isNote(x.note)).length < 2 || !ch.rows.some((x) => !x.note && !x.instrument && !x.effTyp)) return false;
        P = p; CH = c; return true;
      }));
      expect(P).toBeGreaterThanOrEqual(0);
      const rows = pats[P].channels[CH].rows;
      const notes = rows.map((x, r) => (isNote(x.note) ? r : -1)).filter((r) => r >= 0);
      const empty = rows.findIndex((x) => !x.note && !x.instrument && !x.effTyp);
      rows[empty] = { ...rows[empty], note: 60, instrument: 1 };
      rows[notes[0]] = { ...rows[notes[0]], note: rows[notes[0]].note === 70 ? 71 : 70 };
      rows[notes[1]] = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

      const out = await exportFaceTheMusic(song);
      const bytes = new Uint8Array(await out.data.arrayBuffer());
      const back = parseFaceTheMusicFile(bytes, 'back.ftm')!;
      expect(back.patterns.length).toBe(pats.length);

      const diffs: string[] = [];
      pats.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
        const got = back.patterns[p].channels[c].rows[r];
        if (!cellFieldsEqual(cell, got)) diffs.push(`${p}:${c}:${r} want ${cell.note}/${cell.instrument} got ${got.note}/${got.instrument}`);
      })));
      expect(diffs.slice(0, 8)).toEqual([]);

      // Untouched channels, header and samples keep their bytes.
      const a = song.uadeVariableLayout!; const b = back.uadeVariableLayout!;
      expect(Array.from(bytes.subarray(0, a.filePatternAddrs[0] - 6))).toEqual(Array.from(file.subarray(0, a.filePatternAddrs[0] - 6)));
      a.filePatternAddrs.forEach((addr, ch) => {
        if (ch === CH) return;
        expect(Buffer.compare(
          Buffer.from(bytes.subarray(b.filePatternAddrs[ch], b.filePatternAddrs[ch] + b.filePatternSizes[ch])),
          Buffer.from(file.subarray(addr, addr + a.filePatternSizes[ch]))), `channel ${ch}`).toBe(0);
      });
      const endA = a.filePatternAddrs.at(-1)! + a.filePatternSizes.at(-1)!;
      const endB = b.filePatternAddrs.at(-1)! + b.filePatternSizes.at(-1)!;
      expect(Buffer.compare(Buffer.from(bytes.subarray(endB)), Buffer.from(file.subarray(endA)))).toBe(0);
    });
  }
});
