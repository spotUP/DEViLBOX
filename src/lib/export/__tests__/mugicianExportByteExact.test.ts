/**
 * Digital Mugician export writes the loaded file back byte for byte (V1 and V2),
 * and a cell edit changes only that cell's bytes and reloads as the edit.
 *
 * cockwise.mug and snickle.mug2 are both V2 (" MUGICIAN2/SOFTEYES 1990"); the
 * exporter used to rebuild everything as V1.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDigitalMugicianFile } from '@/lib/import/formats/DigitalMugicianParser';
import { exportDigitalMugician } from '../DigitalMugicianExporter';

const FIXTURES = ['cockwise.mug', 'snickle.mug2'];

async function parse(bytes: Uint8Array, name: string) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return parseDigitalMugicianFile(ab, name);
}
async function exportBytes(song: Awaited<ReturnType<typeof parse>>): Promise<Uint8Array> {
  return new Uint8Array(await (await exportDigitalMugician(song)).data.arrayBuffer());
}
function diffOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const d: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d.push(i);
  return d;
}

describe.each(FIXTURES)('Digital Mugician export %s', (name) => {
  const raw = new Uint8Array(readFileSync(`public/data/songs/digital-mugician-2/${name}`));

  it('unedited export is byte-exact', async () => {
    const out = await exportBytes(await parse(raw, name));
    expect(out.length).toBe(raw.length);
    expect(diffOffsets(out, raw)).toEqual([]);
  });

  it('one note edit changes only its own bytes and reloads as the edit', async () => {
    const song = await parse(raw, name);
    const layout = song.uadePatternLayout!;
    let p = 0, r = 0, c = 0;
    outer: for (p = 0; p < song.patterns.length; p++) for (c = 0; c < layout.numChannels; c++) for (r = 0; r < song.patterns[p].channels[c].rows.length; r++) {
      if (song.patterns[p].channels[c].rows[r].note > 0) break outer;
    }
    if (p === song.patterns.length) throw new Error('no note cell');
    const cell = song.patterns[p].channels[c].rows[r];
    const edited = cell.note - 1; // down: the note above the table top has no byte
    cell.note = edited;
    if (!cell.instrument) cell.instrument = 1;
    const out = await exportBytes(song);
    expect(out.length).toBe(raw.length);
    const off = layout.getCellFileOffset!(p, r, c);
    const diffs = diffOffsets(out, raw);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((i) => i >= off && i < off + 4)).toBe(true);
    const back = await parse(out, name);
    expect(back.patterns[p].channels[c].rows[r].note).toBe(edited);
  });
});
