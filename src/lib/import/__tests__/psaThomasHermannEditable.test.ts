/**
 * PSA and Thomas Hermann are editable: an unedited export is byte-identical to the loaded file, and one edited note changes
 * exactly one byte (the note byte of its cell) and shows again when the exported file is parsed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parsePSAFile } from '@/lib/import/formats/PSAParser';
import { parseThomasHermannFile } from '@/lib/import/formats/ThomasHermannParser';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { songFile } from '@/test/songPath';

const CASES: { name: string; file: string; parse: (b: ArrayBuffer, n: string) => TrackerSong | Promise<TrackerSong> }[] = [
  { name: 'PSA', file: 'the punisher - title.psa', parse: parsePSAFile },
  { name: 'Thomas Hermann', file: 'thm.blueangel69', parse: parseThomasHermannFile },
];
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

for (const c of CASES) {
  const raw = readFileSync(songFile(c.file));
  const bytes = new Uint8Array(raw);
  const ab = () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const exportBytes = async (song: TrackerSong) => {
    const out = await exportNativeSong(song, {});
    expect(out).not.toBeNull();
    return out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
  };

  describe(`${c.name} editable (${c.file})`, () => {
    it('an unedited song exports byte-identical', async () => {
      const song = await c.parse(ab(), c.file);
      setGridBaseline(baselineOf(song.patterns));
      expect(diffAt(await exportBytes(song), bytes)).toEqual([]);
    });

    it('one edited note changes exactly one byte and reloads', async () => {
      const song = await c.parse(ab(), c.file);
      setGridBaseline(baselineOf(song.patterns));
      const layout = song.uadePatternLayout!;
      let hit: { p: number; ch: number; r: number } | null = null;
      for (let p = 0; p < song.patterns.length && !hit; p++)
        for (let ch = 0; ch < song.patterns[p].channels.length && !hit; ch++)
          song.patterns[p].channels[ch].rows.forEach((cell, r) => {
            if (!hit && cell.note > 0 && cell.note < 96 && getCellFileOffset(layout, p, r, ch) >= 0) hit = { p, ch, r };
          });
      const { p, ch, r } = hit!;
      const cell = song.patterns[p].channels[ch].rows[r];
      song.patterns[p].channels[ch].rows[r] = { ...cell, note: cell.note + 1 };
      const data = await exportBytes(song);
      expect(diffAt(data, bytes)).toHaveLength(1);
      const re = await c.parse(data.slice().buffer as ArrayBuffer, c.file);
      expect(re.patterns[p].channels[ch].rows[r].note).toBe(cell.note + 1);
    });
  });
}
