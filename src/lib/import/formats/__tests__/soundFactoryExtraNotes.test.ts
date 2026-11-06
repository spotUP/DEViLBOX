/**
 * Reachability: an edited note in a further note column (a simultaneous note of one voice) goes through
 * exportSoundFactory, the product's edit entry point, into the file; the reparse shows it and every other byte
 * outside that one opcode is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSoundFactoryWithEffects } from '../SoundFactoryParser';
import { exportSoundFactory } from '@/lib/export/SoundFactoryExporter';
import { sfWriterStats } from '../soundFactoryEdits';
import { getColumnField, setColumnField } from '@/lib/tracker/noteColumns';

const DIR = join(process.cwd(), 'public/data/songs/soundfactory');
const exportBytes = async (song: NonNullable<ReturnType<typeof parseSoundFactoryWithEffects>>['song']): Promise<Uint8Array> =>
  new Uint8Array(await (await exportSoundFactory(song)).data.arrayBuffer());

describe('Sound Factory extra note column write-back', () => {
  it('writes an edited note of a further note column and nothing else', async () => {
    const names = [...readdirSync(DIR).filter((n) => n.toLowerCase().endsWith('.psf'))];
    let found = false;
    for (const name of names) {
      const bytes = new Uint8Array(readFileSync(join(DIR, name)));
      const parse = parseSoundFactoryWithEffects(bytes, name);
      if (!parse) continue;
      // A row whose column 2 holds a note that has its own anchored event.
      let hit: { p: number; c: number; r: number; g: number } | undefined;
      parse.colAnchors.forEach((m, c) => m.forEach((list, g) => {
        const p = Math.floor(g / 64), r = g % 64;
        if (!hit && list[0] !== undefined && (getColumnField(parse.song.patterns[p].channels[c].rows[r], 1, 'note') ?? 0) > 0) hit = { p, c, r, g };
      }));
      if (!hit) continue;
      found = true;
      // No-op export stays byte-identical.
      expect(await exportBytes({ ...parse.song, soundFactoryFileData: bytes.buffer.slice(0) } as typeof parse.song)).toEqual(bytes);

      const cell = parse.song.patterns[hit.p].channels[hit.c].rows[hit.r];
      const before = getColumnField(cell, 1, 'note')!;
      const target = before + 2;
      setColumnField(cell, 1, 'note', target);
      const sentinel = sfWriterStats.extraColumnWrites;
      const out = await exportBytes({ ...parse.song, soundFactoryFileData: bytes.buffer.slice(0) } as typeof parse.song);
      expect(sfWriterStats.extraColumnWrites).toBe(sentinel + 1);
      expect(out.length).toBe(bytes.length);
      const diff = out.reduce<number[]>((a, v, i) => (v !== bytes[i] ? a.concat(i) : a), []);
      expect(diff).toEqual([parse.voiceEvents[hit.c][parse.colAnchors[hit.c].get(hit.g)![0]].fileOffset]);
      const re = parseSoundFactoryWithEffects(out, name)!;
      expect(getColumnField(re.song.patterns[hit.p].channels[hit.c].rows[hit.r], 1, 'note')).toBe(target);
      break;
    }
    expect(found).toBe(true);
  });
});
