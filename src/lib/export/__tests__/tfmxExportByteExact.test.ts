/**
 * TFMX export through the app's load route (parser output plus tfmxFileData, as AmigaFormatParsers sets it)
 * writes the module back byte for byte, and one note edit changes only that command word.
 * Parsing alone leaves tfmxFileData unset, which sends the exporter to its from-scratch build (wrong size).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTFMXFile } from '@/lib/import/formats/TFMXParser';
import { exportTFMX } from '../TFMXExporter';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const FIXTURES = ['public/data/songs/formats/mdat.rocknroll', 'public/data/songs/formats/mdat.turrican_bonus'];

function load(path: string) {
  const raw = new Uint8Array(readFileSync(path));
  const song = parseTFMXFile(raw.buffer.slice(0) as ArrayBuffer, path);
  (song as { tfmxFileData?: ArrayBuffer }).tfmxFileData = raw.buffer.slice(0) as ArrayBuffer;
  setGridBaseline(baselineOf(song.patterns));
  return { raw, song };
}
const bytes = async (song: ReturnType<typeof load>['song']) => new Uint8Array(await (await exportTFMX(song)).data.arrayBuffer());
const diffs = (a: Uint8Array, b: Uint8Array) => { const d: number[] = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i); return d; };

describe('TFMX export', () => {
  for (const f of FIXTURES) {
    it(`${f.split('/').pop()}: unedited export is byte-exact`, async () => {
      const { raw, song } = load(f);
      const out = await bytes(song);
      expect(out.length).toBe(raw.length);
      expect(diffs(out, raw)).toEqual([]);
    });
  }

  it('one note edit changes only that command word', async () => {
    const { raw, song } = load(FIXTURES[0]);
    let hit: { p: number; r: number; c: number } | null = null;
    for (let p = 0; p < song.patterns.length && !hit; p++)
      for (let c = 0; c < song.patterns[p].channels.length && !hit; c++)
        song.patterns[p].channels[c].rows.forEach((cell, r) => { if (!hit && (cell.note ?? 0) > 0) hit = { p, r, c }; });
    expect(hit).not.toBeNull();
    const { p, r, c } = hit!;
    const cell = song.patterns[p].channels[c].rows[r];
    cell.note = cell.note === 40 ? 41 : 40;
    const at = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
    const out = await bytes(song);
    const d = diffs(out, raw);
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((i) => i >= at && i < at + 4)).toBe(true);
  });
});
