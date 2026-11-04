import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '../parseModuleToSong';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { decodeMmdcStream, encodeMmdcStream, indexMmdc } from '../formats/mmdcCodec';

const FILES = [
  'public/data/songs/formats/captain planet and the planeteers - title.mmdc',
  'public/data/songs/octamed-mmdc/knightmare - ingame 3.mmdc',
];

// Independent port of nuade's per-byte reader (mmdc_module.c): header < 0x80 is a literal run, otherwise a zero run.
function referenceUnpack(buf: Uint8Array, pos: number, need: number): number[] {
  const out: number[] = [];
  while (out.length < need) {
    const h = buf[pos++];
    if (h < 0x80) for (let i = 0; i <= h; i++) out.push(buf[pos++]);
    else for (let i = 0; i <= 255 - h; i++) out.push(0);
  }
  return out.slice(0, need);
}

describe('MMDC codec', () => {
  it.each(FILES)('%s: every block decodes like the reference reader', (path) => {
    const bytes = new Uint8Array(readFileSync(path));
    const idx = indexMmdc(bytes);
    expect(idx.blocks.length).toBeGreaterThan(0);
    for (const b of idx.blocks) {
      const need = b.tracks * b.lines * 3;
      expect(Array.from(b.cells)).toEqual(referenceUnpack(bytes, b.packedOffset + 2, need));
      expect(Array.from(decodeMmdcStream(bytes, b.packedOffset + 2, need).bytes)).toEqual(Array.from(b.cells));
    }
  });

  it('encode then decode returns the data, including long zero runs and lone zeros', () => {
    const data = new Uint8Array(700);
    data.set([1, 0, 2, 0, 0, 3], 10);
    data.set([9, 9, 9], 400);
    const enc = encodeMmdcStream(data);
    expect(Array.from(decodeMmdcStream(enc, 0, data.length).bytes)).toEqual(Array.from(data));
  });
});

// One reachability test: packed OctaMED through the importer's entry point and the native export router.
describe('MMDC editable grid', () => {
  it.each(FILES)('%s imports a real grid, exports byte-exact, and an edit survives re-import', async (path) => {
    const raw = readFileSync(path);
    const bytes = new Uint8Array(raw);
    const name = path.split('/').pop()!;
    const song = await parseModuleToSong(new File([bytes], name));
    expect(song.uadePatternLayout!.formatId).toBe('mmdc'); // sentinel: the MMDC parser ran
    let notes = 0;
    song.patterns.forEach((p) => p.channels.forEach((c) => c.rows.forEach((r) => { if (r.note > 0) notes++; })));
    expect(notes).toBeGreaterThan(20);

    setGridBaseline(baselineOf(song.patterns));
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);

    const row = song.patterns[0].channels[1].rows[3];
    const cell = { ...row, note: row.note === 40 ? 41 : 40, instrument: row.instrument === 5 ? 6 : 5 };
    song.patterns[0].channels[1].rows[3] = cell;
    const changed = (await exportNativeSong(song))!.data as Uint8Array;
    expect(Buffer.from(changed).equals(raw)).toBe(false);
    const again = await parseModuleToSong(new File([new Uint8Array(changed)], name));
    expect(again.patterns[0].channels[1].rows[3]).toMatchObject({ note: cell.note, instrument: cell.instrument });
    // every other cell is unchanged
    const flat = (sg: typeof song) => sg.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.map((r) => `${r.note}/${r.instrument}/${r.effTyp}/${r.eff}`)));
    const before = flat(song);
    const after = flat(again);
    expect(after.length).toBe(before.length);
    const differing = before.map((v, i) => (v === after[i] ? -1 : i)).filter((i) => i >= 0);
    expect(differing).toEqual([]);
  }, 120_000);
});
