/**
 * Old-family Ashley Hogg: a volume or effect edit has no byte to land in. It is refused with that reason and the file
 * stays byte-identical.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAshleyHoggFile } from '@/lib/import/formats/AshleyHoggParser';
import { exportAshleyHogg } from '@/lib/export/AshleyHoggExporter';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const NAME = 'ash.nobby the aardvark';
const raw = readFileSync(`public/data/songs/ashley-hogg/${NAME}`);
const bytes = new Uint8Array(raw);

describe('Ashley Hogg refuses volume and effect edits', () => {
  it.each(['volume', 'effect'] as const)('%s', async (kind) => {
    const song = parseAshleyHoggFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, NAME);
    setGridBaseline(baselineOf(song.patterns));
    const n = song.uadeVariableLayout!.noteBytes![0];
    const cell = song.patterns[n.pattern].channels[n.channel].rows[n.row];
    if (kind === 'volume') cell.volume = 0x30; else { cell.effTyp = 0x0c; cell.eff = 0x20; }
    const r = await exportAshleyHogg(song);
    expect(r.warnings.some((w) => /volume and effect edits are refused/.test(w))).toBe(true);
    expect(Buffer.from(r.data).equals(Buffer.from(bytes))).toBe(true);
  });
});
