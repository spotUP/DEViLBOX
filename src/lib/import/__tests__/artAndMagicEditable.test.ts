/**
 * Art and Magic (agony-level1/2.aam) is editable: the grid is the three voices' note events (grammar from nuade
 * artandmagic.c read_note), every used pattern's carrier rows encode back to its file bytes, an unedited export is
 * byte-identical, and an edited note cell changes exactly the note byte that played it, through the export router.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseArtAndMagicFile, locateAamLayout, aamIndexNote, AAM_PERIODS } from '@/lib/import/formats/ArtAndMagicParser';
import { exportArtAndMagic } from '@/lib/export/ArtAndMagicExporter';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { encodeRobHubbardPattern } from '@/engine/uade/encoders/RobHubbardEncoder';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

for (const NAME of ['agony-level1.aam', 'agony-level2.aam']) {
  const raw = readFileSync(`public/data/songs/formats/${NAME}`);
  const bytes = new Uint8Array(raw);
  const load = () => parseArtAndMagicFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);

  describe(`Art and Magic grid and export: ${NAME}`, () => {
    it('every used pattern encodes back to its file bytes and ends on $FF or $FE', () => {
      const layout = load().uadeVariableLayout!;
      expect(layout.formatId).toBe('artAndMagic');
      expect(layout.numFilePatterns).toBeGreaterThan(0);
      layout.blockRows!.forEach((rows, i) => {
        const addr = layout.filePatternAddrs[i];
        const size = layout.filePatternSizes[i];
        expect(Array.from(encodeRobHubbardPattern(rows))).toEqual(Array.from(bytes.subarray(addr, addr + size)));
        expect([0xff, 0xfe]).toContain(bytes[addr + size - 1]);
      });
    });

    it('note cells name note bytes, the grid shows them, and they are the period table note', () => {
      const song = load();
      const l = locateAamLayout(bytes)!;
      const nb = song.uadeVariableLayout!.noteBytes!;
      expect(nb.length).toBeGreaterThan(50);
      for (const n of nb) {
        expect(bytes[n.offset]).toBeLessThan(0x60);
        expect(song.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(n.note);
        expect(n.note).toBeGreaterThan(0);
        // The note is a table index (byte + the entry's note base), so it is one of the table's notes.
        expect(Array.from({ length: AAM_PERIODS }, (_, i) => aamIndexNote(bytes, l, i))).toContain(n.note);
      }
    });

    it('an unedited song exports byte-identical', async () => {
      const song = load();
      setGridBaseline(baselineOf(song.patterns));
      const r = await exportArtAndMagic(song);
      expect(diffAt(r.data, bytes)).toEqual([]);
      expect(r.warnings).toEqual([]);
    });

    it('an edited note changes only its note byte, through the export router, and reloads', async () => {
      const song = load();
      setGridBaseline(baselineOf(song.patterns));
      const nb = song.uadeVariableLayout!.noteBytes!;
      const n = nb.find((x) => nb.filter((y) => y.offset === x.offset).length === 1 && bytes[x.offset] < 0x50)!;
      const l = locateAamLayout(bytes)!;
      const base = Array.from({ length: AAM_PERIODS }, (_, i) => aamIndexNote(bytes, l, i)).indexOf(n.note) - bytes[n.offset];
      const target = aamIndexNote(bytes, l, bytes[n.offset] + base + 1);
      song.patterns[n.pattern].channels[n.channel].rows[n.row].note = target;
      const out = await exportNativeSong(song, {});
      expect(out).not.toBeNull();
      const data = out!.data instanceof Blob ? new Uint8Array(await out!.data.arrayBuffer()) : new Uint8Array(out!.data as unknown as Uint8Array);
      expect(diffAt(data, bytes)).toEqual([n.offset]);
      expect(data[n.offset]).toBe(bytes[n.offset] + 1);
      const re = parseArtAndMagicFile(data.slice().buffer as ArrayBuffer, NAME);
      expect(re.patterns[n.pattern].channels[n.channel].rows[n.row].note).toBe(target);
    });
  });
}
