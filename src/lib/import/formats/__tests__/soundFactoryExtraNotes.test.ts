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

  /** The first row whose column 2 holds an anchored note, in im maien.psf. */
  const load = () => {
    const name = 'im maien.psf';
    const bytes = new Uint8Array(readFileSync(join(DIR, name)));
    const parse = parseSoundFactoryWithEffects(bytes, name)!;
    let hit: { p: number; c: number; r: number; g: number; xi: number } | undefined;
    parse.colAnchors.forEach((m, c) => m.forEach((list, g) => {
      const p = Math.floor(g / 64), r = g % 64;
      if (!hit && list[0] !== undefined && (getColumnField(parse.song.patterns[p].channels[c].rows[r], 1, 'note') ?? 0) > 0) hit = { p, c, r, g, xi: list[0] };
    }));
    return { name, bytes, parse, hit: hit! };
  };
  const diffOf = (a: Uint8Array, b: Uint8Array): number[] => a.reduce<number[]>((d, v, i) => (v !== b[i] ? d.concat(i) : d), []);
  const fresh = (bytes: Uint8Array, parse: ReturnType<typeof load>['parse']) => ({ ...parse.song, soundFactoryFileData: bytes.buffer.slice(0) }) as typeof parse.song;

  it('clears a note of a further note column into a pause and changes only its opcode', async () => {
    const { name, bytes, parse, hit } = load();
    const cell = parse.song.patterns[hit.p].channels[hit.c].rows[hit.r];
    setColumnField(cell, 1, 'note', 0);
    const sentinel = sfWriterStats.extraColumnWrites;
    const out = await exportBytes(fresh(bytes, parse));
    expect(sfWriterStats.extraColumnWrites).toBe(sentinel + 1);
    expect(diffOf(out, bytes)).toEqual([parse.voiceEvents[hit.c][hit.xi].fileOffset]);
    const re = parseSoundFactoryWithEffects(out, name)!;
    expect(getColumnField(re.song.patterns[hit.p].channels[hit.c].rows[hit.r], 1, 'note') ?? 0).toBe(0);
  });

  it('moves the onset of a further note column by shifting the neighbouring durations', async () => {
    const { name, bytes, parse, hit } = load();
    const cell = parse.song.patterns[hit.p].channels[hit.c].rows[hit.r];
    const was = getColumnField(cell, 1, 'delay') ?? 0;
    const ev = parse.voiceEvents[hit.c][hit.xi], prev = parse.voiceEvents[hit.c][hit.xi - 1];
    setColumnField(cell, 1, 'delay', was + 1);
    const sentinel = sfWriterStats.extraColumnWrites;
    const out = await exportBytes(fresh(bytes, parse));
    expect(sfWriterStats.extraColumnWrites).toBe(sentinel + 1);
    // Only the two durations (the low bytes, at opcode + 2) differ, one up and one down by one tick.
    expect(diffOf(out, bytes)).toEqual([prev.fileOffset + 2, ev.fileOffset + 2].sort((x, y) => x - y));
    expect(out[prev.fileOffset + 2]).toBe((bytes[prev.fileOffset + 2] + 1) & 255);
    expect(out[ev.fileOffset + 2]).toBe((bytes[ev.fileOffset + 2] - 1) & 255);
    const re = parseSoundFactoryWithEffects(out, name)!;
    expect(getColumnField(re.song.patterns[hit.p].channels[hit.c].rows[hit.r], 1, 'delay')).toBe(was + 1);
  });

  it('has no write target for an extra-column instrument: the note token is opcode + duration only, so the edit warns', async () => {
    const { bytes, parse, hit } = load();
    const cell = parse.song.patterns[hit.p].channels[hit.c].rows[hit.r];
    const inst = getColumnField(cell, 1, 'instrument') ?? 0;
    setColumnField(cell, 1, 'instrument', inst + 1);
    const res = await exportSoundFactory(fresh(bytes, parse));
    expect(new Uint8Array(await res.data.arrayBuffer())).toEqual(bytes);
    expect(res.warnings.some((w) => w.includes('instrument edits are not written'))).toBe(true);
  });
});
