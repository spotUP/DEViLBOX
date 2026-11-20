/**
 * Game Music Creator export writes the original file back byte for byte, and a
 * cell edit reloads as that edit.
 *
 * knights_of_sky.gmc: the header offsets are Amiga load addresses, not file
 * positions; the PCM follows the pattern data. Reading them as file positions
 * dropped every sample (export 8210 bytes short).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGameMusicCreatorFile } from '@/lib/import/formats/GameMusicCreatorParser';
import { exportGameMusicCreator } from '../GameMusicCreatorExporter';

const FIXTURE = 'public/data/songs/formats/knights_of_sky.gmc';

function parse(bytes: Uint8Array) {
  const song = parseGameMusicCreatorFile(bytes, 'knights_of_sky.gmc');
  if (!song) throw new Error('parse failed');
  return song;
}

async function exportBytes(song: ReturnType<typeof parse>): Promise<Uint8Array> {
  return new Uint8Array(await (await exportGameMusicCreator(song)).data.arrayBuffer());
}

function diffOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const d: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d.push(i);
  return d;
}

describe('Game Music Creator export', () => {
  it('unedited export is byte-exact', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const out = await exportBytes(parse(raw));
    expect(out.length).toBe(raw.length);
    expect(diffOffsets(out, raw)).toEqual([]);
  });

  it('one note edit changes only that cell and reloads as the edit', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parse(raw);
    const cell = song.patterns[0].channels[0].rows[0];
    const edited = cell.note === 37 ? 49 : 37;
    cell.note = edited;
    if (!cell.instrument) cell.instrument = 1;
    const out = await exportBytes(song);
    expect(out.length).toBe(raw.length);
    const diffs = diffOffsets(out, raw);
    expect(diffs.length).toBeGreaterThan(0);
    // Orders map 1:1 here; pattern 0 row 0 channel 0 is the first 4 bytes after the 444-byte header.
    expect(diffs.every((i) => i >= 444 && i < 448)).toBe(true);
    const back = parse(out);
    expect(back.patterns[0].channels[0].rows[0].note).toBe(edited);
  });
});
