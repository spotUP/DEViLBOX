import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseSTPFile } from '@/lib/import/formats/STPParser';
import { parseComposer667File } from '@/lib/import/formats/Composer667Parser';
import { exportSTP } from '@/lib/export/STPExporter';
import { exportComposer667 } from '@/lib/export/Composer667Exporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const bytes = async (r: { data: Blob }) => new Uint8Array(await r.data.arrayBuffer());

const CASES: Array<{ name: string; file: string; parse: (b: Uint8Array) => Promise<TrackerSong>; exp: (s: TrackerSong) => Promise<{ data: Blob }> }> = [
  { name: 'STP (version 1 source)', file: 'public/data/songs/formats/noname.stp', parse: (b) => parseSTPFile(ab(b), 'noname.stp'), exp: exportSTP },
  { name: 'Composer 669 (.667)', file: 'public/data/songs/composer-667/speed fighter.667', parse: async (b) => { const s = await parseComposer667File(b, 'speed fighter.667'); if (!s) throw new Error('parse failed'); return s; }, exp: exportComposer667 },
];

for (const c of CASES) {
  describe(`${c.name} export writes edits into the source file`, () => {
    const load = async () => {
      const b = new Uint8Array(readFileSync(c.file));
      const song = await c.parse(b);
      song.uadeEditableFileData = ab(b);
      setGridBaseline(baselineOf(song.patterns));
      return { b, song };
    };

    it('unedited export is the original file', async () => {
      const { b, song } = await load();
      expect(Buffer.from(await bytes(await c.exp(song)))).toEqual(Buffer.from(b));
    });

    it('an edited note comes back from export + reparse, and only its stored cell changes', async () => {
      const { b, song } = await load();
      const row = song.patterns[0].channels[0].rows[0];
      const note = row.note === 37 ? 40 : 37;
      song.patterns[0].channels[0].rows[0] = { ...row, note, instrument: row.instrument || 1 };
      const out = await bytes(await c.exp(song));
      expect(out.length).toBe(b.length);
      const back = await c.parse(out);
      expect(back.patterns[0].channels[0].rows[0].note).toBe(note);
      // Only that one stored cell changed (a 669 pattern played at several positions shows the edit at each).
      const diff = [...out].flatMap((v, i) => (v !== b[i] ? [i] : []));
      expect(diff.length).toBeGreaterThan(0);
      expect(diff[diff.length - 1] - diff[0]).toBeLessThan(song.uadePatternLayout!.bytesPerCell);
      setGridBaseline(null);
    });
  });
}
